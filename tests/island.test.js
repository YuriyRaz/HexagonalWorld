import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import * as THREE from 'three';

import { createIsland } from '../src/island.js';

const GENERIC_PAYLOAD_FIELDS = [
  'entityId',
  'title',
  'metadataText',
  'heightValue',
  'colorGroupId',
  'colorGroupOrder',
  'colorVariantOrder',
];

function makePayload(entityId, order, heightValue) {
  const payload = {
    entityId,
    title: `Renderable ${order}`,
    metadataText: `Generic metadata ${order}`,
    heightValue,
    colorGroupId: `group-${order % 2}`,
    colorGroupOrder: order % 2,
    colorVariantOrder: order,
  };

  for (const sourceField of ['student', 'mark', 'classId', 'schoolIndex']) {
    Object.defineProperty(payload, sourceField, {
      get() {
        throw new Error(`Rendering read source-domain field ${sourceField}.`);
      },
    });
  }

  return payload;
}

function makePayloadMap() {
  return new Map([
    ['entity-alpha', makePayload('entity-alpha', 0, 18)],
    ['entity-beta', makePayload('entity-beta', 1, 82)],
  ]);
}

function makeLayoutResult(overrides = {}) {
  return {
    requestId: 17,
    mode: 'flat',
    placements: [
      { entityId: 'entity-alpha', q: 0, r: 0 },
      { entityId: 'entity-beta', q: 1, r: 0 },
    ],
    springs: [],
    gridRadius: 1,
    stats: {
      occupiedCount: 2,
      boundaryGaps: [
        { depth: 0, averageNearestGap: 3.5 },
        { depth: 2, averageNearestGap: null },
      ],
    },
    diagnostics: { kind: 'legacy', iterations: 0, converged: true },
    ...overrides,
  };
}

function makeInput(layoutOverrides = {}, inputOverrides = {}) {
  return {
    visualPayloadByEntityId: makePayloadMap(),
    layoutResult: makeLayoutResult(layoutOverrides),
    presentation: { occupiedOpacity: 1, showSprings: false },
    ...inputOverrides,
  };
}

function makeSpring(overrides = {}) {
  return {
    source: { kind: 'leaf', entityId: 'entity-alpha', q: 0, r: 0 },
    target: { kind: 'anchor', entityId: 'anchor-root', q: 0.5, r: -0.5 },
    ...overrides,
  };
}

function getMaterials(object) {
  if (object.material === undefined) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

describe('createIsland validation', () => {
  test('rejects invalid payload joins, cells, radius, and springs before construction', () => {
    const originalSetMatrixAt = THREE.InstancedMesh.prototype.setMatrixAt;
    const originalGeometryDispose = THREE.BufferGeometry.prototype.dispose;
    const originalMaterialDispose = THREE.Material.prototype.dispose;
    let constructionCalls = 0;
    let disposalCalls = 0;

    THREE.InstancedMesh.prototype.setMatrixAt = function constructionTripwire() {
      constructionCalls += 1;
      throw new Error('Rendering construction started before validation completed.');
    };
    THREE.BufferGeometry.prototype.dispose = function countGeometryDisposal() {
      disposalCalls += 1;
      return originalGeometryDispose.call(this);
    };
    THREE.Material.prototype.dispose = function countMaterialDisposal() {
      disposalCalls += 1;
      return originalMaterialDispose.call(this);
    };

    const invalidInputs = [
      ['missing payload', makeInput({}, {
        visualPayloadByEntityId: new Map([
          ['entity-alpha', makePayload('entity-alpha', 0, 18)],
        ]),
      })],
      ['duplicate payload join', makeInput({
        placements: [
          { entityId: 'entity-alpha', q: 0, r: 0 },
          { entityId: 'entity-alpha', q: 1, r: 0 },
        ],
      })],
      ['noninteger cell', makeInput({
        placements: [
          { entityId: 'entity-alpha', q: 0.5, r: 0 },
          { entityId: 'entity-beta', q: 1, r: 0 },
        ],
      })],
      ['duplicate cell', makeInput({
        placements: [
          { entityId: 'entity-alpha', q: 0, r: 0 },
          { entityId: 'entity-beta', q: 0, r: 0 },
        ],
      })],
      ['radius above 256', makeInput({ gridRadius: 257 })],
      ['springs hidden with a nonempty spring list', makeInput({
        springs: [makeSpring()],
      })],
      ['nonfinite source endpoint', makeInput({
        mode: 'force-anchors',
        springs: [makeSpring({
          source: { kind: 'leaf', entityId: 'entity-alpha', q: Infinity, r: 0 },
        })],
      }, {
        presentation: { occupiedOpacity: 0.5, showSprings: true },
      })],
      ['nonfinite target endpoint', makeInput({
        mode: 'force-anchors',
        springs: [makeSpring({
          target: { kind: 'anchor', entityId: 'anchor-root', q: 0, r: Number.NaN },
        })],
      }, {
        presentation: { occupiedOpacity: 0.5, showSprings: true },
      })],
    ];

    try {
      for (const [name, input] of invalidInputs) {
        assert.throws(() => createIsland(input), `${name} must be rejected`);
        assert.equal(constructionCalls, 0, `${name} reached Three.js construction`);
        assert.equal(disposalCalls, 0, `${name} allocated disposable Three.js resources`);
      }
    } finally {
      THREE.InstancedMesh.prototype.setMatrixAt = originalSetMatrixAt;
      THREE.BufferGeometry.prototype.dispose = originalGeometryDispose;
      THREE.Material.prototype.dispose = originalMaterialDispose;
    }
  });
});

describe('createIsland object model', () => {
  test('creates a detached domain-neutral legacy island with opaque occupied tiles', () => {
    const input = makeInput();
    const expectedPayloads = input.visualPayloadByEntityId;
    const expectedStats = structuredClone(input.layoutResult.stats);
    const handle = createIsland(input);

    try {
      assert.ok(handle.root instanceof THREE.Group);
      assert.equal(handle.root.parent, null);
      assert.ok(handle.root.children.length > 0);
      assert.ok(Array.isArray(handle.interactiveTiles));
      assert.equal(handle.interactiveTiles.length, 2);
      assert.ok(handle.interactiveTiles.every((tile) => tile instanceof THREE.InstancedMesh));
      assert.ok(handle.water instanceof THREE.Mesh);
      assert.ok(Array.isArray(handle.waterRings));
      assert.ok(handle.waterRings.every((ring) => ring instanceof THREE.Mesh));
      assert.ok(Number.isFinite(handle.worldSize));
      assert.ok(handle.worldSize > 0);
      assert.deepEqual(handle.stats, expectedStats);
      assert.deepEqual(Object.keys(handle.stats).sort(), ['boundaryGaps', 'occupiedCount']);
      assert.equal(typeof handle.dispose, 'function');

      const occupied = handle.interactiveTiles.find((tile) => tile.userData.isEmpty !== true);
      const empty = handle.interactiveTiles.find((tile) => tile.userData.isEmpty === true);
      assert.ok(occupied, 'occupied interaction mesh is exposed');
      assert.ok(empty, 'empty interaction mesh is exposed');
      assert.equal(occupied.count, expectedPayloads.size);
      assert.equal(occupied.userData.instances.length, expectedPayloads.size);

      for (const instance of occupied.userData.instances) {
        assert.ok(instance.payload, 'occupied interaction data contains a generic payload');
        assert.strictEqual(instance.payload, expectedPayloads.get(instance.payload.entityId));
        assert.deepEqual(
          Object.keys(instance.payload).sort(),
          [...GENERIC_PAYLOAD_FIELDS].sort(),
        );
        assert.equal(Object.hasOwn(instance, 'student'), false);
      }

      for (const material of getMaterials(occupied)) {
        assert.equal(material.opacity, 1);
        assert.equal(material.transparent, false);
        assert.equal(material.depthWrite, true);
      }
    } finally {
      handle.dispose();
    }
  });

  test('cleans partial allocations when deterministic construction fails', () => {
    const originalSetMatrixAt = THREE.InstancedMesh.prototype.setMatrixAt;
    const originalGeometryDispose = THREE.BufferGeometry.prototype.dispose;
    const originalMaterialDispose = THREE.Material.prototype.dispose;
    const geometryDisposals = new Map();
    const materialDisposals = new Map();
    let handle;
    let thrown;

    THREE.BufferGeometry.prototype.dispose = function countGeometryDisposal() {
      geometryDisposals.set(this, (geometryDisposals.get(this) ?? 0) + 1);
      return originalGeometryDispose.call(this);
    };
    THREE.Material.prototype.dispose = function countMaterialDisposal() {
      materialDisposals.set(this, (materialDisposals.get(this) ?? 0) + 1);
      return originalMaterialDispose.call(this);
    };
    THREE.InstancedMesh.prototype.setMatrixAt = function failDuringConstruction() {
      throw new Error('deterministic construction failure');
    };

    try {
      handle = createIsland(makeInput());
    } catch (error) {
      thrown = error;
    } finally {
      handle?.dispose();
      THREE.InstancedMesh.prototype.setMatrixAt = originalSetMatrixAt;
      THREE.BufferGeometry.prototype.dispose = originalGeometryDispose;
      THREE.Material.prototype.dispose = originalMaterialDispose;
    }

    assert.ok(thrown, 'construction failure is rethrown');
    assert.equal(thrown.code, 'RENDER_FAILED');
    assert.ok(geometryDisposals.size > 0, 'partial geometries were disposed');
    assert.ok(materialDisposals.size > 0, 'partial materials were disposed');
    assert.ok([...geometryDisposals.values()].every((count) => count === 1));
    assert.ok([...materialDisposals.values()].every((count) => count === 1));
  });

  test('dispose releases every owned object and resource exactly once and is idempotent', () => {
    const handle = createIsland(makeInput());
    const objects = [];
    const geometries = new Set();
    const materials = new Set();
    const removalCounts = new Map();
    const geometryDisposals = new Map();
    const materialDisposals = new Map();

    handle.root.traverse((object) => {
      objects.push(object);
      if (object.geometry) geometries.add(object.geometry);
      for (const material of getMaterials(object)) materials.add(material);
      if (object !== handle.root) {
        removalCounts.set(object, 0);
        object.addEventListener('removed', () => {
          removalCounts.set(object, removalCounts.get(object) + 1);
        });
      }
    });

    for (const geometry of geometries) {
      const originalDispose = geometry.dispose.bind(geometry);
      geometry.dispose = () => {
        geometryDisposals.set(geometry, (geometryDisposals.get(geometry) ?? 0) + 1);
        return originalDispose();
      };
    }
    for (const material of materials) {
      const originalDispose = material.dispose.bind(material);
      material.dispose = () => {
        materialDisposals.set(material, (materialDisposals.get(material) ?? 0) + 1);
        return originalDispose();
      };
    }

    handle.dispose();

    assert.ok(objects.length > 1);
    assert.ok(geometries.size > 0);
    assert.ok(materials.size > 0);
    assert.equal(handle.root.children.length, 0);
    assert.ok(objects.every((object) => object.parent === null));
    assert.ok([...removalCounts.values()].every((count) => count === 1));
    assert.equal(geometryDisposals.size, geometries.size);
    assert.equal(materialDisposals.size, materials.size);
    assert.ok([...geometryDisposals.values()].every((count) => count === 1));
    assert.ok([...materialDisposals.values()].every((count) => count === 1));

    handle.dispose();

    assert.equal(handle.root.children.length, 0);
    assert.ok([...removalCounts.values()].every((count) => count === 1));
    assert.ok([...geometryDisposals.values()].every((count) => count === 1));
    assert.ok([...materialDisposals.values()].every((count) => count === 1));
  });

  test('handles force-anchors presentation, spring rendering, and depth/opacity properties (T035)', () => {
    // 1. Rejects spring count above 5,999 before construction
    const tooManySpringsInput = makeInput({
      mode: 'force-anchors',
      springs: Array.from({ length: 6000 }, (_, i) => makeSpring({
        source: { kind: 'leaf', entityId: 'entity-alpha', q: 0, r: 0 },
        target: { kind: 'anchor', entityId: `anchor-${i}`, q: 0.5, r: -0.5 },
      }))
    }, {
      presentation: { occupiedOpacity: 0.5, showSprings: true }
    });
    assert.throws(() => createIsland(tooManySpringsInput), /Island rendering failed./);

    // 2. Translucent/opaque properties of occupied tiles
    const forceInput = makeInput({
      mode: 'force-anchors',
      springs: [makeSpring()]
    }, {
      presentation: { occupiedOpacity: 0.5, showSprings: true }
    });

    const originalMaterialDispose = THREE.Material.prototype.dispose;
    const originalGeometryDispose = THREE.BufferGeometry.prototype.dispose;
    let materialDisposalCalls = 0;
    let geometryDisposalCalls = 0;
    THREE.Material.prototype.dispose = function() {
      materialDisposalCalls++;
      return originalMaterialDispose.call(this);
    };
    THREE.BufferGeometry.prototype.dispose = function() {
      geometryDisposalCalls++;
      return originalGeometryDispose.call(this);
    };

    const forceHandle = createIsland(forceInput);
    try {
      const occupied = forceHandle.interactiveTiles.find((tile) => tile.userData.isEmpty !== true);
      assert.ok(occupied);
      for (const material of getMaterials(occupied)) {
        assert.equal(material.opacity, 0.5);
        assert.equal(material.transparent, true);
        assert.equal(material.depthWrite, false);
      }

      // 3. Batched LineSegments properties
      const lineSegments = forceHandle.root.children.find(child => child instanceof THREE.LineSegments);
      assert.ok(lineSegments, 'LineSegments object must exist for springs');
      assert.ok(lineSegments.geometry instanceof THREE.BufferGeometry);
      assert.ok(lineSegments.material instanceof THREE.LineBasicMaterial);
      assert.equal(lineSegments.material.depthTest, true);
      assert.equal(lineSegments.material.depthWrite, false);

      // 4. Two vertices per spring
      const positionAttr = lineSegments.geometry.getAttribute('position');
      assert.ok(positionAttr);
      assert.equal(positionAttr.count, 2 * forceInput.layoutResult.springs.length);

      // 5. Literal y = 0
      for (let i = 0; i < positionAttr.count; i++) {
        assert.equal(positionAttr.getY(i), 0);
      }

      // 6. Raycast exclusion (not in interactiveTiles, and raycast overridden to noop)
      assert.ok(!forceHandle.interactiveTiles.includes(lineSegments), 'springs should not be interactive');
      const testRaycast = lineSegments.raycast;
      let raycastCalled = false;
      const mockRaycaster = {};
      const mockIntersects = [];
      lineSegments.raycast(mockRaycaster, mockIntersects);
      assert.deepEqual(mockIntersects, []);

      // 7. Check color / height mappings are unchanged (height and baseColors exist and match payload)
      assert.equal(occupied.userData.instances.length, 2);
      assert.ok(occupied.userData.instances[0].height > 0);
      assert.ok(occupied.userData.baseColors.length > 0);

      // 8. Zero-spring resource omission
      const zeroSpringInput = makeInput({
        mode: 'force-anchors',
        springs: []
      }, {
        presentation: { occupiedOpacity: 0.5, showSprings: true }
      });
      const zeroSpringHandle = createIsland(zeroSpringInput);
      try {
        const zeroLineSegments = zeroSpringHandle.root.children.find(child => child instanceof THREE.LineSegments);
        assert.equal(zeroLineSegments, undefined, 'no LineSegments for zero springs');
      } finally {
        zeroSpringHandle.dispose();
      }
    } finally {
      forceHandle.dispose();
      THREE.Material.prototype.dispose = originalMaterialDispose;
      THREE.BufferGeometry.prototype.dispose = originalGeometryDispose;
    }

    // 9. Exact disposal of spring resources
    assert.ok(materialDisposalCalls > 0, 'spring material must be disposed');
    assert.ok(geometryDisposalCalls > 0, 'spring geometry must be disposed');
  });
});
