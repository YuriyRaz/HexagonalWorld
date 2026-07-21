import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  HierarchyError,
  adaptSchoolData,
  generateSchoolData,
  normalizeHierarchy,
} from '../src/data.js';
import {
  STRUCTURAL_MAXIMUM_COUNTS,
  buildCycleHierarchy,
  buildDuplicateIdHierarchy,
  buildEmptyHierarchy,
  buildMissingParentHierarchy,
  buildSelfParentHierarchy,
  buildSmallValidHierarchy,
  buildStructuralMaximumHierarchy,
} from './fixtures/hierarchies.js';

const LIMITS = Object.freeze({
  entityCount: 6000,
  leafCount: 4800,
  internalCount: 1200,
  maxDepth: 16,
  leafAncestorMembershipCount: 76800,
});

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function captureHierarchyError(callback) {
  let captured;
  assert.throws(callback, (error) => {
    captured = error;
    return true;
  });
  assert.ok(captured instanceof HierarchyError);
  assert.equal(captured.name, 'HierarchyError');
  assert.equal(typeof captured.code, 'string');
  assert.ok(captured.details && typeof captured.details === 'object');
  return captured;
}

function buildRoots(count, prefix) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index).padStart(5, '0')}`,
    parentId: null,
    order: index,
  }));
}

function buildChain(maxDepth) {
  return Array.from({ length: maxDepth + 1 }, (_, depth) => ({
    id: `chain-${String(depth).padStart(4, '0')}`,
    parentId: depth === 0 ? null : `chain-${String(depth - 1).padStart(4, '0')}`,
    order: depth,
  }));
}

function buildMembershipHierarchy(leafCount) {
  const entities = buildChain(15);
  const parentId = entities.at(-1).id;
  for (let index = 0; index < leafCount; index += 1) {
    entities.push({
      id: `membership-leaf-${String(index).padStart(4, '0')}`,
      parentId,
      order: entities.length,
    });
  }
  return entities;
}

function assertScaleViolation(entities, measure, maximum) {
  const error = captureHierarchyError(() => normalizeHierarchy(entities));
  assert.equal(error.code, 'UNSUPPORTED_SCALE');
  assert.ok(Array.isArray(error.details.violations));
  const violation = error.details.violations.find((entry) => entry.measure === measure);
  assert.ok(violation, `expected a ${measure} violation`);
  assert.equal(violation.maximum, maximum);
  assert.ok(violation.actual > maximum);
}

describe('normalizeHierarchy', () => {
  test('clones normalized fields and sorts equal orders by exact UTF-16 code units', () => {
    const input = deepFreeze([
      { id: '\u00e4', parentId: null, order: 4, sourceOnly: { ignored: true } },
      { id: 'z', parentId: null, order: 4 },
      { id: 'e\u0301', parentId: null, order: 4 },
      { id: '\u00e9', parentId: null, order: 4 },
      { id: 'a', parentId: null, order: 4 },
      { id: 'Z', parentId: null, order: 4 },
      { id: 'first', parentId: null, order: -1 },
    ]);
    const snapshot = structuredClone(input);

    const { entities, analysis } = normalizeHierarchy(input);

    assert.deepEqual(entities, [
      { id: 'first', parentId: null, order: -1 },
      { id: 'Z', parentId: null, order: 4 },
      { id: 'a', parentId: null, order: 4 },
      { id: 'e\u0301', parentId: null, order: 4 },
      { id: 'z', parentId: null, order: 4 },
      { id: '\u00e4', parentId: null, order: 4 },
      { id: '\u00e9', parentId: null, order: 4 },
    ]);
    assert.deepEqual(input, snapshot);
    for (const entity of entities) {
      assert.notStrictEqual(entity, input.find(({ id }) => id === entity.id));
    }
    assert.deepEqual(analysis.leafIds, entities.map(({ id }) => id));
    assert.deepEqual(analysis.internalIds, []);
  });

  test('exposes stable leaf, internal, depth, ancestor, and count analysis', () => {
    const input = deepFreeze(buildSmallValidHierarchy());
    const snapshot = structuredClone(input);

    const { entities, analysis } = normalizeHierarchy(input);

    assert.deepEqual(entities, snapshot);
    assert.deepEqual(analysis.leafIds, ['small-leaf-a', 'small-leaf-b', 'small-leaf-c']);
    assert.deepEqual(analysis.internalIds, ['small-root-a', 'small-group-a', 'small-root-b']);
    assert.ok(analysis.depthByEntityId instanceof Map);
    assert.deepEqual([...analysis.depthByEntityId], [
      ['small-root-a', 0],
      ['small-group-a', 1],
      ['small-leaf-a', 2],
      ['small-leaf-b', 2],
      ['small-root-b', 0],
      ['small-leaf-c', 1],
    ]);
    assert.ok(analysis.ancestorIdsByEntityId instanceof Map);
    assert.deepEqual([...analysis.ancestorIdsByEntityId], [
      ['small-root-a', []],
      ['small-group-a', ['small-root-a']],
      ['small-leaf-a', ['small-group-a', 'small-root-a']],
      ['small-leaf-b', ['small-group-a', 'small-root-a']],
      ['small-root-b', []],
      ['small-leaf-c', ['small-root-b']],
    ]);
    assert.deepEqual(analysis.counts, {
      entityCount: 6,
      leafCount: 3,
      internalCount: 3,
      rootCount: 2,
      maxDepth: 2,
      leafAncestorMembershipCount: 5,
      activeLinkCount: 4,
    });
    assert.deepEqual(input, snapshot);
  });

  test('accepts every request-computable hierarchy measure at its exact limit', () => {
    const { analysis } = normalizeHierarchy(buildStructuralMaximumHierarchy());
    assert.deepEqual(analysis.counts, STRUCTURAL_MAXIMUM_COUNTS);
  });

  test('rejects an empty hierarchy with a typed code', () => {
    const error = captureHierarchyError(() => normalizeHierarchy(buildEmptyHierarchy()));
    assert.equal(error.code, 'EMPTY_HIERARCHY');
  });

  for (const [name, build, reason] of [
    ['duplicate IDs', buildDuplicateIdHierarchy, 'DUPLICATE_ID'],
    ['missing parents', buildMissingParentHierarchy, 'MISSING_PARENT'],
    ['self-parenting', buildSelfParentHierarchy, 'SELF_PARENT'],
    ['cycles', buildCycleHierarchy, 'CYCLE'],
  ]) {
    test(`rejects ${name} with typed details`, () => {
      const error = captureHierarchyError(() => normalizeHierarchy(build()));
      assert.equal(error.code, 'INVALID_HIERARCHY');
      assert.equal(error.details.reason, reason);
    });
  }

  test('rejects total entity counts above the supported limit', () => {
    assertScaleViolation(buildRoots(LIMITS.entityCount + 1, 'entity'), 'entityCount', LIMITS.entityCount);
  });

  test('rejects leaf counts above the supported limit', () => {
    assertScaleViolation(buildRoots(LIMITS.leafCount + 1, 'leaf'), 'leafCount', LIMITS.leafCount);
  });

  test('rejects internal entity counts above the supported limit', () => {
    assertScaleViolation(buildChain(LIMITS.internalCount + 1), 'internalCount', LIMITS.internalCount);
  });

  test('rejects hierarchy depth above the supported limit', () => {
    assertScaleViolation(buildChain(LIMITS.maxDepth + 1), 'maxDepth', LIMITS.maxDepth);
  });

  test('rejects leaf-to-ancestor memberships above the supported limit', () => {
    const atLimit = buildMembershipHierarchy(LIMITS.leafCount);
    const { analysis } = normalizeHierarchy(atLimit);
    assert.equal(analysis.counts.leafAncestorMembershipCount, LIMITS.leafAncestorMembershipCount);

    const aboveLimit = buildMembershipHierarchy(LIMITS.leafCount + 1);
    assertScaleViolation(
      aboveLimit,
      'leafAncestorMembershipCount',
      LIMITS.leafAncestorMembershipCount,
    );
  });
});

describe('adaptSchoolData', () => {
  test('preserves generated school data and maps only leaves to generic visual payloads', () => {
    const sourceData = generateSchoolData({
      schoolCount: 1,
      classCount: 1,
      minStudents: 2,
      maxStudents: 2,
    });
    const snapshot = structuredClone(sourceData);
    deepFreeze(sourceData);

    const { entities, visualPayloadByEntityId } = adaptSchoolData(sourceData);

    assert.deepEqual(sourceData, snapshot);
    assert.deepEqual(entities, [
      { id: 'school-1', parentId: null, order: 0 },
      { id: 'class-1', parentId: 'school-1', order: 1 },
      { id: 'student-1', parentId: 'class-1', order: 2 },
      { id: 'student-2', parentId: 'class-1', order: 3 },
    ]);
    assert.ok(visualPayloadByEntityId instanceof Map);
    assert.deepEqual([...visualPayloadByEntityId], [
      ['student-1', {
        entityId: 'student-1',
        title: 'Student 1',
        metadataText: 'North Academy \u00b7 10A Math \u00b7 \u041e\u0446\u0435\u043d\u043a\u0430: 77',
        heightValue: 77,
        colorGroupId: 'school-1',
        colorGroupOrder: 0,
        colorVariantOrder: 0,
      }],
      ['student-2', {
        entityId: 'student-2',
        title: 'Student 2',
        metadataText: 'North Academy \u00b7 10A Math \u00b7 \u041e\u0446\u0435\u043d\u043a\u0430: 53',
        heightValue: 53,
        colorGroupId: 'school-1',
        colorGroupOrder: 0,
        colorVariantOrder: 0,
      }],
    ]);
    for (const payload of visualPayloadByEntityId.values()) {
      assert.deepEqual(Object.keys(payload).sort(), [
        'colorGroupId',
        'colorGroupOrder',
        'colorVariantOrder',
        'entityId',
        'heightValue',
        'metadataText',
        'title',
      ]);
    }
  });
});
