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

  test('updates cell assignments when dragging a fixed node across multiple hex cells', () => {
    const session = createForceLayoutSession(request());
    settle(session);

    const initialAssignmentQ = session.leafNodes.find((n) => n.entityId === 'leaf-a').assignedQ;

    session.enqueueControl({
      requestId: 41,
      commandSeq: 1,
      action: 'set-fixed-position',
      entityId: 'leaf-a',
      x: 10,
      y: 0,
    });

    for (let i = 0; i < 8; i += 1) {
      session.advanceOneStep();
    }

    const updatedAssignmentQ = session.leafNodes.find((n) => n.entityId === 'leaf-a').assignedQ;
    assert.equal(updatedAssignmentQ, 4, 'fixed node at x=10 must assign to exact Q=4 cell while held');
    assert.notEqual(updatedAssignmentQ, initialAssignmentQ, 'assignedQ must update across hex cells while held');
    session.dispose();
  });

  test('synchronous calculation is deterministic and has no post-finish projection', () => {
    const first = calculateForceLayout(request());
    const second = calculateForceLayout(request());
    assert.deepEqual(first, second);
    assert.equal(first.diagnostics.converged, true);
    assert.equal(first.diagnostics.terminationReason, 'CONVERGED');
  });

  test('frame includes leafCells Int16Array mapping canonical leaf order to axial coordinates', () => {
    const session = createForceLayoutSession(request());
    let frame = session.initialFrame();
    while (frame.terminal === 'none') frame = session.advanceOneStep();
    assert.ok(frame.leafCells, 'frame must have leafCells');
    assert.ok(frame.leafCells instanceof Int16Array, 'leafCells must be Int16Array');
    session.dispose();
  });

  test('derives tower centers from the canonical typed assignment snapshot', () => {
    const session = createForceLayoutSession(request());
    let frame = session.initialFrame();
    while (frame.terminal === 'none') frame = session.advanceOneStep();
    const center = axialToPlane(frame.leafCells[0], frame.leafCells[1]);
    assert.equal(frame.positions[2 * 2], Math.fround(center.x));
    assert.equal(frame.positions[2 * 2 + 1], Math.fround(center.z));
    session.dispose();
  });

  test('settled result includes leafCells and towerPositions', () => {
    const result = calculateForceLayout(request());
    assert.ok(result.leafCells, 'result must have leafCells');
    assert.ok(result.towerPositions, 'result must have towerPositions');
    assert.ok('leaf-a' in result.leafCells);
    assert.ok('leaf-z' in result.leafCells);
    assert.ok('leaf-a' in result.towerPositions);
    assert.ok('leaf-z' in result.towerPositions);
    const cells = Object.values(result.leafCells);
    const cellSet = new Set(cells.map(c => `${c.q},${c.r}`));
    assert.equal(cellSet.size, cells.length, 'no duplicate cells in leafCells');
  });

  test('empty topology rejects with EMPTY_HIERARCHY', () => {
    assert.throws(
      () => calculateForceLayout({ ...request({ entities: [] }) }),
      (error) => error instanceof ForceLayoutError && error.code === 'EMPTY_HIERARCHY',
    );
  });

  test('validates Int16Array leafCells snapshot, inclusive radius <= 256, uniqueness, and hash predicate', () => {
    const session = createForceLayoutSession(request({ traceEnabled: true }));
    const frame = session.initialFrame();

    assert.ok(frame.leafCells instanceof Int16Array, 'leafCells must be Int16Array');
    assert.equal(frame.leafCells.length, 4, 'leafCells length must be 2 * leafCount (2 leaves * 2 = 4)');

    // Verify leafCells contains whole-number axial coordinates R(q,r) <= 256
    const cellKeys = new Set();
    for (let i = 0; i < frame.leafCells.length; i += 2) {
      const q = frame.leafCells[i];
      const r = frame.leafCells[i + 1];
      assert.equal(Number.isInteger(q), true);
      assert.equal(Number.isInteger(r), true);
      const radius = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
      assert.ok(radius <= 256, `R(${q},${r}) = ${radius} must be <= 256`);
      const key = `${q},${r}`;
      assert.ok(!cellKeys.has(key), `duplicate cell assignment ${key}`);
      cellKeys.add(key);
    }

    assert.equal(typeof frame.assignmentHash, 'number');
    assert.equal(Number.isInteger(frame.assignmentHash), true);

    const terminal = settle(session);
    assert.ok(terminal.leafCells instanceof Int16Array);
    const result = session.serializeSettledResult();
    assert.equal(result.placements.length, 2);
    for (let i = 0; i < result.placements.length; i += 1) {
      const p = result.placements[i];
      assert.equal(p.q, terminal.leafCells[i * 2]);
      assert.equal(p.r, terminal.leafCells[i * 2 + 1]);
    }
    session.dispose();
  });

  test('reclaims both transferred frame buffers before producing the next frame', () => {
    const session = createForceLayoutSession(request());
    for (let step = 0; step < 8; step += 1) {
      const frame = step === 0 ? session.initialFrame() : session.advanceOneStep();
      const transferred = structuredClone({
        positionBuffer: frame.positions.buffer,
        cellBuffer: frame.leafCells.buffer,
      }, { transfer: [frame.positions.buffer, frame.leafCells.buffer] });
      assert.equal(frame.positions.byteLength, 0);
      assert.equal(frame.leafCells.byteLength, 0);
      session.reclaimFrameBuffers(transferred.positionBuffer, transferred.cellBuffer);
      assert.equal(session.frameBuffers.positions.length, session.nodes.length * 2);
      assert.equal(session.frameBuffers.leafCells.length, session.leafNodes.length * 2);
    }
    session.dispose();
  });
});
