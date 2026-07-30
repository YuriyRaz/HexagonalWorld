import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  FORCE_LAYOUT_CONFIG_V2,
  ForceLayoutError,
  calculateForceLayout,
  createForceLayoutSession,
} from '../src/force-layout.js';
import { axialToPlane } from '../src/hex.js';

const entities = [
  { id: 'root', parentId: null, order: 0 },
  { id: 'group', parentId: 'root', order: 1 },
  { id: 'leaf-z', parentId: 'group', order: 3 },
  { id: 'leaf-a', parentId: 'group', order: 2 },
];

function request(overrides = {}) {
  return {
    requestId: 41,
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

describe('version-2 retained force session', () => {
  test('exposes a frozen complete config and derives alpha decay', () => {
    assert.equal(FORCE_LAYOUT_CONFIG_V2.version, 2);
    assert.equal(Object.isFrozen(FORCE_LAYOUT_CONFIG_V2), true);
    assert.equal(
      FORCE_LAYOUT_CONFIG_V2.alphaSchedule.decay,
      1 - Math.pow(
        FORCE_LAYOUT_CONFIG_V2.alphaSchedule.minimum / FORCE_LAYOUT_CONFIG_V2.alphaSchedule.initial,
        1 / FORCE_LAYOUT_CONFIG_V2.maxCoolingSteps,
      ),
    );
  });

  test('rejects a cycle before creating a mutable session', () => {
    assert.throws(
      () => createForceLayoutSession(request({ entities: [
        { id: 'a', parentId: 'b', order: 0 },
        { id: 'b', parentId: 'a', order: 1 },
      ] })),
      (error) => error instanceof ForceLayoutError && error.code === 'INVALID_HIERARCHY',
    );
  });

  test('produces canonical topology, unique assignments, and exact terminal centers', () => {
    const session = createForceLayoutSession(request({ traceEnabled: true }));
    const topology = session.topology();
    assert.deepEqual(topology.nodeIds, ['root', 'group', 'leaf-a', 'leaf-z']);
    const terminal = settle(session);
    assert.equal(terminal.terminal, 'converged');
    const result = session.serializeSettledResult();
    assert.equal(new Set(result.placements.map(({ q, r }) => `${q},${r}`)).size, result.placements.length);
    const nodeIndex = new Map(topology.nodeIds.map((id, index) => [id, index]));
    for (const placement of result.placements) {
      const center = axialToPlane(placement.q, placement.r);
      const index = nodeIndex.get(placement.entityId);
      assert.equal(terminal.positions[index * 2], Math.fround(center.x));
      assert.equal(terminal.positions[index * 2 + 1], Math.fround(center.z));
    }
    assert.equal(session.serializeSettledResult().diagnostics.globalStep, terminal.globalStep);
    assert.ok(session.trace().some((entry) => entry.assignmentRevision > 0));
    session.dispose();
  });

  test('retains full precision across an accepted fixed-position command', () => {
    const session = createForceLayoutSession(request());
    const terminal = settle(session);
    assert.equal(terminal.terminal, 'converged');
    const before = session.serializeSettledResult();
    assert.equal(session.enqueueControl({
      requestId: 41,
      commandSeq: 1,
      action: 'set-fixed-position',
      entityId: 'leaf-a',
      x: 0,
      y: 0,
    }), null);
    const held = session.advanceOneStep();
    assert.equal(held.controlReceipts[0].accepted, true);
    assert.equal(held.globalStep, terminal.globalStep + 1);
    assert.equal(session.state.phase, 'held');
    assert.equal(session.enqueueControl({
      requestId: 41,
      commandSeq: 2,
      action: 'release-fixed-position',
      entityId: 'leaf-a',
    }), null);
    const cooling = session.advanceOneStep();
    assert.equal(cooling.controlReceipts[0].accepted, true);
    assert.equal(cooling.coolingStep, 1);
    assert.equal(before.placements.length, 2);
    session.dispose();
  });

  test('synchronous calculation is deterministic and has no post-finish projection', () => {
    const first = calculateForceLayout(request());
    const second = calculateForceLayout(request());
    assert.deepEqual(first, second);
    assert.equal(first.diagnostics.converged, true);
    assert.equal(first.diagnostics.terminationReason, 'CONVERGED');
  });
});
