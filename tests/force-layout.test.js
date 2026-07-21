import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  FORCE_LAYOUT_CONFIG,
  ForceLayoutError,
  calculateForceLayout,
  mulberry32,
} from '../src/force-layout.js';
import {
  buildArbitraryDepthHierarchy,
  buildCycleHierarchy,
  buildDuplicateIdHierarchy,
  buildEmptyHierarchy,
  buildGroupingHierarchy,
  buildMissingParentHierarchy,
  buildSingleRootLeafHierarchy,
  buildSixThousandLinkHierarchy,
  buildSmallValidHierarchy,
  buildStructuralMaximumHierarchy,
} from './fixtures/hierarchies.js';

const EXPECTED_V1_CONFIG = {
  version: 1,
  seed: 0x9e3779b9,
  totalTicks: 256,
  mutableEndTick: 159,
  settleEndTick: 223,
  assignmentInterval: 4,
  candidateRadius: 3,
  predictionLookahead: 0.75,
  movePenalty: 0.05,
  alphaSchedule: [
    { fromTick: 0, toTick: 159, from: 1, to: 0.12 },
    { fromTick: 160, toTick: 223, from: 0.12, to: 0.02 },
    { fromTick: 224, toTick: 255, from: 0.02, to: 0.005 },
  ],
  velocityDecay: 0.4,
  hexStrength: { mutable: 0.2, settle: 0.45 },
  manyBodyStrength: -18,
  manyBodyTheta: 0.9,
  manyBodyDistanceMin: 0.1,
  manyBodyDistanceMax: 32,
  centerStrength: 0.01,
  linkDistance: 2,
  linkStrength: 0.2,
  linkIterations: 1,
  quantizationStep: 0.000001,
  convergenceThresholds: {
    stableAssignmentEpochs: 3,
    maxTargetError: 0.25,
    rmsTargetError: 0.08,
    maxAnchorVelocity: 0.02,
  },
};

const CALCULATION_ERROR_CODES = [
  'UNKNOWN_MODE',
  'EMPTY_HIERARCHY',
  'INVALID_HIERARCHY',
  'UNSUPPORTED_SCALE',
  'NON_FINITE_STATE',
  'ASSIGNMENT_INVARIANT',
  'NOT_CONVERGED',
];

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertDeepFrozen(value, path = 'FORCE_LAYOUT_CONFIG') {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, `${path}.${key}`);
  }
}

function makeRequest(entities = buildSmallValidHierarchy(), overrides = {}) {
  return {
    requestId: 17,
    mode: 'force-anchors',
    entities,
    config: structuredClone(FORCE_LAYOUT_CONFIG),
    ...overrides,
  };
}

function captureCalculationError(callback, expectedCode) {
  let captured;
  assert.throws(callback, (error) => {
    captured = error;
    return true;
  });
  assert.ok(captured instanceof Error);
  assert.equal(captured.code, expectedCode);
  assert.ok(captured.details !== null && typeof captured.details === 'object');
  return captured;
}

function compareEntities(first, second) {
  if (first.order < second.order) return -1;
  if (first.order > second.order) return 1;
  if (first.id < second.id) return -1;
  if (first.id > second.id) return 1;
  return 0;
}

function axialDistance(first, second) {
  const q = first.q - second.q;
  const r = first.r - second.r;
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

function hierarchyFacts(entities) {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const childCountById = new Map(entities.map((entity) => [entity.id, 0]));
  for (const entity of entities) {
    if (entity.parentId !== null) {
      childCountById.set(entity.parentId, childCountById.get(entity.parentId) + 1);
    }
  }

  const depthById = new Map();
  const getDepth = (entity) => {
    if (depthById.has(entity.id)) return depthById.get(entity.id);
    const depth = entity.parentId === null ? 0 : getDepth(entityById.get(entity.parentId)) + 1;
    depthById.set(entity.id, depth);
    return depth;
  };
  for (const entity of entities) getDepth(entity);

  return {
    entityById,
    childCountById,
    depthById,
    leaves: entities.filter((entity) => childCountById.get(entity.id) === 0),
    internals: entities.filter((entity) => childCountById.get(entity.id) > 0),
  };
}

function assertFiniteNumbers(value, path = 'result') {
  if (typeof value === 'number') {
    assert.equal(Number.isFinite(value), true, `${path} must be finite`);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assertFiniteNumbers(child, `${path}.${key}`);
  }
}

function assertCompleteUniqueCells(result, entities) {
  const { leaves, internals } = hierarchyFacts(entities);
  const expectedLeafIds = leaves.sort(compareEntities).map(({ id }) => id);
  const placementIds = result.placements.map(({ entityId }) => entityId);

  assert.deepEqual(placementIds, expectedLeafIds);
  assert.equal(new Set(placementIds).size, leaves.length);
  assert.equal(result.placements.length, leaves.length);
  assert.equal(result.stats.occupiedCount, leaves.length);
  assert.ok(result.placements.every(({ q, r }) => Number.isInteger(q) && Number.isInteger(r)));
  assert.equal(
    new Set(result.placements.map(({ q, r }) => JSON.stringify([q, r]))).size,
    leaves.length,
  );
  assert.ok(internals.every(({ id }) => !placementIds.includes(id)), 'anchors must not be placed');
  assert.ok(Number.isInteger(result.gridRadius));
  assert.ok(result.gridRadius >= 0 && result.gridRadius <= 256);
}

function alphaAtTick(tick) {
  const phase = FORCE_LAYOUT_CONFIG.alphaSchedule.find(({ fromTick, toTick }) => (
    tick >= fromTick && tick <= toTick
  ));
  assert.ok(phase, `tick ${tick} must have an alpha phase`);
  if (phase.fromTick === phase.toTick) return phase.to;
  const progress = (tick - phase.fromTick) / (phase.toTick - phase.fromTick);
  return phase.from + (phase.to - phase.from) * progress;
}

function groupingRatios(entities, placements) {
  const { entityById, depthById, leaves, internals } = hierarchyFacts(entities);
  const placementById = new Map(placements.map((placement) => [placement.entityId, placement]));
  const eligibleDepths = [...new Set(internals.map(({ id }) => depthById.get(id)))].sort((a, b) => a - b);
  const ratios = [];

  for (const depth of eligibleDepths) {
    const ancestorByLeafId = new Map();
    const leafCountByAncestorId = new Map();
    for (const leaf of leaves) {
      let ancestorId = leaf.parentId;
      while (ancestorId !== null && depthById.get(ancestorId) !== depth) {
        ancestorId = entityById.get(ancestorId).parentId;
      }
      if (ancestorId === null) continue;
      ancestorByLeafId.set(leaf.id, ancestorId);
      leafCountByAncestorId.set(ancestorId, (leafCountByAncestorId.get(ancestorId) ?? 0) + 1);
    }

    const eligibleAncestorIds = new Set(
      [...leafCountByAncestorId]
        .filter(([, count]) => count >= 2)
        .map(([ancestorId]) => ancestorId),
    );
    if (eligibleAncestorIds.size < 2) continue;

    const includedLeaves = leaves.filter((leaf) => eligibleAncestorIds.has(ancestorByLeafId.get(leaf.id)));
    let sameTotal = 0;
    let differentTotal = 0;
    for (const leaf of includedLeaves) {
      const placement = placementById.get(leaf.id);
      const ancestorId = ancestorByLeafId.get(leaf.id);
      let nearestSame = Infinity;
      let nearestDifferent = Infinity;

      for (const other of includedLeaves) {
        if (other.id === leaf.id) continue;
        const distance = axialDistance(placement, placementById.get(other.id));
        if (ancestorByLeafId.get(other.id) === ancestorId) {
          nearestSame = Math.min(nearestSame, distance);
        } else {
          nearestDifferent = Math.min(nearestDifferent, distance);
        }
      }

      assert.ok(Number.isFinite(nearestSame));
      assert.ok(Number.isFinite(nearestDifferent));
      sameTotal += nearestSame;
      differentTotal += nearestDifferent;
    }

    ratios.push({
      depth,
      sameMean: sameTotal / includedLeaves.length,
      differentMean: differentTotal / includedLeaves.length,
    });
  }

  return ratios;
}

describe('force layout public configuration and random source', () => {
  test('exports the exact deeply frozen version-1 configuration', () => {
    assert.deepEqual(FORCE_LAYOUT_CONFIG, EXPECTED_V1_CONFIG);
    assert.deepEqual(Object.keys(FORCE_LAYOUT_CONFIG), Object.keys(EXPECTED_V1_CONFIG));
    assertDeepFrozen(FORCE_LAYOUT_CONFIG);
  });

  test('implements Mulberry32 with unsigned seed normalization', () => {
    const random = mulberry32(0x9e3779b9);
    assert.deepEqual(Array.from({ length: 6 }, () => random()), [
      0.3588899802416563,
      0.10590326134115458,
      0.675290479324758,
      0.9179345588199794,
      0.10157715040259063,
      0.30100292386487126,
    ]);

    const negative = mulberry32(-1);
    const unsigned = mulberry32(0xffffffff);
    for (let index = 0; index < 8; index += 1) {
      const value = negative();
      assert.equal(value, unsigned());
      assert.ok(value >= 0 && value < 1);
    }
  });

  test('defines typed calculation errors with non-localized code and details', () => {
    for (const code of CALCULATION_ERROR_CODES) {
      const details = { testCode: code };
      const error = new ForceLayoutError(code, details);
      assert.ok(error instanceof Error);
      assert.equal(error.name, 'ForceLayoutError');
      assert.equal(error.code, code);
      assert.strictEqual(error.details, details);
    }
  });
});

describe('calculateForceLayout validation and immutability', () => {
  test('does not mutate a deeply frozen request, entities, or caller-owned config', () => {
    const request = makeRequest();
    const snapshot = structuredClone(request);
    deepFreeze(request);

    const result = calculateForceLayout(request);

    assert.deepEqual(request, snapshot);
    assert.notStrictEqual(result.placements, request.entities);
    assertCompleteUniqueCells(result, request.entities);
  });

  test('accepts an exact cloned v1 config and rejects version or value drift', () => {
    assert.doesNotThrow(() => calculateForceLayout(makeRequest(buildSingleRootLeafHierarchy())));

    const wrongVersion = structuredClone(FORCE_LAYOUT_CONFIG);
    wrongVersion.version = 2;
    captureCalculationError(
      () => calculateForceLayout(makeRequest(buildSingleRootLeafHierarchy(), { config: wrongVersion })),
      'INVALID_HIERARCHY',
    );

    const changedValue = structuredClone(FORCE_LAYOUT_CONFIG);
    changedValue.hexStrength.settle += 0.01;
    captureCalculationError(
      () => calculateForceLayout(makeRequest(buildSingleRootLeafHierarchy(), { config: changedValue })),
      'INVALID_HIERARCHY',
    );

    captureCalculationError(
      () => calculateForceLayout(makeRequest(buildSingleRootLeafHierarchy(), { config: null })),
      'INVALID_HIERARCHY',
    );
  });

  test('rejects unknown mode, empty input, and malformed hierarchies with typed details', () => {
    captureCalculationError(
      () => calculateForceLayout(makeRequest(buildSingleRootLeafHierarchy(), { mode: 'packed' })),
      'UNKNOWN_MODE',
    );
    captureCalculationError(() => calculateForceLayout(makeRequest(buildEmptyHierarchy())), 'EMPTY_HIERARCHY');

    for (const build of [
      buildDuplicateIdHierarchy,
      buildMissingParentHierarchy,
      buildCycleHierarchy,
    ]) {
      captureCalculationError(() => calculateForceLayout(makeRequest(build())), 'INVALID_HIERARCHY');
    }
  });

  test('accepts the 5,999-link preflight boundary and rejects 6,000 links before config/simulation', () => {
    const acceptedBoundaryError = captureCalculationError(
      () => calculateForceLayout(makeRequest(buildStructuralMaximumHierarchy(), { config: null })),
      'INVALID_HIERARCHY',
    );
    assert.notEqual(acceptedBoundaryError.code, 'UNSUPPORTED_SCALE');

    const rejectedBoundaryError = captureCalculationError(
      () => calculateForceLayout(makeRequest(buildSixThousandLinkHierarchy(), { config: null })),
      'UNSUPPORTED_SCALE',
    );
    assert.ok(Array.isArray(rejectedBoundaryError.details.violations));
    assert.ok(rejectedBoundaryError.details.violations.some((violation) => (
      violation.measure === 'activeLinkCount'
      && violation.actual === 6000
      && violation.maximum === 5999
    )));
  });
});

describe('deterministic simulation contract', () => {
  test('uses canonical initialization for a single leaf and returns no anchor placement or spring', () => {
    const entities = buildSingleRootLeafHierarchy();
    const result = calculateForceLayout(makeRequest(entities));

    assert.deepEqual(result.placements, [{ entityId: 'single-root-leaf', q: 0, r: 0 }]);
    assert.deepEqual(result.springs, []);
    assertCompleteUniqueCells(result, entities);
  });

  test('sorts equal-order IDs by exact code units and preserves delimiter-containing identities', () => {
    const rootId = 'root|anchor:target';
    const ids = ['\u00e4|x', 'z:x', 'e\u0301|x', '\u00e9:x', 'a|x', 'Z:x'];
    const entities = [
      { id: rootId, parentId: null, order: -1 },
      ...ids.map((id) => ({ id, parentId: rootId, order: 4 })),
    ];
    const result = calculateForceLayout(makeRequest(entities));

    assert.deepEqual(result.placements.map(({ entityId }) => entityId), [
      'Z:x',
      'a|x',
      'e\u0301|x',
      'z:x',
      '\u00e4|x',
      '\u00e9:x',
    ]);
  });

  test('keeps structured spring identities collision-safe when delimiter concatenation would collide', () => {
    const entities = [
      { id: 'root', parentId: null, order: 0 },
      { id: 'b', parentId: 'root', order: 1 },
      { id: 'anchor|b', parentId: 'root', order: 2 },
      { id: 'a|anchor', parentId: 'b', order: 3 },
      { id: 'a', parentId: 'anchor|b', order: 4 },
    ];
    const result = calculateForceLayout(makeRequest(entities));
    const leafSprings = result.springs.filter(({ source }) => source.kind === 'leaf');

    assert.deepEqual(leafSprings.map(({ source, target }) => [
      source.kind,
      source.entityId,
      target.kind,
      target.entityId,
    ]), [
      ['leaf', 'a|anchor', 'anchor', 'b'],
      ['leaf', 'a', 'anchor', 'anchor|b'],
    ]);
    assert.equal(
      new Set(result.springs.map(({ source, target }) => JSON.stringify([
        source.kind,
        source.entityId,
        target.kind,
        target.entityId,
      ]))).size,
      result.springs.length,
    );
  });

  test('covers every one of 256 manual ticks with the exact alpha phases', () => {
    const coveredTicks = FORCE_LAYOUT_CONFIG.alphaSchedule.flatMap(({ fromTick, toTick }) => (
      Array.from({ length: toTick - fromTick + 1 }, (_, index) => fromTick + index)
    ));
    assert.deepEqual(coveredTicks, Array.from({ length: 256 }, (_, tick) => tick));
    assert.equal(alphaAtTick(0), 1);
    assert.equal(alphaAtTick(159), 0.12);
    assert.equal(alphaAtTick(160), 0.12);
    assert.equal(alphaAtTick(223), 0.02);
    assert.equal(alphaAtTick(224), 0.02);
    assert.equal(alphaAtTick(255), 0.005);

    const result = calculateForceLayout(makeRequest(buildSmallValidHierarchy()));
    assert.equal(result.diagnostics.iterations, 256);
    assert.equal(result.diagnostics.assignmentEpochs, 40);
  });

  test('creates one anchor per internal entity and one immediate-parent spring per non-root entity', () => {
    const entities = buildArbitraryDepthHierarchy();
    const { childCountById, internals } = hierarchyFacts(entities);
    const result = calculateForceLayout(makeRequest(entities));
    const expectedSprings = entities
      .filter(({ parentId }) => parentId !== null)
      .sort(compareEntities)
      .map((entity) => [
        childCountById.get(entity.id) === 0 ? 'leaf' : 'anchor',
        entity.id,
        'anchor',
        entity.parentId,
      ]);
    const actualSprings = result.springs.map(({ source, target }) => [
      source.kind,
      source.entityId,
      target.kind,
      target.entityId,
    ]);
    const anchorIds = new Set(result.springs.flatMap(({ source, target }) => [
      ...(source.kind === 'anchor' ? [source.entityId] : []),
      target.entityId,
    ]));

    assert.deepEqual(actualSprings, expectedSprings);
    assert.equal(result.springs.length, entities.filter(({ parentId }) => parentId !== null).length);
    assert.deepEqual([...anchorIds].sort(), internals.map(({ id }) => id).sort());
    assertCompleteUniqueCells(result, entities);
  });

  test('keeps radius-three assignment proposals bounded and returns complete unique integer cells', () => {
    const entities = buildGroupingHierarchy();
    const result = calculateForceLayout(makeRequest(entities));
    const leafCount = hierarchyFacts(entities).leaves.length;
    const radius = FORCE_LAYOUT_CONFIG.candidateRadius;
    const candidateCap = 1 + 3 * radius * (radius + 1) + 1;

    assert.equal(radius, 3);
    assert.equal(candidateCap, 38);
    assertCompleteUniqueCells(result, entities);
    assert.ok(Number.isSafeInteger(result.diagnostics.proposalCount));
    assert.ok(result.diagnostics.proposalCount >= 0);
    assert.ok(
      result.diagnostics.proposalCount
      <= leafCount * candidateCap * result.diagnostics.assignmentEpochs,
    );
  });

  test('pins every final leaf endpoint to its exact assigned center and reports finite convergence', () => {
    const entities = buildArbitraryDepthHierarchy();
    const result = calculateForceLayout(makeRequest(entities));
    const placementById = new Map(result.placements.map((placement) => [placement.entityId, placement]));

    for (const spring of result.springs) {
      if (spring.source.kind !== 'leaf') continue;
      const placement = placementById.get(spring.source.entityId);
      assert.deepEqual(
        { q: spring.source.q, r: spring.source.r },
        { q: placement.q, r: placement.r },
      );
    }

    assert.deepEqual(Object.keys(result.diagnostics).sort(), [
      'assignmentEpochs',
      'converged',
      'iterations',
      'kind',
      'maxAnchorVelocity',
      'maxTargetError',
      'proposalCount',
      'rmsTargetError',
    ]);
    assert.equal(result.diagnostics.kind, 'force');
    assert.equal(result.diagnostics.converged, true);
    assert.ok(result.diagnostics.maxTargetError <= FORCE_LAYOUT_CONFIG.convergenceThresholds.maxTargetError);
    assert.ok(result.diagnostics.rmsTargetError <= FORCE_LAYOUT_CONFIG.convergenceThresholds.rmsTargetError);
    assert.ok(
      result.diagnostics.maxAnchorVelocity
      <= FORCE_LAYOUT_CONFIG.convergenceThresholds.maxAnchorVelocity,
    );
    assertFiniteNumbers(result);
  });

  test('provides typed finite-state, assignment-invariant, and non-convergence failures', () => {
    for (const code of ['NON_FINITE_STATE', 'ASSIGNMENT_INVARIANT', 'NOT_CONVERGED']) {
      const details = { phase: 'force-calculation', code };
      const throwFailure = () => {
        throw new ForceLayoutError(code, details);
      };
      const error = captureCalculationError(throwFailure, code);
      assert.strictEqual(error.details, details);
    }
  });

  test('meets the 80% same-ancestor grouping ratio at every eligible fixture depth', () => {
    const entities = buildGroupingHierarchy();
    const result = calculateForceLayout(makeRequest(entities));
    const ratios = groupingRatios(entities, result.placements);

    assert.deepEqual(ratios.map(({ depth }) => depth), [0, 1]);
    for (const { depth, sameMean, differentMean } of ratios) {
      assert.ok(
        sameMean <= differentMean * 0.8,
        `depth ${depth}: same ${sameMean} must be <= 80% of different ${differentMean}`,
      );
    }
  });

  test('is independent of equivalent input array order', () => {
    const entities = buildGroupingHierarchy();
    const first = calculateForceLayout(makeRequest(entities));
    const reordered = calculateForceLayout(makeRequest([...entities].reverse()));

    assert.deepEqual(reordered, first);
  });

  test('returns deeply equal complete results across ten runs', () => {
    const entities = buildGroupingHierarchy();
    const results = Array.from({ length: 10 }, () => (
      calculateForceLayout(makeRequest(structuredClone(entities)))
    ));

    for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
  });
});
