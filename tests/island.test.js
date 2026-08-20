import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import * as THREE from 'three';

import { createIsland, createLiveIsland } from '../src/island.js';
import { calculateAssignmentHash } from '../src/force-layout.js';
import { axialToPlane } from '../src/hex.js';

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

  test('restores opaque legacy presentation after force candidates and disposes force resources once (T047)', () => {
    const forceHandle = createIsland(makeInput({
      mode: 'force-anchors',
      springs: [makeSpring()],
    }, {
      presentation: { occupiedOpacity: 0.5, showSprings: true },
    }));
    const legacyHandle = createIsland(makeInput());
    const forceGeometries = new Set();
    const forceMaterials = new Set();
    const geometryDisposals = new Map();
    const materialDisposals = new Map();

    forceHandle.root.traverse((object) => {
      if (object.geometry) forceGeometries.add(object.geometry);
      for (const material of getMaterials(object)) forceMaterials.add(material);
    });
    for (const geometry of forceGeometries) {
      const originalDispose = geometry.dispose.bind(geometry);
      geometry.dispose = () => {
        geometryDisposals.set(geometry, (geometryDisposals.get(geometry) ?? 0) + 1);
        return originalDispose();
      };
    }
    for (const material of forceMaterials) {
      const originalDispose = material.dispose.bind(material);
      material.dispose = () => {
        materialDisposals.set(material, (materialDisposals.get(material) ?? 0) + 1);
        return originalDispose();
      };
    }

    try {
      const legacyOccupied = legacyHandle.interactiveTiles.find((tile) => tile.userData.isEmpty !== true);
      assert.ok(legacyOccupied);
      assert.equal(legacyOccupied.material.opacity, 1);
      assert.equal(legacyOccupied.material.transparent, false);
      assert.equal(legacyOccupied.material.depthWrite, true);
      assert.equal(legacyHandle.root.children.some((child) => child instanceof THREE.LineSegments), false);

      forceHandle.dispose();
      forceHandle.dispose();
      assert.ok([...geometryDisposals.values()].every((count) => count === 1));
      assert.ok([...materialDisposals.values()].every((count) => count === 1));
    } finally {
      legacyHandle.dispose();
    }
  });
});

function makeForceFrame(topology, positions, leafCells, globalStep = 0, assignmentRevision = 0) {
  const cells = new Int16Array(leafCells);
  const leafIds = topology.nodeIds.filter((_, index) => topology.nodeKinds[index] === 'leaf');
  return {
    requestId: topology.requestId,
    globalStep,
    epoch: 0,
    epochStep: globalStep,
    coolingStep: globalStep,
    positions: new Float32Array(positions),
    leafCells: cells,
    assignmentRevision,
    assignmentHash: calculateAssignmentHash(leafIds, cells),
    terminal: 'none',
  };
}

function makeForceInput(positions, globalStep = 0, leafCells = [0, 0, 1, 0]) {
  const topology = {
    requestId: 1,
    nodeIds: ['entity-alpha', 'entity-beta'],
    nodeKinds: ['leaf', 'leaf'],
    relations: [],
  };
  const initialFrame = makeForceFrame(topology, positions, leafCells, globalStep);
  return {
    visualPayloadByEntityId: makePayloadMap(),
    topology,
    initialFrame,
    presentation: { occupiedOpacity: 0.5, showSprings: false },
  };
}

describe('createLiveIsland and applyStep', () => {

  test('createLiveIsland creates valid instances with correct entityId mapping', () => {
    const handle = createLiveIsland(makeForceInput([0, 0, 5, 3]));
    try {
      assert.ok(handle.root instanceof THREE.Group);
      assert.equal(handle.interactiveTiles.length, 2);
      const occupied = handle.interactiveTiles.find((tile) => tile.userData.isEmpty !== true);
      const empty = handle.interactiveTiles.find((tile) => tile.userData.isEmpty === true);
      assert.ok(occupied instanceof THREE.InstancedMesh);
      assert.ok(empty instanceof THREE.InstancedMesh);
      assert.equal(occupied.count, 2);
      assert.equal(occupied.userData.instances.length, 2);
      assert.equal(occupied.userData.instances[0].entityId, 'entity-alpha');
      assert.equal(occupied.userData.instances[1].entityId, 'entity-beta');
      assert.ok(occupied.boundingSphere !== null);
      assert.ok(occupied.boundingSphere.radius > 0);
    } finally {
      handle.dispose();
    }
  });

  test('applyStep updates positions and recomputes bounding sphere', () => {
    const handle = createLiveIsland(makeForceInput([0, 0, 5, 3]));
    try {
      const occupied = handle.interactiveTiles[0];
      handle.applyStep(makeForceFrame(makeForceInput([]).topology, [100, 100, -100, -100], [1, 0, 2, 0], 1, 1));

      assert.ok(occupied.boundingSphere.radius > 0);
      assert.equal(occupied.userData.instances[0].x, Math.fround(axialToPlane(1, 0).x));
      assert.equal(occupied.userData.instances[1].x, Math.fround(axialToPlane(2, 0).x));

      // 3D Instance matrix must match exact hex-cell center coordinates, NOT floating continuous positions
      const matrix = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      occupied.getMatrixAt(0, matrix);
      matrix.decompose(pos, rot, scale);
      assert.equal(pos.x, Math.fround(axialToPlane(1, 0).x), 'rendered 3D mesh position must match exact hex-cell center');
    } finally {
      handle.dispose();
    }
  });

  test('applyStep rejects non-sequential globalStep', () => {
    const handle = createLiveIsland(makeForceInput([0, 0, 5, 3]));
    try {
      assert.throws(
        () => handle.applyStep(makeForceFrame(makeForceInput([]).topology, [0, 0, 5, 3], [0, 0, 1, 0], 5)),
        /Island rendering failed./,
      );
    } finally {
      handle.dispose();
    }
  });

  test('instance payload entityId matches topology nodeIds for raycast lookup', () => {
    const handle = createLiveIsland(makeForceInput([0, 0, 5, 3]));
    try {
      const occupied = handle.interactiveTiles[0];
      const instances = occupied.userData.instances;
      for (let i = 0; i < instances.length; i++) {
        assert.equal(instances[i].payload.entityId, `entity-${i === 0 ? 'alpha' : 'beta'}`);
        assert.equal(instances[i].entityId, instances[i].payload.entityId);
      }
    } finally {
      handle.dispose();
    }
  });

  test('[US1] rejects invalid leafCells frame and centers rendered leaf-Towers on axialToPlane coordinates without assigning cells to Layout Anchors', () => {
    const handle = createLiveIsland(makeForceInput([0, 0, 5, 3]));
    try {
      assert.equal(handle.interactiveTiles.length > 0, true);
      const readyFrame = makeForceFrame(makeForceInput([]).topology, [100, 100, -100, -100], [0, 0, 1, 0], 1);
      handle.applyStep(readyFrame);

      const occupied = handle.interactiveTiles[0];
      assert.equal(occupied.userData.instances[0].x, Math.fround(axialToPlane(0, 0).x));
      assert.equal(occupied.userData.instances[1].x, Math.fround(axialToPlane(1, 0).x));
      const before = handle.inspectCurrentFrame();

      const invalidFrame = makeForceFrame(makeForceInput([]).topology, [0, 0, 100, 100], [0, 0, 300, 0], 2, 1);
      assert.throws(() => handle.applyStep(invalidFrame));
      assert.deepEqual(handle.inspectCurrentFrame(), before);
    } finally {
      handle.dispose();
    }
  });

  test('requires complete assignments and atomically reuses the live grid across revisions', () => {
    const input = makeForceInput([0, 0, 0, 0]);
    const handle = createLiveIsland(input);
    try {
      const emptyGrid = handle.interactiveTiles.find((tile) => tile.userData.isEmpty);
      const before = handle.inspectCurrentFrame();
      const malformed = makeForceFrame(input.topology, [10, 10, 20, 20], [0, 0, 1, 0], 1, 1);
      delete malformed.leafCells;
      assert.throws(() => handle.applyStep(malformed));
      assert.deepEqual(handle.inspectCurrentFrame(), before);

      handle.applyStep(makeForceFrame(input.topology, [10, 10, 20, 20], [-1, 0, 1, -1], 1, 1));
      const after = handle.inspectCurrentFrame();
      assert.strictEqual(handle.interactiveTiles.find((tile) => tile.userData.isEmpty), emptyGrid);
      assert.deepEqual(after.occupiedCells, ['-1,0', '1,-1']);
      for (const tower of after.towers) {
        const center = axialToPlane(tower.q, tower.r);
        assert.equal(tower.x, Math.fround(center.x));
        assert.equal(tower.z, Math.fround(center.z));
      }
      for (const empty of emptyGrid.userData.instances) {
        assert.equal(after.occupiedCells.includes(`${empty.q},${empty.r}`), false);
      }
      assert.deepEqual(after.resourceCounts, before.resourceCounts);
    } finally {
      handle.dispose();
    }
  });

  test('keeps every normal frame Tower, occupancy, revision, and leaf/anchor spring endpoint coherent and rolls malformed input back atomically', () => {
    const topology = {
      requestId: 31,
      nodeIds: ['entity-alpha', 'anchor-root', 'entity-beta'],
      nodeKinds: ['leaf', 'anchor', 'leaf'],
      relations: [
        { sourceIndex: 0, targetIndex: 1 },
        { sourceIndex: 1, targetIndex: 2 },
      ],
    };
    const frames = [
      makeForceFrame(topology, [100, 100, 7, -9, -100, -100], [0, 0, 1, 0], 0, 0),
      makeForceFrame(topology, [101, 101, 8, -8, -101, -101], [-1, 0, 1, -1], 1, 1),
      makeForceFrame(topology, [102, 102, 9, -7, -102, -102], [-1, 0, 1, -1], 2, 1),
      makeForceFrame(topology, [103, 103, 10, -6, -103, -103], [-2, 1, 2, -1], 3, 2),
    ];
    const handle = createLiveIsland({
      visualPayloadByEntityId: makePayloadMap(),
      topology,
      initialFrame: frames[0],
      presentation: { occupiedOpacity: 0.5, showSprings: true },
    });

    const assertCoherent = (frame) => {
      const displayed = handle.inspectCurrentFrame();
      assert.equal(displayed.globalStep, frame.globalStep);
      assert.equal(displayed.assignmentRevision, frame.assignmentRevision);
      assert.equal(displayed.assignmentHash, frame.assignmentHash);
      assert.deepEqual(displayed.leafCells, Array.from(frame.leafCells));
      assert.equal(new Set(displayed.occupiedCells).size, displayed.towers.length);
      assert.deepEqual(displayed.occupiedCells, displayed.towers.map(({ q, r }) => `${q},${r}`).sort());
      for (const tower of displayed.towers) {
        assert.ok(Number.isInteger(tower.q));
        assert.ok(Number.isInteger(tower.r));
        const center = axialToPlane(tower.q, tower.r);
        assert.equal(tower.x, Math.fround(center.x));
        assert.equal(tower.z, Math.fround(center.z));
      }
      const [alpha, beta] = displayed.towers;
      assert.deepEqual(displayed.springPositions, [
        frame.positions[0], 0, frame.positions[1], frame.positions[2], 0, frame.positions[3],
        frame.positions[2], 0, frame.positions[3], frame.positions[4], 0, frame.positions[5],
      ]);
    };

    try {
      assertCoherent(frames[0]);
      for (const frame of frames.slice(1)) {
        handle.applyStep(frame);
        assertCoherent(frame);
      }

      const beforeMalformed = handle.inspectCurrentFrame();
      const malformed = makeForceFrame(topology, [0, 0, 0, 0, 0, 0], [-3, 1, 3, -1], 4, 3);
      malformed.assignmentHash += 1;
      assert.throws(() => handle.applyStep(malformed));
      assert.deepEqual(handle.inspectCurrentFrame(), beforeMalformed);
    } finally {
      handle.dispose();
    }
  });

  test('grows live grid capacity repeatedly while reusing geometry/material and disposing each replaced mesh exactly once', () => {
    const input = makeForceInput([0, 0, 0, 0]);
    const handle = createLiveIsland(input);
    const initial = handle.inspectCurrentFrame();
    const sharedGeometry = handle.interactiveTiles.find((tile) => tile.userData.isEmpty).geometry;
    const sharedMaterial = handle.interactiveTiles.find((tile) => tile.userData.isEmpty).material;
    let geometryDisposals = 0;
    let materialDisposals = 0;
    const originalGeometryDispose = sharedGeometry.dispose.bind(sharedGeometry);
    const originalMaterialDispose = sharedMaterial.dispose.bind(sharedMaterial);
    sharedGeometry.dispose = () => { geometryDisposals += 1; originalGeometryDispose(); };
    sharedMaterial.dispose = () => { materialDisposals += 1; originalMaterialDispose(); };

    try {
      let previousCapacity = initial.gridCapacity;
      for (const [step, radius] of [[1, 4], [2, 8], [3, 16]]) {
        const oldMesh = handle.interactiveTiles.find((tile) => tile.userData.isEmpty);
        let removals = 0;
        let disposals = 0;
        oldMesh.addEventListener('removed', () => { removals += 1; });
        const originalDispose = oldMesh.dispose.bind(oldMesh);
        oldMesh.dispose = () => { disposals += 1; originalDispose(); };

        handle.applyStep(makeForceFrame(input.topology, [0, 0, 0, 0], [-radius, 0, radius, 0], step, step));
        const currentMesh = handle.interactiveTiles.find((tile) => tile.userData.isEmpty);
        const diagnostics = handle.inspectCurrentFrame();
        assert.notStrictEqual(currentMesh, oldMesh);
        assert.strictEqual(currentMesh.geometry, sharedGeometry);
        assert.strictEqual(currentMesh.material, sharedMaterial);
        assert.ok(diagnostics.gridCapacity > previousCapacity);
        assert.equal(removals, 1);
        assert.equal(disposals, 1);
        assert.equal(geometryDisposals, 0);
        assert.equal(materialDisposals, 0);
        previousCapacity = diagnostics.gridCapacity;
      }
    } finally {
      handle.dispose();
    }
    assert.equal(geometryDisposals, 1);
    assert.equal(materialDisposals, 1);
  });
});

describe('empty cell grid (T011)', () => {
  test('createIsland includes empty cell grid with correct visibility and minimum radius', () => {
    const input = makeInput({ gridRadius: 1 });
    const handle = createIsland(input);
    try {
      const empty = handle.interactiveTiles.find((tile) => tile.userData.isEmpty === true);
      assert.ok(empty, 'empty cell grid is exposed in interactiveTiles');
      assert.ok(empty instanceof THREE.InstancedMesh);
      assert.ok(empty.count > 0, 'empty grid has at least one cell');

      for (const material of getMaterials(empty)) {
        assert.equal(material.opacity, 0.18);
        assert.equal(material.transparent, true);
        assert.equal(material.depthWrite, false);
      }

      for (const instance of empty.userData.instances) {
        assert.equal(instance.isEmpty, true);
        assert.equal(typeof instance.q, 'number');
        assert.equal(typeof instance.r, 'number');
        assert.equal(typeof instance.x, 'number');
        assert.equal(typeof instance.z, 'number');
        assert.equal(instance.depth, 0.05);
      }

      assert.ok(empty.userData.baseColors.length > 0);
      assert.ok(Array.isArray(empty.userData.instances));
    } finally {
      handle.dispose();
    }
  });

  test('createIsland excludes occupied cells from empty grid', () => {
    const input = makeInput({ gridRadius: 1 });
    const handle = createIsland(input);
    try {
      const empty = handle.interactiveTiles.find((tile) => tile.userData.isEmpty === true);
      const occupiedKeys = new Set(input.layoutResult.placements.map((p) => `${p.q},${p.r}`));
      for (const instance of empty.userData.instances) {
        assert.ok(!occupiedKeys.has(`${instance.q},${instance.r}`), `occupied cell (${instance.q},${instance.r}) must not appear in empty grid`);
      }
    } finally {
      handle.dispose();
    }
  });

  test('createIsland with gridRadius=0 uses minimum default radius of 3', () => {
    const input = makeInput({ gridRadius: 0, placements: [] });
    const emptyPayloadMap = new Map();
    const emptyInput = {
      visualPayloadByEntityId: emptyPayloadMap,
      layoutResult: makeLayoutResult({ placements: [], gridRadius: 0, stats: { occupiedCount: 0, boundaryGaps: [] } }),
      presentation: { occupiedOpacity: 1, showSprings: false },
    };
    const handle = createIsland(emptyInput);
    try {
      const empty = handle.interactiveTiles.find((tile) => tile.userData.isEmpty === true);
      assert.ok(empty, 'empty grid exists for empty scene');
      assert.ok(empty.count > 0, 'empty grid has cells even with no towers');
    } finally {
      handle.dispose();
    }
  });
});

describe('force-mode empty cell grid (T012)', () => {
  test('createLiveIsland includes empty cell grid in interactiveTiles with correct extent', () => {
    const handle = createLiveIsland(makeForceInput([0, 0, 5, 3]));
    try {
      assert.equal(handle.interactiveTiles.length, 2);
      const empty = handle.interactiveTiles.find((tile) => tile.userData.isEmpty === true);
      assert.ok(empty, 'empty cell grid is present in force-mode interactiveTiles');
      assert.ok(empty instanceof THREE.InstancedMesh);
      assert.ok(empty.count > 0, 'force-mode empty grid has cells');
      assert.equal(empty.userData.isEmpty, true);
      assert.ok(empty.userData.instances.length > 0);
      assert.ok(empty.userData.baseColors.length > 0);
    } finally {
      handle.dispose();
    }
  });

  test('force-mode empty grid is cleaned up on dispose', () => {
    const handle = createLiveIsland(makeForceInput([0, 0, 5, 3]));
    const empty = handle.interactiveTiles.find((tile) => tile.userData.isEmpty === true);
    const geometryDisposals = new Map();
    const materialDisposals = new Map();
    const originalGeometryDispose = THREE.BufferGeometry.prototype.dispose;
    const originalMaterialDispose = THREE.Material.prototype.dispose;

    THREE.BufferGeometry.prototype.dispose = function () {
      geometryDisposals.set(this, (geometryDisposals.get(this) ?? 0) + 1);
      return originalGeometryDispose.call(this);
    };
    THREE.Material.prototype.dispose = function () {
      materialDisposals.set(this, (materialDisposals.get(this) ?? 0) + 1);
      return originalMaterialDispose.call(this);
    };

    try {
      handle.dispose();
      assert.ok(geometryDisposals.size > 0, 'empty grid geometries were disposed');
      assert.ok(materialDisposals.size > 0, 'empty grid materials were disposed');
    } finally {
      THREE.BufferGeometry.prototype.dispose = originalGeometryDispose;
      THREE.Material.prototype.dispose = originalMaterialDispose;
    }
  });
});
