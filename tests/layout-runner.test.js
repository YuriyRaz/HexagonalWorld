import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { describe, test } from 'node:test';

import { createLayoutRunner } from '../src/layout-runner.js';

const FORCE_MODE = 'force-anchors';
const WORKER_EVENTS = ['error', 'message', 'messageerror'];

class FakeWorker {
  constructor({ onPostMessage, onTerminate } = {}) {
    this.listeners = new Map();
    this.addCalls = [];
    this.removeCalls = [];
    this.postedMessages = [];
    this.terminateCalls = 0;
    this.onPostMessage = onPostMessage;
    this.onTerminate = onTerminate;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    this.addCalls.push({ type, listener });
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
    this.removeCalls.push({ type, listener });
  }

  postMessage(message) {
    this.postedMessages.push(message);
    this.onPostMessage?.(message);
  }

  terminate() {
    this.terminateCalls += 1;
    this.onTerminate?.();
  }

  emit(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  emitMessage(data) {
    this.emit('message', { data });
  }
}

class ControlledTimers {
  constructor() {
    this.nextId = 1;
    this.setCalls = [];
    this.clearCalls = [];
  }

  setTimer = (callback, delay) => {
    const timer = { id: this.nextId, callback, delay, cleared: false, fired: false };
    this.nextId += 1;
    this.setCalls.push(timer);
    return timer;
  };

  clearTimer = (timer) => {
    timer.cleared = true;
    this.clearCalls.push(timer);
  };

  fire(timer = this.setCalls.at(-1)) {
    assert.ok(timer, 'expected a scheduled timer');
    assert.equal(timer.cleared, false, 'cannot fire a cleared timer');
    assert.equal(timer.fired, false, 'timer must fire at most once');
    timer.fired = true;
    timer.callback();
  }
}

function buildSmallRequest(requestId = 1) {
  return {
    requestId,
    mode: FORCE_MODE,
    entities: [
      { id: 'root', parentId: null, order: 0 },
      { id: 'group', parentId: 'root', order: 1 },
      { id: 'leaf-a', parentId: 'group', order: 2 },
      { id: 'leaf-z', parentId: 'group', order: 2 },
    ],
    config: { version: 1 },
  };
}

function endpoint(kind, entityId, q, r) {
  return { kind, entityId, q, r };
}

function buildSmallResult(request = buildSmallRequest()) {
  return {
    requestId: request.requestId,
    mode: request.mode,
    placements: [
      { entityId: 'leaf-a', q: 0, r: 0 },
      { entityId: 'leaf-z', q: 1, r: 0 },
    ],
    springs: [
      {
        source: endpoint('anchor', 'group', 0.5, 0),
        target: endpoint('anchor', 'root', 0.25, 0),
      },
      {
        source: endpoint('leaf', 'leaf-a', 0, 0),
        target: endpoint('anchor', 'group', 0.5, 0),
      },
      {
        source: endpoint('leaf', 'leaf-z', 1, 0),
        target: endpoint('anchor', 'group', 0.5, 0),
      },
    ],
    gridRadius: 1,
    stats: {
      occupiedCount: 2,
      boundaryGaps: [
        { depth: 0, averageNearestGap: null },
        { depth: 1, averageNearestGap: null },
      ],
    },
    diagnostics: {
      kind: 'force',
      iterations: 256,
      assignmentEpochs: 2,
      proposalCount: 4,
      converged: true,
      maxTargetError: 0,
      rmsTargetError: 0,
      maxAnchorVelocity: 0,
    },
  };
}

function axialCells(radius, count) {
  const cells = [];
  for (let q = -radius; q <= radius && cells.length < count; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR && cells.length < count; r += 1) {
      cells.push({ q, r });
    }
  }
  assert.equal(cells.length, count);
  return cells;
}

function buildMaximumResultFixture(requestId = 900) {
  const groupCount = 1199;
  const leafCount = 4800;
  const entities = [{ id: 'root', parentId: null, order: 0 }];

  for (let index = 0; index < groupCount; index += 1) {
    entities.push({
      id: `group-${String(index).padStart(4, '0')}`,
      parentId: 'root',
      order: entities.length,
    });
  }

  const cells = axialCells(40, leafCount);
  cells[0] = { q: 256, r: 0 };
  const placements = [];
  for (let index = 0; index < leafCount; index += 1) {
    const groupId = `group-${String(index % groupCount).padStart(4, '0')}`;
    const entityId = `leaf-${String(index).padStart(4, '0')}`;
    entities.push({ id: entityId, parentId: groupId, order: entities.length });
    placements.push({ entityId, ...cells[index] });
  }

  const springs = [];
  for (let index = 0; index < groupCount; index += 1) {
    const groupId = `group-${String(index).padStart(4, '0')}`;
    springs.push({
      source: endpoint('anchor', groupId, 0, 0),
      target: endpoint('anchor', 'root', 0, 0),
    });
  }
  for (let index = 0; index < leafCount; index += 1) {
    const groupId = `group-${String(index % groupCount).padStart(4, '0')}`;
    const placement = placements[index];
    springs.push({
      source: endpoint('leaf', placement.entityId, placement.q, placement.r),
      target: endpoint('anchor', groupId, 0, 0),
    });
  }

  const request = { requestId, mode: FORCE_MODE, entities, config: { version: 1 } };
  const result = {
    requestId,
    mode: FORCE_MODE,
    placements,
    springs,
    gridRadius: 256,
    stats: {
      occupiedCount: leafCount,
      boundaryGaps: [
        { depth: 0, averageNearestGap: null },
        { depth: 1, averageNearestGap: 0 },
      ],
    },
    diagnostics: {
      kind: 'force',
      iterations: 256,
      assignmentEpochs: 1,
      proposalCount: leafCount,
      converged: true,
      maxTargetError: 0,
      rmsTargetError: 0,
      maxAnchorVelocity: 0,
    },
  };

  assert.equal(entities.length, 6000);
  assert.equal(springs.length, 5999);
  return { request, result };
}

function successResponse(result) {
  return { type: 'success', requestId: result.requestId, result };
}

function makeHarness(options = {}) {
  const timers = options.timers ?? new ControlledTimers();
  const workers = [];
  const factoryCalls = [];
  const workerFactory = options.workerFactory ?? ((...args) => {
    factoryCalls.push(args);
    const worker = options.makeWorker?.() ?? new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const runner = createLayoutRunner({
    workerFactory,
    hangGuardMs: options.hangGuardMs,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    environmentCheck: options.environmentCheck ?? (() => true),
  });
  return { runner, timers, workers, factoryCalls };
}

function assertOperationError(error, { requestId, code, silent }) {
  assert.equal(error?.requestId, requestId);
  assert.equal(error?.code, code);
  assert.equal(error?.silent, silent);
  assert.ok(error.details && typeof error.details === 'object' && !Array.isArray(error.details));
  return true;
}

function assertWorkerCleaned(worker, timers) {
  assert.deepEqual(worker.addCalls.map(({ type }) => type).sort(), WORKER_EVENTS);
  assert.deepEqual(worker.removeCalls.map(({ type }) => type).sort(), WORKER_EVENTS);
  for (const { type, listener } of worker.addCalls) {
    const matchingRemovals = worker.removeCalls.filter((call) => (
      call.type === type && call.listener === listener
    ));
    assert.equal(matchingRemovals.length, 1, `${type} listener must be removed exactly once`);
  }
  assert.equal(timers.setCalls.length, 1);
  assert.deepEqual(timers.clearCalls, [timers.setCalls[0]]);
  assert.equal(worker.terminateCalls, 1);
}

async function rejectResponse(response, request = buildSmallRequest()) {
  const harness = makeHarness();
  const promise = harness.runner.runLayout(request);
  const worker = harness.workers[0];
  worker.emitMessage(response);
  await assert.rejects(promise, (error) => assertOperationError(error, {
    requestId: request.requestId,
    code: 'WORKER_MESSAGE_FAILED',
    silent: false,
  }));
  assertWorkerCleaned(worker, harness.timers);
}

describe('createLayoutRunner dispatch', () => {
  test('calculates legacy modes without environment preflight, worker, or timer dispatch', async () => {
    let environmentChecks = 0;
    const timers = new ControlledTimers();
    const runner = createLayoutRunner({
      workerFactory: () => assert.fail('legacy dispatch must not create a worker'),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      environmentCheck: () => {
        environmentChecks += 1;
        return false;
      },
    });
    const request = { ...buildSmallRequest(10), mode: 'flat', config: null };

    const promise = runner.runLayout(request);

    assert.ok(promise instanceof Promise);
    const result = await promise;
    assert.equal(result.requestId, request.requestId);
    assert.equal(result.mode, request.mode);
    assert.deepEqual(result.placements.map(({ entityId }) => entityId), ['leaf-a', 'leaf-z']);
    assert.deepEqual(result.springs, []);
    assert.deepEqual(result.diagnostics, { kind: 'legacy', iterations: 0, converged: true });
    assert.equal(environmentChecks, 0);
    assert.equal(timers.setCalls.length, 0);
  });

  test('dispatches force requests to a fresh module worker', async () => {
    const request = buildSmallRequest(11);
    const result = buildSmallResult(request);
    const { runner, workers, factoryCalls, timers } = makeHarness();

    const promise = runner.runLayout(request);
    const worker = workers[0];

    assert.equal(factoryCalls.length, 1);
    assert.equal(factoryCalls[0][0] instanceof URL, true);
    assert.match(factoryCalls[0][0].pathname.replaceAll('\\', '/'), /\/src\/layout-worker\.js$/);
    assert.deepEqual(factoryCalls[0][1], { type: 'module' });
    assert.deepEqual(worker.postedMessages, [{ type: 'calculate', request }]);

    worker.emitMessage(successResponse(result));
    assert.deepEqual(await promise, result);
    assertWorkerCleaned(worker, timers);
  });

  test('uses the production 60000 ms hang guard by default', async () => {
    const request = buildSmallRequest(12);
    const { runner, timers, workers } = makeHarness();
    const promise = runner.runLayout(request);
    const rejection = assert.rejects(promise, (error) => assertOperationError(error, {
      requestId: request.requestId,
      code: 'CANCELLED',
      silent: true,
    }));

    assert.equal(timers.setCalls[0].delay, 60000);
    runner.cancelActiveLayout('test cleanup');
    await rejection;
    assertWorkerCleaned(workers[0], timers);
  });
});

describe('force result revalidation', () => {
  test('accepts complete results at the 5,999-spring and radius-256 limits', async () => {
    const { request, result } = buildMaximumResultFixture();
    const { runner, workers, timers } = makeHarness();

    const promise = runner.runLayout(request);
    workers[0].emitMessage(successResponse(result));

    const received = await promise;
    assert.equal(received.placements.length, 4800);
    assert.equal(received.springs.length, 5999);
    assert.equal(received.gridRadius, 256);
    assertWorkerCleaned(workers[0], timers);
  });

  const invalidResults = [
    ['response request ID', (response) => { response.requestId += 1; }],
    ['result request ID', (response) => { response.result.requestId += 1; }],
    ['result mode', (response) => { response.result.mode = 'flat'; }],
    ['placement cardinality', (response) => { response.result.placements.pop(); }],
    ['placement order', (response) => { response.result.placements.reverse(); }],
    ['unique occupied cells', (response) => {
      response.result.placements[1].q = response.result.placements[0].q;
      response.result.placements[1].r = response.result.placements[0].r;
    }],
    ['integer placement coordinates', (response) => { response.result.placements[0].q = 0.5; }],
    ['maximum grid radius', (response) => { response.result.gridRadius = 257; }],
    ['occupied count', (response) => { response.result.stats.occupiedCount = 1; }],
    ['finite diagnostics', (response) => { response.result.diagnostics.maxTargetError = Infinity; }],
    ['spring cardinality', (response) => { response.result.springs.pop(); }],
    ['spring order', (response) => { response.result.springs.reverse(); }],
    ['immediate-parent spring chain', (response) => {
      response.result.springs[1].target.entityId = 'root';
    }],
    ['leaf endpoint position', (response) => { response.result.springs[1].source.q = 9; }],
    ['5,999 spring maximum', (response) => {
      response.result.springs = Array.from(
        { length: 6000 },
        () => structuredClone(response.result.springs[0]),
      );
    }],
  ];

  for (const [name, mutate] of invalidResults) {
    test(`rejects an invalid ${name}`, async () => {
      const request = buildSmallRequest(100);
      const response = successResponse(buildSmallResult(request));
      mutate(response);
      await rejectResponse(response, request);
    });
  }
});

describe('runner failures', () => {
  test('rejects unsupported worker environments before construction', async () => {
    let factoryCalls = 0;
    const timers = new ControlledTimers();
    const runner = createLayoutRunner({
      workerFactory: () => {
        factoryCalls += 1;
        return new FakeWorker();
      },
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      environmentCheck: () => false,
    });
    const request = buildSmallRequest(201);

    await assert.rejects(runner.runLayout(request), (error) => assertOperationError(error, {
      requestId: request.requestId,
      code: 'UNSUPPORTED_ENVIRONMENT',
      silent: false,
    }));
    assert.equal(factoryCalls, 0);
    assert.equal(timers.setCalls.length, 0);
  });

  test('normalizes worker constructor failures', async () => {
    const request = buildSmallRequest(202);
    const runner = createLayoutRunner({
      workerFactory: () => { throw new Error('constructor failed'); },
      environmentCheck: () => true,
    });

    await assert.rejects(runner.runLayout(request), (error) => assertOperationError(error, {
      requestId: request.requestId,
      code: 'WORKER_START_FAILED',
      silent: false,
    }));
  });

  test('normalizes postMessage failures and releases acquired resources', async () => {
    const request = buildSmallRequest(203);
    const timers = new ControlledTimers();
    const worker = new FakeWorker({
      onPostMessage: () => { throw new Error('clone failed'); },
    });
    const runner = createLayoutRunner({
      workerFactory: () => worker,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      environmentCheck: () => true,
    });

    await assert.rejects(runner.runLayout(request), (error) => assertOperationError(error, {
      requestId: request.requestId,
      code: 'WORKER_MESSAGE_FAILED',
      silent: false,
    }));
    assertWorkerCleaned(worker, timers);
  });

  test('passes through a well-formed worker failure message', async () => {
    const request = buildSmallRequest(204);
    const { runner, workers, timers } = makeHarness();
    const promise = runner.runLayout(request);

    workers[0].emitMessage({
      type: 'failure',
      requestId: request.requestId,
      error: { code: 'NOT_CONVERGED', details: { stableEpochs: 1, requiredStableEpochs: 3 } },
    });

    await assert.rejects(promise, (error) => {
      assertOperationError(error, {
        requestId: request.requestId,
        code: 'NOT_CONVERGED',
        silent: false,
      });
      assert.deepEqual(error.details, { stableEpochs: 1, requiredStableEpochs: 3 });
      return true;
    });
    assertWorkerCleaned(workers[0], timers);
  });

  for (const eventType of ['error', 'messageerror']) {
    test(`normalizes worker ${eventType} events`, async () => {
      const request = buildSmallRequest(eventType === 'error' ? 205 : 206);
      const { runner, workers, timers } = makeHarness();
      const promise = runner.runLayout(request);
      workers[0].emit(eventType, { message: `${eventType} transport failure` });

      await assert.rejects(promise, (error) => assertOperationError(error, {
        requestId: request.requestId,
        code: 'WORKER_MESSAGE_FAILED',
        silent: false,
      }));
      assertWorkerCleaned(workers[0], timers);
    });
  }

  for (const [name, response] of [
    ['null response', null],
    ['unknown response type', { type: 'wat', requestId: 207 }],
    ['incomplete success', { type: 'success', requestId: 207 }],
    ['incomplete failure', { type: 'failure', requestId: 207, error: { details: {} } }],
  ]) {
    test(`rejects malformed ${name}`, async () => {
      await rejectResponse(response, buildSmallRequest(207));
    });
  }

  test('expires an injected 50 ms guard using controlled time', async () => {
    const request = buildSmallRequest(208);
    const { runner, workers, timers } = makeHarness({ hangGuardMs: 50 });
    const promise = runner.runLayout(request);

    assert.equal(timers.setCalls[0].delay, 50);
    timers.fire();

    await assert.rejects(promise, (error) => assertOperationError(error, {
      requestId: request.requestId,
      code: 'TIMEOUT',
      silent: false,
    }));
    assertWorkerCleaned(workers[0], timers);
  });
});

describe('cancellation and ownership', () => {
  test('silently rejects before terminating on supersession and ignores stale responses', async () => {
    const firstRequest = buildSmallRequest(301);
    const secondRequest = buildSmallRequest(302);
    const { runner, workers, timers } = makeHarness();
    const firstPromise = runner.runLayout(firstRequest);
    const firstRejection = assert.rejects(firstPromise, (error) => {
      assertOperationError(error, {
        requestId: firstRequest.requestId,
        code: 'CANCELLED',
        silent: true,
      });
      assert.equal(error.details.reason, 'superseded');
      return true;
    });
    let rejectedBeforeTerminate = false;
    workers[0].onTerminate = () => {
      rejectedBeforeTerminate = inspect(firstPromise).includes('<rejected>');
    };

    const secondPromise = runner.runLayout(secondRequest);
    let secondSettled = false;
    secondPromise.then(
      () => { secondSettled = true; },
      () => { secondSettled = true; },
    );
    await firstRejection;

    assert.equal(rejectedBeforeTerminate, true);
    assertWorkerCleaned(workers[0], {
      setCalls: [timers.setCalls[0]],
      clearCalls: [timers.clearCalls[0]],
    });
    workers[0].emitMessage(successResponse(buildSmallResult(firstRequest)));
    await Promise.resolve();
    assert.equal(secondSettled, false);

    const secondResult = buildSmallResult(secondRequest);
    workers[1].emitMessage(successResponse(secondResult));
    assert.deepEqual(await secondPromise, secondResult);
    assert.equal(timers.clearCalls[1], timers.setCalls[1]);
    assert.equal(workers[1].terminateCalls, 1);
  });

  test('cancelActiveLayout uses the supplied silent reason and cleans exactly once', async () => {
    const request = buildSmallRequest(303);
    const { runner, workers, timers } = makeHarness();
    const promise = runner.runLayout(request);
    const rejection = assert.rejects(promise, (error) => {
      assertOperationError(error, {
        requestId: request.requestId,
        code: 'CANCELLED',
        silent: true,
      });
      assert.equal(error.details.reason, 'mode changed');
      return true;
    });

    runner.cancelActiveLayout('mode changed');
    runner.cancelActiveLayout('ignored repeat');
    await rejection;
    runner.dispose();

    assertWorkerCleaned(workers[0], timers);
  });

  test('dispose silently cancels active work and is idempotent', async () => {
    const request = buildSmallRequest(304);
    const { runner, workers, timers } = makeHarness();
    const promise = runner.runLayout(request);
    const rejection = assert.rejects(promise, (error) => assertOperationError(error, {
      requestId: request.requestId,
      code: 'CANCELLED',
      silent: true,
    }));

    runner.dispose();
    runner.dispose();
    await rejection;

    assertWorkerCleaned(workers[0], timers);
  });

  for (const outcome of ['success', 'failure']) {
    test(`${outcome} cleanup remains exactly once after late events and disposal`, async () => {
      const request = buildSmallRequest(outcome === 'success' ? 305 : 306);
      const { runner, workers, timers } = makeHarness();
      const promise = runner.runLayout(request);
      const worker = workers[0];

      if (outcome === 'success') {
        worker.emitMessage(successResponse(buildSmallResult(request)));
        await promise;
      } else {
        worker.emitMessage({
          type: 'failure',
          requestId: request.requestId,
          error: { code: 'NOT_CONVERGED', details: {} },
        });
        await assert.rejects(promise);
      }

      worker.emit('error', { message: 'late error' });
      worker.emit('messageerror', { message: 'late messageerror' });
      worker.emitMessage(successResponse(buildSmallResult(request)));
      runner.cancelActiveLayout();
      runner.dispose();
      runner.dispose();

      assertWorkerCleaned(worker, timers);
    });
  }
});
