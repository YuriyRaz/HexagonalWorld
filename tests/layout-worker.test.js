import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { handleWorkerMessage, createWorkerController } from '../src/layout-worker.js';
import { FORCE_LAYOUT_CONFIG_V2 } from '../src/force-layout.js';

function assertPlainCloneSafe(value) {
  assert.deepEqual(structuredClone(value), value);

  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== 'object') continue;

    assert.ok(
      Array.isArray(current) || Object.getPrototypeOf(current) === Object.prototype,
      'transport values must contain only arrays and plain objects',
    );
    pending.push(...Object.values(current));
  }
}

function createRequest(requestId) {
  return {
    requestId,
    mode: 'force-anchors',
    entities: [
      { id: 'root', parentId: null, order: 0 },
      { id: 'leaf', parentId: 'root', order: 1 },
    ],
    config: { version: 1 },
  };
}

function createResult(requestId) {
  return {
    requestId,
    mode: 'force-anchors',
    placements: [{ entityId: 'leaf', q: 0, r: 0 }],
    springs: [],
    gridRadius: 0,
    stats: { occupiedCount: 1, boundaryGaps: [] },
    diagnostics: {
      kind: 'force',
      iterations: 256,
      assignmentEpochs: 1,
      proposalCount: 1,
      converged: true,
      maxTargetError: 0,
      rmsTargetError: 0,
      maxAnchorVelocity: 0,
    },
  };
}

describe('layout worker message boundary', () => {
  test('calculates exactly once and posts a plain clone-safe success with matching IDs', () => {
    const request = createRequest(17);
    const result = createResult(17);
    const responses = [];
    let calculateCalls = 0;

    handleWorkerMessage(
      { type: 'calculate', request },
      (response) => responses.push(response),
      (receivedRequest) => {
        calculateCalls += 1;
        assert.strictEqual(receivedRequest, request);
        return result;
      },
    );

    assert.equal(calculateCalls, 1);
    assert.deepEqual(responses, [{ type: 'success', requestId: 17, result }]);
    assert.equal(responses[0].requestId, responses[0].result.requestId);
    assertPlainCloneSafe(responses[0]);
  });

  test('serializes a typed calculation failure without transporting the Error object', () => {
    const request = createRequest(23);
    const responses = [];
    const failure = new Error('calculation diagnostic must not cross the boundary');
    failure.code = 'NOT_CONVERGED';
    failure.details = { stableEpochs: 1, requiredStableEpochs: 3 };

    handleWorkerMessage(
      { type: 'calculate', request },
      (response) => responses.push(response),
      () => {
        throw failure;
      },
    );

    assert.deepEqual(responses, [{
      type: 'failure',
      requestId: 23,
      error: {
        code: 'NOT_CONVERGED',
        details: { stableEpochs: 1, requiredStableEpochs: 3 },
      },
    }]);
    assertPlainCloneSafe(responses[0]);
    assert.equal('message' in responses[0].error, false);
    assert.equal('stack' in responses[0].error, false);
  });

  test('ignores malformed and unknown messages without calculating or posting', () => {
    let calculateCalls = 0;
    const responses = [];
    const calculate = () => {
      calculateCalls += 1;
    };
    const postMessage = (response) => responses.push(response);

    for (const message of [
      null,
      {},
      { type: 'calculate' },
      { type: 'calculate', request: null },
      { type: 'cancel', request: createRequest(31) },
    ]) {
      assert.doesNotThrow(() => handleWorkerMessage(message, postMessage, calculate));
    }

    assert.equal(calculateCalls, 0);
    assert.deepEqual(responses, []);
  });

  test('treats result/request ID disagreement as a production-safe internal failure', () => {
    const responses = [];

    handleWorkerMessage(
      { type: 'calculate', request: createRequest(37) },
      (response) => responses.push(response),
      () => createResult(38),
    );

    assert.deepEqual(responses, [{
      type: 'failure',
      requestId: 37,
      error: { code: 'INTERNAL_ERROR', details: {} },
    }]);
    assertPlainCloneSafe(responses[0]);
  });

  test('maps unexpected exceptions to INTERNAL_ERROR without message or stack leakage', () => {
    const responses = [];
    const secret = 'sensitive implementation detail';
    const unexpected = new Error(secret);
    unexpected.stack = `Error: ${secret}\n    at private/source.js:99:1`;

    handleWorkerMessage(
      { type: 'calculate', request: createRequest(41) },
      (response) => responses.push(response),
      () => {
        throw unexpected;
      },
    );

    assert.deepEqual(responses, [{
      type: 'failure',
      requestId: 41,
      error: { code: 'INTERNAL_ERROR', details: {} },
    }]);
    assertPlainCloneSafe(responses[0]);
    const productionResponse = JSON.stringify(responses[0]);
    assert.equal(productionResponse.includes(secret), false);
    assert.equal(productionResponse.includes('private/source.js'), false);
    assert.equal('message' in responses[0].error, false);
    assert.equal('stack' in responses[0].error, false);
  });

  test('preserves code and details from non-ForceLayoutError errors', () => {
    const responses = [];
    const typed = new Error('typed diagnostic');
    typed.code = 'CUSTOM_ERROR';
    typed.details = { reason: 'test', count: 42 };

    handleWorkerMessage(
      { type: 'calculate', request: createRequest(51) },
      (response) => responses.push(response),
      () => {
        throw typed;
      },
    );

    assert.deepEqual(responses, [{
      type: 'failure',
      requestId: 51,
      error: { code: 'CUSTOM_ERROR', details: { reason: 'test', count: 42 } },
    }]);
    assertPlainCloneSafe(responses[0]);
    assert.equal('message' in responses[0].error, false);
  });

  test('preserves code from error-like objects without class constraints', () => {
    const responses = [];
    const plain = { code: 'PLAIN_FAILURE', details: { step: 7 }, message: 'ignored' };

    handleWorkerMessage(
      { type: 'calculate', request: createRequest(53) },
      (response) => responses.push(response),
      () => {
        throw plain;
      },
    );

    assert.deepEqual(responses, [{
      type: 'failure',
      requestId: 53,
      error: { code: 'PLAIN_FAILURE', details: { step: 7 } },
    }]);
    assertPlainCloneSafe(responses[0]);
    assert.equal('message' in responses[0].error, false);
  });

  test('preserves falsy-but-defined code values instead of overriding them', () => {
    const responses = [];
    const emptyCode = new Error('empty code');
    emptyCode.code = '';
    emptyCode.details = { info: true };

    handleWorkerMessage(
      { type: 'calculate', request: createRequest(55) },
      (response) => responses.push(response),
      () => {
        throw emptyCode;
      },
    );

    assert.deepEqual(responses, [{
      type: 'failure',
      requestId: 55,
      error: { code: '', details: { info: true } },
    }]);
    assertPlainCloneSafe(responses[0]);
  });

  test('final-only suppresses ready and intermediate frames and emits one typed terminal settlement', () => {
    const requestId = 70;
    const responses = [];
    const scheduled = [];
    const controller = createWorkerController(
      (message, transfer) => responses.push({ message, transfer }),
      undefined,
      undefined,
      (callback) => { scheduled.push(callback); return callback; },
      () => {},
    );
    controller.handle({
      type: 'calculate',
      request: {
        requestId,
        mode: 'force-anchors',
        entities: [{ id: 'root', parentId: null, order: 0 }, { id: 'leaf', parentId: 'root', order: 1 }],
        config: { ...FORCE_LAYOUT_CONFIG_V2 },
      },
      presentation: 'final-only',
    });

    assert.equal(responses.length, 0);
    while (responses.length === 0) scheduled.shift()();
    assert.equal(responses.length, 1);
    const { message, transfer } = responses[0];
    assert.equal(message.type, 'success');
    assert.equal(message.terminalFrame.terminal, 'converged');
    assert.ok(message.terminalFrame.positions instanceof Float32Array);
    assert.ok(message.terminalFrame.leafCells instanceof Int16Array);
    assert.deepEqual(transfer, [message.terminalFrame.positions.buffer, message.terminalFrame.leafCells.buffer]);
  });

  test('all-steps emits canonical typed ready and step frames only after dual-buffer receipts', () => {
    const requestId = 81;
    const responses = [];
    const controller = createWorkerController((message, transfer) => responses.push({ message, transfer }));
    controller.handle({
      type: 'calculate',
      request: {
        requestId,
        mode: 'force-anchors',
        entities: [{ id: 'root', parentId: null, order: 0 }, { id: 'leaf', parentId: 'root', order: 1 }],
        config: { ...FORCE_LAYOUT_CONFIG_V2 },
      },
      presentation: 'all-steps',
    });
    const ready = responses[0].message;
    assert.equal(ready.type, 'ready');
    assert.ok(ready.leafCells instanceof Int16Array);
    responses.length = 0;
    controller.handle({
      type: 'painted',
      requestId,
      globalStep: ready.globalStep,
      positionBuffer: ready.positions.buffer,
      cellBuffer: ready.leafCells.buffer,
    });
    assert.equal(responses[0].message.type, 'step');
    assert.ok(responses[0].message.leafCells instanceof Int16Array);
    assert.equal(responses[0].transfer.length, 2);
  });

  test('rejects a receipt missing the exact cell buffer before advancing', () => {
    const requestId = 82;
    const responses = [];
    const controller = createWorkerController((message) => responses.push(message));
    controller.handle({
      type: 'calculate',
      request: {
        requestId,
        mode: 'force-anchors',
        entities: [{ id: 'root', parentId: null, order: 0 }, { id: 'leaf', parentId: 'root', order: 1 }],
        config: { ...FORCE_LAYOUT_CONFIG_V2 },
      },
    });
    const ready = responses.shift();
    controller.handle({
      type: 'painted',
      requestId,
      globalStep: 0,
      positionBuffer: ready.positions.buffer,
    });
    assert.equal(responses[0].type, 'failure');
    assert.equal(responses[0].error.code, 'PROTOCOL_ERROR');
    assert.equal(controller.getState(), null);
  });

  test('cancels scheduled final-only calculation without publishing a frame', () => {
    const requestId = 83;
    const responses = [];
    const scheduled = [];
    const cancelled = [];
    const controller = createWorkerController(
      (message) => responses.push(message),
      undefined,
      undefined,
      (callback) => { scheduled.push(callback); return callback; },
      (callback) => cancelled.push(callback),
    );
    controller.handle({
      type: 'calculate',
      request: {
        requestId,
        mode: 'force-anchors',
        entities: [{ id: 'root', parentId: null, order: 0 }, { id: 'leaf', parentId: 'root', order: 1 }],
        config: { ...FORCE_LAYOUT_CONFIG_V2 },
      },
      presentation: 'final-only',
    });
    controller.handle({ type: 'cancel', requestId });
    assert.deepEqual(cancelled, scheduled);
    assert.equal(controller.getState(), null);
    assert.equal(responses.length, 0);
  });

  test('dual position/cell buffer transfer, exact painted/suppress receipts, and active calculation cancellation cleanup', () => {
    const requestId = 99;
    const responses = [];
    const controller = createWorkerController((msg, transfer) => {
      responses.push({ msg, transfer });
    });

    controller.handle({
      type: 'calculate',
      request: {
        requestId,
        mode: 'force-anchors',
        entities: [
          { id: 'root', parentId: null, order: 0 },
          { id: 'leaf-a', parentId: 'root', order: 1 },
          { id: 'leaf-b', parentId: 'root', order: 2 },
        ],
        config: { ...FORCE_LAYOUT_CONFIG_V2 },
      },
      presentation: 'all-steps',
    });

    assert.ok(responses.length >= 1);
    const readyMsg = responses[0].msg;
    assert.equal(readyMsg.type, 'ready');
    assert.ok(readyMsg.positions instanceof Float32Array);
    assert.ok(readyMsg.leafCells instanceof Int16Array);
    assert.equal(responses[0].transfer.length, 2);
    assert.equal(responses[0].transfer[0], readyMsg.positions.buffer);
    assert.equal(responses[0].transfer[1], readyMsg.leafCells.buffer);

    responses.length = 0;
    controller.handle({
      type: 'cancel',
      requestId,
    });

    assert.equal(controller.getState(), null);
  });
});
