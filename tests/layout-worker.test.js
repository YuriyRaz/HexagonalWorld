import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { handleWorkerMessage } from '../src/layout-worker.js';

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
});
