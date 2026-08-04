import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { normalizeHierarchy } from '../src/data.js';
import {
  FORCE_LAYOUT_CONFIG,
  FORCE_LAYOUT_CONFIG_V2,
  ForceLayoutError,
  calculateForceLayout,
  createForceLayoutSession,
  mulberry32,
} from '../src/force-layout.js';
import { axialToPlane, quantize } from '../src/hex.js';
import {
  buildCycleHierarchy,
  buildDepthSeventeenHierarchy,
  buildGroupingHierarchy,
  buildSingleRootLeafHierarchy,
  buildSixThousandLinkHierarchy,
} from './fixtures/hierarchies.js';

function request(entities = buildSingleRootLeafHierarchy(), overrides = {}) {
  return {
    requestId: 17,
    mode: 'force-anchors',
    entities,
    config: structuredClone(FORCE_LAYOUT_CONFIG_V2),
    ...overrides,
  };
}

function settle(session) {
  let frame = session.initialFrame();
  while (frame.terminal === 'none') frame = session.advanceOneStep();
  return frame;
}

function snapshotForceState(session) {
  return {
    phase: session.state.phase,
    globalStep: session.state.globalStep,
    epoch: session.state.epoch,
    coolingStep: session.state.coolingStep,
    acceptedCommandSeq: session.state.acceptedCommandSeq,
    assignmentHash: session.initialFrame().assignmentHash,
    nodes: session.nodes.map(({ x, y, vx, vy, fx, fy }) => ({ x, y, vx, vy, fx, fy })),
    transcript: structuredClone(session.transcript),
  };
}

describe('version-2 public calculation', () => {
  test('uses one deeply frozen V2 configuration and a thin synchronous session adapter', () => {
    assert.strictEqual(FORCE_LAYOUT_CONFIG, FORCE_LAYOUT_CONFIG_V2);
    assert.equal(FORCE_LAYOUT_CONFIG.version, 2);
    assert.equal(Object.isFrozen(FORCE_LAYOUT_CONFIG), true);
    assert.equal(Object.isFrozen(FORCE_LAYOUT_CONFIG.alphaSchedule), true);
    assert.equal(
      FORCE_LAYOUT_CONFIG.alphaSchedule.decay,
      1 - Math.pow(
        FORCE_LAYOUT_CONFIG.alphaSchedule.minimum / FORCE_LAYOUT_CONFIG.alphaSchedule.initial,
        1 / FORCE_LAYOUT_CONFIG.maxCoolingSteps,
      ),
    );

    const result = calculateForceLayout(request());
    assert.equal(result.diagnostics.version, 2);
    assert.equal(result.diagnostics.terminationReason, 'CONVERGED');
    assert.equal(result.diagnostics.coolingStep, 39);
  });

  test('does not mutate frozen input and remains deterministic', () => {
    const input = request();
    const expected = structuredClone(input);
    Object.freeze(input.entities[0]);
    Object.freeze(input.entities);
    Object.freeze(input.config);
    Object.freeze(input);

    const first = calculateForceLayout(input);
    const second = calculateForceLayout(request());
    assert.deepEqual(input, expected);
    assert.deepEqual(second, first);
  });

  test('rejects cycles and unsupported link scale through typed boundaries', () => {
    assert.throws(
      () => createForceLayoutSession(request(buildCycleHierarchy())),
      (error) => error instanceof ForceLayoutError
        && error.code === 'INVALID_HIERARCHY'
        && error.details.reason === 'CYCLE',
    );
    assert.throws(
      () => createForceLayoutSession(request(buildSixThousandLinkHierarchy())),
      (error) => error instanceof ForceLayoutError
        && error.code === 'UNSUPPORTED_SCALE'
        && error.details.violations.some(({ measure }) => measure === 'activeLinkCount'),
    );
  });

  test('keeps the seeded random source deterministic', () => {
    const first = mulberry32(0x5eed003);
    const second = mulberry32(0x5eed003);
    for (let index = 0; index < 16; index += 1) assert.equal(first(), second());
  });
});

describe('unbounded hierarchy depth', () => {
  test('accepts depth 17 while retaining the aggregate membership scale limit', () => {
    const entities = buildDepthSeventeenHierarchy();
    const normalized = normalizeHierarchy(entities);
    assert.equal(normalized.analysis.counts.maxDepth, 17);

    const session = createForceLayoutSession(request(entities));
    assert.equal(session.topology().nodeIds.length, 18);
    session.dispose();
  });
});

describe('exact quantization and canonical control radius', () => {
  test('uses JavaScript Math.round ties including negative half ties', () => {
    assert.equal(quantize(1.25, 0.5), 1.5);
    assert.equal(quantize(-1.25, 0.5), -1);
    assert.equal(quantize(-0.0000005, 0.000001), 0);
  });

  test('canonicalizes plane coordinates before inclusive quantized axial-radius validation', () => {
    const session = createForceLayoutSession(request());
    settle(session);
    const boundary = axialToPlane(256, 0);
    const submittedX = boundary.x + 0.0000004;
    assert.equal(session.enqueueControl({
      requestId: 17,
      commandSeq: 1,
      action: 'set-fixed-position',
      entityId: 'single-root-leaf',
      x: submittedX,
      y: boundary.z,
    }), null);
    const held = session.advanceOneStep();
    assert.equal(held.controlReceipts[0].accepted, true);
    assert.equal(session.transcript[0].x, quantize(submittedX, 0.000001));

    const release = session.enqueueControl({
      requestId: 17,
      commandSeq: 2,
      action: 'release-fixed-position',
      entityId: 'single-root-leaf',
    });
    assert.equal(release, null);
    session.advanceOneStep();

    const outside = axialToPlane(256.001, 0);
    const rejected = session.enqueueControl({
      requestId: 17,
      commandSeq: 3,
      action: 'set-fixed-position',
      entityId: 'single-root-leaf',
      x: outside.x,
      y: outside.z,
    });
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.error.code, 'POSITION_OUTSIDE_GRID');
    assert.equal(session.state.acceptedCommandSeq, 2);
    session.dispose();
  });
});

describe('bounded deferred acceptance and reusable storage', () => {
  test('ranks reusable candidates by quantized cost, q, r and preserves unique ownership', () => {
    const session = createForceLayoutSession(request(buildGroupingHierarchy()));
    const storage = session.assignmentStorage;
    const references = Object.values(storage).filter(ArrayBuffer.isView);

    for (let index = 0; index < 4; index += 1) session.advanceOneStep();
    assert.equal(storage.candidateCapacity, 38);
    assert.ok(session.state.proposalCount > 0);
    for (let leafIndex = 0; leafIndex < session.leafNodes.length; leafIndex += 1) {
      const start = leafIndex * storage.candidateCapacity;
      for (let candidate = 1; candidate < storage.candidateCounts[leafIndex]; candidate += 1) {
        const previous = start + candidate - 1;
        const current = start + candidate;
        assert.ok(
          storage.costs[previous] < storage.costs[current]
          || (storage.costs[previous] === storage.costs[current]
            && (storage.candidateQ[previous] < storage.candidateQ[current]
              || (storage.candidateQ[previous] === storage.candidateQ[current]
                && storage.candidateR[previous] <= storage.candidateR[current]))),
        );
      }
    }
    assert.equal(
      new Set(session.leafNodes.map(({ assignedQ, assignedR }) => `${assignedQ},${assignedR}`)).size,
      session.leafNodes.length,
    );

    for (let index = 0; index < 4; index += 1) session.advanceOneStep();
    assert.deepEqual(Object.values(storage).filter(ArrayBuffer.isView), references);
    assert.ok(
      session.state.proposalCount
      <= session.leafNodes.length * storage.candidateCapacity * session.state.assignmentEpochs,
    );
    session.dispose();
  });

  test('reuses movement, target, prior-position, and assignment working storage across steps', () => {
    const session = createForceLayoutSession(request());
    const targetError = session.state.targetError;
    const movement = session.state.movement;
    const previousPositions = session.previousPositions;
    const candidateQ = session.assignmentStorage.candidateQ;
    for (let index = 0; index < 12; index += 1) session.advanceOneStep();
    assert.strictEqual(session.state.targetError, targetError);
    assert.strictEqual(session.state.movement, movement);
    assert.strictEqual(session.previousPositions, previousPositions);
    assert.strictEqual(session.assignmentStorage.candidateQ, candidateQ);
    session.dispose();
  });
});

describe('exact convergence and cooling budgets', () => {
  test('requires three real unchanged epochs, locks in a numbered tick, keeps anchors mobile, and passes eight steps', () => {
    const session = createForceLayoutSession(request());
    for (let step = 1; step <= 11; step += 1) {
      const frame = session.advanceOneStep();
      assert.equal(frame.terminal, 'none');
      assert.equal(session.automaticLock, false);
    }
    const lockFrame = session.advanceOneStep();
    assert.equal(lockFrame.coolingStep, 12);
    assert.equal(lockFrame.unchangedAssignmentEpochs, 3);
    assert.equal(session.automaticLock, true);
    assert.equal(lockFrame.maxTargetError, 0);
    assert.equal(lockFrame.rmsTargetError, 0);

    const terminal = settle(session);
    assert.equal(terminal.terminal, 'converged');
    assert.equal(terminal.coolingStep, 39);
    assert.equal(terminal.stableStreak, 8);
    assert.equal(session.leafNodes[0].x, session.leafNodes[0].centerX);
    assert.equal(session.leafNodes[0].y, session.leafNodes[0].centerY);
    session.dispose();
  });

  test('keeps anchors mobile and converges when the eighth exact gate passes at step 256', () => {
    const entities = [
      { id: 'root', parentId: null, order: 0 },
      { id: 'group', parentId: 'root', order: 1 },
      { id: 'leaf-a', parentId: 'group', order: 2 },
      { id: 'leaf-b', parentId: 'group', order: 3 },
    ];
    const session = createForceLayoutSession(request(entities));
    const first = session.advanceOneStep();
    assert.equal(first.coolingStep, 1);
    assert.ok(session.anchorNodes.every(({ fx, fy }) => fx == null && fy == null));
    const terminal = settle(session);
    assert.equal(terminal.terminal, 'converged');
    assert.equal(terminal.coolingStep, 256);
    assert.equal(terminal.stableStreak, 8);
    assert.ok(session.anchorNodes.every(({ fx, fy }) => fx == null && fy == null));
    session.dispose();
  });
});

describe('mutation-free semantic control rejection', () => {
  test('advances only the processed sequence for an invalid release and accepts the next sequence', () => {
    const session = createForceLayoutSession(request());
    settle(session);
    const before = snapshotForceState(session);
    const rejected = session.enqueueControl({
      requestId: 17,
      commandSeq: 1,
      action: 'release-fixed-position',
      entityId: 'single-root-leaf',
    });
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.error.code, 'NOT_FIXED');
    assert.equal(session.state.processedCommandSeq, 1);
    assert.equal(session.state.acceptedCommandSeq, 0);
    assert.deepEqual(snapshotForceState(session), before);

    assert.equal(session.enqueueControl({
      requestId: 17,
      commandSeq: 2,
      action: 'set-fixed-position',
      entityId: 'single-root-leaf',
      x: 0,
      y: 0,
    }), null);
    const held = session.advanceOneStep();
    assert.equal(held.controlReceipts[0].accepted, true);
    assert.equal(session.state.acceptedCommandSeq, 2);
    assert.equal(held.globalStep, before.globalStep + 1);
    assert.equal(held.coolingStep, 0);
    session.dispose();
  });
});
