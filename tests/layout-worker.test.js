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

  test('session-result-committed round-trip transfers and re-receives the terminal buffer', () => {
    const requestId = 61;
    const nodeIds = ['root', 'leaf'];
    const expectedByteLength = nodeIds.length * 2 * Float32Array.BYTES_PER_ELEMENT;

    const responses = [];
    const transfers = [];
    const controller = createWorkerController(
      (message, transferList) => {
        responses.push(message);
        transfers.push(transferList);
      },
    );

    controller.handle({
      type: 'calculate',
      request: {
        requestId,
        mode: 'force-anchors',
        entities: [
          { id: 'root', parentId: null, order: 0 },
          { id: 'leaf', parentId: 'root', order: 1 },
        ],
        config: { ...FORCE_LAYOUT_CONFIG_V2 },
      },
      presentation: 'final-only',
    });

    assert.ok(responses.length >= 1, 'expected at least one response');
    const terminal = responses[responses.length - 1];
    assert.ok(
      terminal.type === 'success' || terminal.type === 'epoch-success',
      `expected terminal success, got ${terminal.type}`,
    );
    assert.ok(
      terminal.terminalFrame,
      'terminal message must carry terminalFrame',
    );

    const terminalBuffer = terminal.terminalFrame.positions.buffer;
    assert.ok(terminalBuffer instanceof ArrayBuffer, 'terminal positions buffer must be an ArrayBuffer');
    assert.equal(terminalBuffer.byteLength, expectedByteLength);

    const terminalTransfer = transfers[transfers.length - 1];
    assert.ok(
      Array.isArray(terminalTransfer) && terminalTransfer[0] === terminalBuffer,
      'terminal message must transfer the buffer',
    );

    responses.length = 0;
    transfers.length = 0;

    const commitBuffer = new ArrayBuffer(expectedByteLength);
    controller.handle({
      type: 'session-result-committed',
      requestId,
      epoch: terminal.epoch,
      terminalBuffer: commitBuffer,
    });

    assert.equal(responses.length, 0, 'session-result-committed must not produce a response');
    assert.equal(transfers.length, 0, 'session-result-committed must not transfer anything');

    const state = controller.getState();
    assert.ok(state, 'controller should still hold active state');
    assert.equal(state.phase, 'retained-settled');
    assert.equal(state.terminalByteLength, 0);
  });

  test('session-result-committed rejects mismatched buffer byte-length', () => {
    const requestId = 62;
    const responses = [];
    const controller = createWorkerController(
      (message) => responses.push(message),
    );

    controller.handle({
      type: 'calculate',
      request: {
        requestId,
        mode: 'force-anchors',
        entities: [
          { id: 'root', parentId: null, order: 0 },
          { id: 'leaf', parentId: 'root', order: 1 },
        ],
        config: { ...FORCE_LAYOUT_CONFIG_V2 },
      },
      presentation: 'final-only',
    });

    const terminal = responses[responses.length - 1];
    assert.ok(
      terminal.type === 'success' || terminal.type === 'epoch-success',
      `expected terminal success, got ${terminal.type}`,
    );

    responses.length = 0;

    controller.handle({
      type: 'session-result-committed',
      requestId,
      epoch: terminal.epoch,
      terminalBuffer: new ArrayBuffer(4),
    });

    assert.equal(responses.length, 1);
    assert.equal(responses[0].type, 'failure');
    assert.equal(responses[0].error.code, 'PROTOCOL_ERROR');
    assert.equal(responses[0].error.details.reason, 'terminal-buffer-mismatch');
    assert.equal(controller.getState(), null, 'controller should release active state on failure');
  });

  test('session-result-committed rejects non-ArrayBuffer terminalBuffer', () => {
    const requestId = 63;
    const responses = [];
    const controller = createWorkerController(
      (message) => responses.push(message),
    );

    controller.handle({
      type: 'calculate',
      request: {
        requestId,
        mode: 'force-anchors',
        entities: [
          { id: 'root', parentId: null, order: 0 },
          { id: 'leaf', parentId: 'root', order: 1 },
        ],
        config: { ...FORCE_LAYOUT_CONFIG_V2 },
      },
      presentation: 'final-only',
    });

    const terminal = responses[responses.length - 1];
    responses.length = 0;

    controller.handle({
      type: 'session-result-committed',
      requestId,
      epoch: terminal.epoch,
      terminalBuffer: new Float32Array(4),
    });

    assert.equal(responses.length, 1);
    assert.equal(responses[0].type, 'failure');
    assert.equal(responses[0].error.code, 'PROTOCOL_ERROR');
    assert.equal(responses[0].error.details.reason, 'terminal-buffer-mismatch');
  });

  test('session-result-committed rejects stale epoch', () => {
    const requestId = 64;
    const responses = [];
    const controller = createWorkerController(
      (message) => responses.push(message),
    );

    controller.handle({
      type: 'calculate',
      request: {
        requestId,
        mode: 'force-anchors',
        entities: [
          { id: 'root', parentId: null, order: 0 },
          { id: 'leaf', parentId: 'root', order: 1 },
        ],
        config: { ...FORCE_LAYOUT_CONFIG_V2 },
      },
      presentation: 'final-only',
    });

    const terminal = responses[responses.length - 1];
    const nodeIds = ['root', 'leaf'];
    const expectedByteLength = nodeIds.length * 2 * Float32Array.BYTES_PER_ELEMENT;
    responses.length = 0;

    controller.handle({
      type: 'session-result-committed',
      requestId,
      epoch: terminal.epoch + 1,
      terminalBuffer: new ArrayBuffer(expectedByteLength),
    });

    assert.equal(responses.length, 1);
    assert.equal(responses[0].type, 'failure');
    assert.equal(responses[0].error.code, 'PROTOCOL_ERROR');
    assert.equal(responses[0].error.details.reason, 'terminal-buffer-mismatch');
  });

  test('final-only emits a ready frame before the terminal', () => {
    const requestId = 70;
    const responses = [];
    const controller = createWorkerController(
      (message) => responses.push(message),
    );

    controller.handle({
      type: 'calculate',
      request: {
        requestId,
        mode: 'force-anchors',
        entities: [
          { id: 'root', parentId: null, order: 0 },
          { id: 'leaf', parentId: 'root', order: 1 },
        ],
        config: { ...FORCE_LAYOUT_CONFIG_V2 },
      },
      presentation: 'final-only',
    });

    assert.ok(responses.length >= 2, `expected at least 2 responses, got ${responses.length}`);
    const ready = responses[0];
    assert.equal(ready.type, 'ready');
    assert.equal(ready.requestId, requestId);
    assert.ok(ready.topology, 'ready frame must carry topology');
    assert.ok(ready.positions instanceof Float32Array, 'ready frame must carry positions');
    assert.equal(ready.epoch, 0);
    assert.equal(ready.globalStep, 0);

    const terminal = responses[responses.length - 1];
    assert.ok(
      terminal.type === 'success' || terminal.type === 'epoch-success',
      `expected terminal success, got ${terminal.type}`,
    );
    assert.ok(terminal.terminalFrame, 'terminal must carry terminalFrame');
  });

  test('final-only ready frame includes valid topology', () => {
    const requestId = 71;
    const responses = [];
    const controller = createWorkerController(
      (message) => responses.push(message),
    );

    controller.handle({
      type: 'calculate',
      request: {
        requestId,
        mode: 'force-anchors',
        entities: [
          { id: 'root', parentId: null, order: 0 },
          { id: 'leaf', parentId: 'root', order: 1 },
        ],
        config: { ...FORCE_LAYOUT_CONFIG_V2 },
      },
      presentation: 'final-only',
    });

    const ready = responses[0];
    assert.equal(ready.type, 'ready');
    assert.equal(ready.topology.requestId, requestId);
    assert.deepEqual(ready.topology.nodeIds, ['root', 'leaf']);
    assert.deepEqual(ready.topology.nodeKinds, ['anchor', 'leaf']);
    assert.ok(Array.isArray(ready.topology.relations));
    assert.equal(ready.topology.relations.length, 1);
    assert.equal(ready.topology.relations[0].sourceIndex, 1);
    assert.equal(ready.topology.relations[0].targetIndex, 0);
  });

  test('final-only positions buffer is the correct size', () => {
    const requestId = 72;
    const responses = [];
    const controller = createWorkerController(
      (message) => responses.push(message),
    );

    controller.handle({
      type: 'calculate',
      request: {
        requestId,
        mode: 'force-anchors',
        entities: [
          { id: 'root', parentId: null, order: 0 },
          { id: 'leaf', parentId: 'root', order: 1 },
        ],
        config: { ...FORCE_LAYOUT_CONFIG_V2 },
      },
      presentation: 'final-only',
    });

    const ready = responses[0];
    const expectedByteLength = 2 * 2 * Float32Array.BYTES_PER_ELEMENT;
    assert.equal(ready.positions.byteLength, expectedByteLength);

    const terminal = responses[responses.length - 1];
    assert.equal(terminal.terminalFrame.positions.byteLength, expectedByteLength);
  });
});
