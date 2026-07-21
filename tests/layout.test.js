import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { adaptSchoolData, generateSchoolData } from '../src/data.js';
import { calculateLayout } from '../src/layout.js';
import { buildArbitraryDepthHierarchy } from './fixtures/hierarchies.js';

const LEGACY_CAPTURE = Object.freeze({
  flat: {
    requestId: 101,
    placements: [
      { entityId: 'student-1', q: 0, r: 0 },
      { entityId: 'student-2', q: -1, r: 1 },
      { entityId: 'student-3', q: -6, r: 6 },
      { entityId: 'student-4', q: -7, r: 7 },
      { entityId: 'student-5', q: 6, r: 0 },
      { entityId: 'student-6', q: 5, r: 1 },
      { entityId: 'student-7', q: 0, r: -6 },
      { entityId: 'student-8', q: -1, r: -5 },
    ],
    gridRadius: 11,
    classGap: 7.5,
    schoolGap: 4,
  },
  nested: {
    requestId: 102,
    placements: [
      { entityId: 'student-1', q: 3, r: -3 },
      { entityId: 'student-2', q: 2, r: -2 },
      { entityId: 'student-3', q: -9, r: 9 },
      { entityId: 'student-4', q: -10, r: 10 },
      { entityId: 'student-5', q: -3, r: 3 },
      { entityId: 'student-6', q: -4, r: 4 },
      { entityId: 'student-7', q: -15, r: 15 },
      { entityId: 'student-8', q: -16, r: 16 },
    ],
    gridRadius: 19,
    classGap: 4,
    schoolGap: 4,
  },
  packed: {
    requestId: 103,
    placements: [
      { entityId: 'student-1', q: 0, r: -1 },
      { entityId: 'student-2', q: -1, r: 0 },
      { entityId: 'student-3', q: -4, r: 3 },
      { entityId: 'student-4', q: -5, r: 4 },
      { entityId: 'student-5', q: 0, r: 1 },
      { entityId: 'student-6', q: -1, r: 2 },
      { entityId: 'student-7', q: -4, r: 5 },
      { entityId: 'student-8', q: -5, r: 6 },
    ],
    gridRadius: 11,
    classGap: 1,
    schoolGap: 2,
  },
});

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function compareEntities(first, second) {
  if (first.order !== second.order) return first.order - second.order;
  if (first.id < second.id) return -1;
  if (first.id > second.id) return 1;
  return 0;
}

function axialDistance(first, second) {
  const q = first.q - second.q;
  const r = first.r - second.r;
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

function expectedBoundaryGaps(entities, placements) {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const childCountById = new Map(entities.map((entity) => [entity.id, 0]));
  for (const entity of entities) {
    if (entity.parentId !== null) {
      childCountById.set(entity.parentId, childCountById.get(entity.parentId) + 1);
    }
  }

  const depthById = new Map();
  function getDepth(entity) {
    if (depthById.has(entity.id)) return depthById.get(entity.id);
    const depth = entity.parentId === null ? 0 : getDepth(entityById.get(entity.parentId)) + 1;
    depthById.set(entity.id, depth);
    return depth;
  }

  const cellsByInternalId = new Map();
  for (const entity of entities) {
    if (childCountById.get(entity.id) > 0) cellsByInternalId.set(entity.id, []);
    getDepth(entity);
  }
  for (const placement of placements) {
    let parentId = entityById.get(placement.entityId).parentId;
    while (parentId !== null) {
      cellsByInternalId.get(parentId).push({ q: placement.q, r: placement.r });
      parentId = entityById.get(parentId).parentId;
    }
  }

  const groupsByDepth = new Map();
  const internalEntities = entities
    .filter((entity) => childCountById.get(entity.id) > 0)
    .sort(compareEntities);
  for (const entity of internalEntities) {
    const depth = depthById.get(entity.id);
    if (!groupsByDepth.has(depth)) groupsByDepth.set(depth, []);
    groupsByDepth.get(depth).push(entity);
  }

  return [...groupsByDepth]
    .sort(([firstDepth], [secondDepth]) => firstDepth - secondDepth)
    .map(([depth, groups]) => {
      const nearest = [];
      for (const group of groups) {
        let minimum = Infinity;
        for (const other of groups) {
          if (group.id === other.id) continue;
          if (depth > 0 && group.parentId !== other.parentId) continue;
          for (const first of cellsByInternalId.get(group.id)) {
            for (const second of cellsByInternalId.get(other.id)) {
              minimum = Math.min(minimum, axialDistance(first, second) - 1);
            }
          }
        }
        if (Number.isFinite(minimum)) nearest.push(minimum);
      }

      return {
        depth,
        averageNearestGap: nearest.length < 2
          ? null
          : nearest.reduce((sum, gap) => sum + gap, 0) / nearest.length,
      };
    });
}

function buildWavefrontRegressionHierarchy() {
  const entities = [];
  const add = (id, parentId) => {
    entities.push({ id, parentId, order: entities.length });
  };
  const addCluster = (id, parentId, leafCount) => {
    add(id, parentId);
    for (let index = 0; index < leafCount; index += 1) add(`${id}-leaf-${index}`, id);
  };

  add('wave-root-a', null);
  add('wave-zone-a1', 'wave-root-a');
  addCluster('wave-cluster-a1x', 'wave-zone-a1', 5);
  addCluster('wave-cluster-a1y', 'wave-zone-a1', 2);
  add('wave-zone-a2', 'wave-root-a');
  addCluster('wave-cluster-a2x', 'wave-zone-a2', 4);
  addCluster('wave-cluster-a2y', 'wave-zone-a2', 3);
  add('wave-root-b', null);
  add('wave-zone-b1', 'wave-root-b');
  addCluster('wave-cluster-b1x', 'wave-zone-b1', 6);
  addCluster('wave-cluster-b1y', 'wave-zone-b1', 2);
  add('wave-zone-b2', 'wave-root-b');
  addCluster('wave-cluster-b2x', 'wave-zone-b2', 3);
  addCluster('wave-cluster-b2y', 'wave-zone-b2', 5);
  add('wave-zone-b3', 'wave-root-b');
  addCluster('wave-cluster-b3x', 'wave-zone-b3', 2);

  return entities;
}

function assertLegacyResult(result, mode, capture) {
  assert.deepEqual(result, {
    requestId: capture.requestId,
    mode,
    placements: capture.placements,
    springs: [],
    gridRadius: capture.gridRadius,
    stats: {
      occupiedCount: capture.placements.length,
      boundaryGaps: [
        { depth: 0, averageNearestGap: capture.schoolGap },
        { depth: 1, averageNearestGap: capture.classGap },
      ],
    },
    diagnostics: { kind: 'legacy', iterations: 0, converged: true },
  });
}

describe('calculateLayout legacy modes', () => {
  const sourceData = generateSchoolData({
    schoolCount: 2,
    classCount: 4,
    minStudents: 2,
    maxStudents: 2,
  });
  const { entities } = adaptSchoolData(sourceData);

  for (const mode of ['flat', 'nested', 'packed']) {
    test(`${mode} preserves captured coordinates and gaps in the unified result`, () => {
      const capture = LEGACY_CAPTURE[mode];
      const request = {
        requestId: capture.requestId,
        mode,
        entities: structuredClone(entities),
        config: null,
      };
      const snapshot = structuredClone(request);
      deepFreeze(request);

      const result = calculateLayout(request);

      assertLegacyResult(result, mode, capture);
      assert.deepEqual(request, snapshot);
    });
  }

  test('sorts placement records by normalized order and exact code-unit ID', () => {
    const entitiesWithTies = [
      { id: '\u00e4', parentId: 'stable-root', order: 4 },
      { id: 'z', parentId: 'stable-root', order: 4 },
      { id: 'stable-root', parentId: null, order: -1 },
      { id: 'e\u0301', parentId: 'stable-root', order: 4 },
      { id: '\u00e9', parentId: 'stable-root', order: 4 },
      { id: 'a', parentId: 'stable-root', order: 4 },
      { id: 'Z', parentId: 'stable-root', order: 4 },
    ];

    const result = calculateLayout({
      requestId: 104,
      mode: 'flat',
      entities: entitiesWithTies,
      config: null,
    });

    assert.deepEqual(result.placements.map(({ entityId }) => entityId), [
      'Z',
      'a',
      'e\u0301',
      'z',
      '\u00e4',
      '\u00e9',
    ]);
  });

  test('rejects an unknown mode with the typed code', () => {
    assert.throws(
      () => calculateLayout({
        requestId: 105,
        mode: 'not-a-layout',
        entities: [{ id: 'unknown-mode-leaf', parentId: null, order: 0 }],
        config: null,
      }),
      (error) => error?.code === 'UNKNOWN_MODE',
    );
  });
});

describe('generic hierarchy statistics', () => {
  for (const mode of ['flat', 'nested', 'packed']) {
    test(`${mode} supports uneven arbitrary-depth hierarchies`, () => {
      const entities = buildArbitraryDepthHierarchy();
      const result = calculateLayout({ requestId: 201, mode, entities, config: null });

      assert.deepEqual(result.placements.map(({ entityId }) => entityId), [
        'depth-short-leaf',
        'depth-deep-leaf-a',
        'depth-deep-leaf-b',
      ]);
      assert.equal(new Set(result.placements.map(({ q, r }) => `${q},${r}`)).size, 3);
      assert.deepEqual(result.stats, {
        occupiedCount: 3,
        boundaryGaps: expectedBoundaryGaps(entities, result.placements),
      });
      assert.deepEqual(result.stats.boundaryGaps.map(({ depth }) => depth), [0, 1, 2, 3]);
      assert.equal(result.stats.boundaryGaps[0].averageNearestGap, null);
      assert.ok(Number.isFinite(result.stats.boundaryGaps[1].averageNearestGap));
      assert.equal(result.stats.boundaryGaps[2].averageNearestGap, null);
      assert.equal(result.stats.boundaryGaps[3].averageNearestGap, null);
    });
  }

  test('matches exact nearest axial cell gap semantics for deterministic tied group fronts', () => {
    const entities = buildWavefrontRegressionHierarchy();
    const request = { requestId: 202, mode: 'flat', entities, config: null };
    const first = calculateLayout(request);
    const reordered = calculateLayout({ ...request, entities: [...entities].reverse() });
    const exactGaps = expectedBoundaryGaps(entities, first.placements);

    assert.deepEqual(first.stats.boundaryGaps, exactGaps);
    assert.deepEqual(first.stats.boundaryGaps.map(({ depth }) => depth), [0, 1, 2]);
    assert.ok(first.stats.boundaryGaps.every(({ averageNearestGap }) => (
      Number.isFinite(averageNearestGap)
    )));
    assert.deepEqual(reordered, first);
  });
});
