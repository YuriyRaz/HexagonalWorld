import * as THREE from 'three';

import { adaptSchoolData } from './data.js';
import { HEX_SIZE, axialToPlane, planeToAxial, fractionalAxialRadius } from './hex.js';
import { calculateLayout, layoutAlgorithms } from './layout.js';
import { calculateAssignmentHash } from './force-layout.js';

const WATER_LEVEL = 0.12;
const MIN_TILE_HEIGHT = 0.55;
const MAX_TILE_HEIGHT = 6.2;
const MAX_GRID_RADIUS = 256;
const MAX_VIEWPORT_GRID_RADIUS = 28;
const MAX_SPRING_COUNT = 5999;

const COLOR_PALETTE = Object.freeze([
  0x95aa67,
  0x4fa98c,
  0x7898b2,
  0xb68b62,
  0x8d79aa,
  0x6f9e9e,
]);

function renderFailure(reason, details = {}, cause) {
  const error = new Error('Island rendering failed.', cause === undefined ? undefined : { cause });
  error.code = 'RENDER_FAILED';
  error.details = { reason, ...details };
  return error;
}

function failValidation(reason, details) {
  throw renderFailure(reason, details);
}

function isRecord(value) {
  return value !== null && typeof value === 'object';
}

function validatePayload(payload, entityId) {
  if (!isRecord(payload)) failValidation('INVALID_VISUAL_PAYLOAD', { entityId });
  if (payload.entityId !== entityId) {
    failValidation('PAYLOAD_ID_MISMATCH', { entityId, payloadEntityId: payload.entityId });
  }
  if (typeof payload.title !== 'string' || typeof payload.metadataText !== 'string') {
    failValidation('INVALID_VISUAL_TEXT', { entityId });
  }
  if (!Number.isFinite(payload.heightValue)) {
    failValidation('INVALID_HEIGHT_VALUE', { entityId });
  }
  if (typeof payload.colorGroupId !== 'string' || payload.colorGroupId.length === 0) {
    failValidation('INVALID_COLOR_GROUP_ID', { entityId });
  }
  if (!Number.isSafeInteger(payload.colorGroupOrder) || payload.colorGroupOrder < 0) {
    failValidation('INVALID_COLOR_GROUP_ORDER', { entityId });
  }
  if (!Number.isSafeInteger(payload.colorVariantOrder) || payload.colorVariantOrder < 0) {
    failValidation('INVALID_COLOR_VARIANT_ORDER', { entityId });
  }

  return {
    payload,
    heightValue: payload.heightValue,
    colorGroupOrder: payload.colorGroupOrder,
    colorVariantOrder: payload.colorVariantOrder,
  };
}

function validateEndpoint(endpoint, name, placementByEntityId, anchorByEntityId, gridRadius) {
  if (!isRecord(endpoint)) failValidation('INVALID_SPRING_ENDPOINT', { endpoint: name });
  if (endpoint.kind !== 'leaf' && endpoint.kind !== 'anchor') {
    failValidation('INVALID_SPRING_ENDPOINT_KIND', { endpoint: name, kind: endpoint.kind });
  }
  if (typeof endpoint.entityId !== 'string' || endpoint.entityId.length === 0) {
    failValidation('INVALID_SPRING_ENDPOINT_ID', { endpoint: name });
  }
  if (!Number.isFinite(endpoint.q) || !Number.isFinite(endpoint.r)) {
    failValidation('NONFINITE_SPRING_ENDPOINT', { endpoint: name, entityId: endpoint.entityId });
  }

  const distance = (Math.abs(endpoint.q) + Math.abs(endpoint.r) + Math.abs(endpoint.q + endpoint.r)) / 2;
  if (distance > MAX_GRID_RADIUS) {
    failValidation('SPRING_ENDPOINT_OUTSIDE_GRID', { endpoint: name, entityId: endpoint.entityId });
  }

  if (endpoint.kind === 'leaf') {
    const placement = placementByEntityId.get(endpoint.entityId);
    if (!placement || placement.q !== endpoint.q || placement.r !== endpoint.r) {
      failValidation('INVALID_LEAF_ENDPOINT', { endpoint: name, entityId: endpoint.entityId });
    }
    return;
  }

  const previous = anchorByEntityId.get(endpoint.entityId);
  if (previous && (previous.q !== endpoint.q || previous.r !== endpoint.r)) {
    failValidation('INCONSISTENT_ANCHOR_ENDPOINT', { endpoint: name, entityId: endpoint.entityId });
  }
  if (!previous) anchorByEntityId.set(endpoint.entityId, { q: endpoint.q, r: endpoint.r });
}

function validateInput(input) {
  if (!isRecord(input)) failValidation('INVALID_RENDER_INPUT');

  const { visualPayloadByEntityId, layoutResult, presentation } = input;
  if (!(visualPayloadByEntityId instanceof Map)) failValidation('INVALID_PAYLOAD_MAP');
  if (!isRecord(layoutResult)) failValidation('INVALID_LAYOUT_RESULT');
  if (!isRecord(presentation)) failValidation('INVALID_PRESENTATION');
  if (!Array.isArray(layoutResult.placements)) failValidation('INVALID_PLACEMENTS');
  if (!Array.isArray(layoutResult.springs)) failValidation('INVALID_SPRINGS');
  if (
    !Number.isSafeInteger(layoutResult.gridRadius)
    || layoutResult.gridRadius < 0
    || layoutResult.gridRadius > MAX_GRID_RADIUS
  ) {
    failValidation('INVALID_GRID_RADIUS', { gridRadius: layoutResult.gridRadius });
  }
  if (
    !Number.isFinite(presentation.occupiedOpacity)
    || presentation.occupiedOpacity < 0
    || presentation.occupiedOpacity > 1
    || typeof presentation.showSprings !== 'boolean'
  ) {
    failValidation('INVALID_PRESENTATION');
  }

  const placements = new Array(layoutResult.placements.length);
  const placementByEntityId = new Map();
  const occupiedCells = new Set();

  for (let index = 0; index < layoutResult.placements.length; index += 1) {
    const placement = layoutResult.placements[index];
    if (!isRecord(placement) || typeof placement.entityId !== 'string' || placement.entityId.length === 0) {
      failValidation('INVALID_PLACEMENT', { index });
    }
    if (!Number.isSafeInteger(placement.q) || !Number.isSafeInteger(placement.r)) {
      failValidation('INVALID_PLACEMENT_CELL', { entityId: placement.entityId });
    }
    if (placementByEntityId.has(placement.entityId)) {
      failValidation('DUPLICATE_PAYLOAD_JOIN', { entityId: placement.entityId });
    }

    const cellKey = `${placement.q},${placement.r}`;
    if (occupiedCells.has(cellKey)) failValidation('DUPLICATE_PLACEMENT_CELL', { cellKey });
    const distance = (
      Math.abs(placement.q) + Math.abs(placement.r) + Math.abs(placement.q + placement.r)
    ) / 2;
    if (distance > layoutResult.gridRadius) {
      failValidation('PLACEMENT_OUTSIDE_GRID', { entityId: placement.entityId });
    }

    if (!visualPayloadByEntityId.has(placement.entityId)) {
      failValidation('MISSING_VISUAL_PAYLOAD', { entityId: placement.entityId });
    }
    const visual = validatePayload(
      visualPayloadByEntityId.get(placement.entityId),
      placement.entityId,
    );
    const validatedPlacement = { ...placement, ...visual };
    placements[index] = validatedPlacement;
    placementByEntityId.set(placement.entityId, validatedPlacement);
    occupiedCells.add(cellKey);
  }

  if (visualPayloadByEntityId.size !== placements.length) {
    failValidation('UNJOINED_VISUAL_PAYLOAD', {
      payloadCount: visualPayloadByEntityId.size,
      placementCount: placements.length,
    });
  }
  for (const entityId of visualPayloadByEntityId.keys()) {
    if (!placementByEntityId.has(entityId)) failValidation('UNJOINED_VISUAL_PAYLOAD', { entityId });
  }

  const { springs } = layoutResult;
  if (!presentation.showSprings && springs.length !== 0) {
    failValidation('HIDDEN_SPRINGS_PRESENT', { springCount: springs.length });
  }
  if (springs.length > MAX_SPRING_COUNT) {
    failValidation('TOO_MANY_SPRINGS', { springCount: springs.length });
  }
  if (springs.length > 0 && layoutResult.mode !== 'force-anchors') {
    failValidation('SPRINGS_IN_LEGACY_LAYOUT', { mode: layoutResult.mode });
  }

  const anchorByEntityId = new Map();
  const springKeys = new Set();
  for (let index = 0; index < springs.length; index += 1) {
    const spring = springs[index];
    if (!isRecord(spring)) failValidation('INVALID_SPRING', { index });
    validateEndpoint(
      spring.source,
      `springs[${index}].source`,
      placementByEntityId,
      anchorByEntityId,
      layoutResult.gridRadius,
    );
    validateEndpoint(
      spring.target,
      `springs[${index}].target`,
      placementByEntityId,
      anchorByEntityId,
      layoutResult.gridRadius,
    );
    if (spring.target.kind !== 'anchor') {
      failValidation('INVALID_SPRING_TARGET', { index, kind: spring.target.kind });
    }

    const key = JSON.stringify([
      spring.source.kind,
      spring.source.entityId,
      spring.source.q,
      spring.source.r,
      spring.target.kind,
      spring.target.entityId,
      spring.target.q,
      spring.target.r,
    ]);
    if (springKeys.has(key)) failValidation('DUPLICATE_SPRING', { index });
    springKeys.add(key);
  }

  return {
    placements,
    occupiedCells,
    gridRadius: layoutResult.gridRadius,
    stats: layoutResult.stats,
  };
}

function createOwnershipLedger() {
  const objects = new Set();
  const geometries = new Set();
  const materials = new Set();
  let disposed = false;

  function ownObject(object) {
    objects.add(object);
    return object;
  }

  function ownGeometry(geometry) {
    geometries.add(geometry);
    return geometry;
  }

  function ownMaterial(material) {
    materials.add(material);
    return material;
  }

  function releaseObject(object) {
    if (!objects.delete(object)) return;
    object.removeFromParent();
    if (typeof object.dispose === 'function') object.dispose();
  }

  function releaseGeometry(geometry) {
    if (!geometries.delete(geometry)) return;
    geometry.dispose();
  }

  function releaseMaterial(material) {
    if (!materials.delete(material)) return;
    material.dispose();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    let firstError;
    const attempt = (operation) => {
      try {
        operation();
      } catch (error) {
        firstError ??= error;
      }
    };

    for (const object of [...objects].reverse()) {
      attempt(() => object.removeFromParent());
    }
    for (const object of objects) {
      if (typeof object.dispose === 'function') attempt(() => object.dispose());
    }
    for (const geometry of geometries) attempt(() => geometry.dispose());
    for (const material of materials) attempt(() => material.dispose());

    objects.clear();
    geometries.clear();
    materials.clear();
    if (firstError) throw firstError;
  }

  return { ownObject, ownGeometry, ownMaterial, releaseObject, releaseGeometry, releaseMaterial, dispose };
}

function noise(q, r) {
  const a = Math.sin(q * 12.9898 + r * 78.233) * 43758.5453;
  const b = Math.sin(q * 3.17 - r * 5.71 + 1.2) * 1437.1;
  return ((a - Math.floor(a)) * 0.66 + (b - Math.floor(b)) * 0.34) * 2 - 1;
}

function smoothNoise(q, r) {
  return noise(q, r) * 0.56 + (
    noise(q + 1, r) + noise(q - 1, r) + noise(q, r + 1) + noise(q, r - 1)
  ) * 0.11;
}

function computeViewportGroundRadius(camera, world) {
  const groundY = WATER_LEVEL;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const camToGround = groundY - camera.position.y;
  if (Math.abs(forward.y) < 1e-6 || camToGround * forward.y >= 0) {
    return 0;
  }
  const t = camToGround / forward.y;
  const groundHit = new THREE.Vector3().copy(forward).multiplyScalar(t).add(camera.position);
  const worldOffset = world.position.x;

  const corners = [
    new THREE.Vector2(-1, 1),
    new THREE.Vector2(1, 1),
    new THREE.Vector2(-1, -1),
    new THREE.Vector2(1, -1),
  ];

  let minQ = Infinity;
  let maxQ = -Infinity;
  let minR = Infinity;
  let maxR = -Infinity;
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
  const intersection = new THREE.Vector3();

  for (const corner of corners) {
    raycaster.setFromCamera(corner, camera);
    if (raycaster.ray.intersectPlane(groundPlane, intersection)) {
      const axial = planeToAxial(intersection.x - worldOffset, intersection.z);
      const fq = fractionalAxialRadius(axial.q, axial.r);
      const fr = fractionalAxialRadius(axial.r, -axial.q - axial.r);
      const fs = fractionalAxialRadius(-axial.q - axial.r, axial.q);
      minQ = Math.min(minQ, fq);
      maxQ = Math.max(maxQ, fq);
      minR = Math.min(minR, fr);
      maxR = Math.max(maxR, fr);
    }
  }

  if (!Number.isFinite(maxQ) && !Number.isFinite(maxR)) {
    return 0;
  }

  const viewportRadius = Math.ceil(Math.max(
    Number.isFinite(maxQ) ? maxQ : 0,
    Number.isFinite(maxR) ? maxR : 0,
  ) + 1);
  return Math.min(viewportRadius, MAX_VIEWPORT_GRID_RADIUS);
}

function createEmptyCellGrid(ownership, gridRadius, occupiedCells, viewportRadius = 0) {
  const effectiveRadius = Math.max(
    gridRadius > 0 ? gridRadius : 3,
    viewportRadius,
  );

  const emptyCellPositions = [];
  for (let q = -effectiveRadius; q <= effectiveRadius; q += 1) {
    const minR = Math.max(-effectiveRadius, -q - effectiveRadius);
    const maxR = Math.min(effectiveRadius, -q + effectiveRadius);
    for (let r = minR; r <= maxR; r += 1) {
      if (!occupiedCells.has(`${q},${r}`)) emptyCellPositions.push({ q, r });
    }
  }

  const emptyGeometry = ownership.ownGeometry(new THREE.CylinderGeometry(
    HEX_SIZE * 0.96,
    HEX_SIZE * 0.96,
    0.05,
    6,
  ));
  const emptyMaterial = ownership.ownMaterial(new THREE.MeshBasicMaterial({
    color: 0x4fa98c,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  }));
  const emptyTiles = ownership.ownObject(new THREE.InstancedMesh(
    emptyGeometry,
    emptyMaterial,
    emptyCellPositions.length,
  ));
  const emptyInstances = new Array(emptyCellPositions.length);
  const emptyBaseColors = new Float32Array(emptyCellPositions.length * 3);
  const emptyColor = new THREE.Color(0x4fa98c);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();

  emptyCellPositions.forEach(({ q, r }, index) => {
    const { x, z } = axialToPlane(q, r);
    position.set(x, WATER_LEVEL + 0.015, z);
    scale.set(1, 1, 1);
    matrix.compose(position, rotation, scale);
    emptyTiles.setMatrixAt(index, matrix);
    emptyTiles.setColorAt(index, emptyColor);
    emptyColor.toArray(emptyBaseColors, index * 3);
    emptyInstances[index] = {
      q,
      r,
      x,
      y: WATER_LEVEL + 0.015,
      z,
      depth: 0.05,
      isEmpty: true,
    };
  });
  emptyTiles.instanceColor?.setUsage(THREE.DynamicDrawUsage);
  emptyTiles.userData = { isEmpty: true, instances: emptyInstances, baseColors: emptyBaseColors };
  emptyTiles.renderOrder = 2;
  emptyTiles.computeBoundingSphere();

  return { mesh: emptyTiles, instances: emptyInstances, baseColors: emptyBaseColors };
}

function validateForceTopology(topology, visualPayloadByEntityId) {
  if (!isRecord(topology) || !Array.isArray(topology.nodeIds) || !Array.isArray(topology.nodeKinds) || !Array.isArray(topology.relations)
    || topology.nodeIds.length === 0 || topology.nodeIds.length !== topology.nodeKinds.length) {
    failValidation('INVALID_FORCE_TOPOLOGY');
  }
  const ids = new Set();
  const leafIndices = [];
  const leafIds = [];
  const leafOrdinalByNode = new Int32Array(topology.nodeIds.length);
  leafOrdinalByNode.fill(-1);
  for (let index = 0; index < topology.nodeIds.length; index += 1) {
    const id = topology.nodeIds[index];
    const kind = topology.nodeKinds[index];
    if (typeof id !== 'string' || id.length === 0 || ids.has(id) || (kind !== 'leaf' && kind !== 'anchor')) failValidation('INVALID_FORCE_TOPOLOGY');
    ids.add(id);
    if (kind === 'leaf') {
      leafOrdinalByNode[index] = leafIds.length;
      leafIndices.push(index);
      leafIds.push(id);
    }
  }
  if (visualPayloadByEntityId.size !== leafIds.length) failValidation('INVALID_FORCE_PLACEMENTS');
  for (const leafId of leafIds) {
    if (!visualPayloadByEntityId.has(leafId)) failValidation('MISSING_VISUAL_PAYLOAD', { entityId: leafId });
    validatePayload(visualPayloadByEntityId.get(leafId), leafId);
  }
  for (const relation of topology.relations) {
    if (!Number.isSafeInteger(relation.sourceIndex) || !Number.isSafeInteger(relation.targetIndex)
      || relation.sourceIndex < 0 || relation.targetIndex < 0
      || relation.sourceIndex >= topology.nodeIds.length || relation.targetIndex >= topology.nodeIds.length) {
      failValidation('INVALID_FORCE_RELATION');
    }
  }
  return { leafIndices, leafIds, leafOrdinalByNode };
}

function createForceFrameScratch(topology, leafCount) {
  return {
    x: new Float32Array(leafCount),
    z: new Float32Array(leafCount),
    q: new Int16Array(leafCount),
    r: new Int16Array(leafCount),
    springPositions: new Float32Array(topology.relations.length * 6),
    cellIndexes: new Set(),
    gridRadius: 0,
  };
}

function validateForceFrame(topology, topologyInfo, frame, expectedGlobalStep, scratch) {
  if (!isRecord(frame) || frame.requestId !== topology.requestId
    || !Number.isSafeInteger(frame.globalStep) || frame.globalStep < 0
    || (expectedGlobalStep !== null && frame.globalStep !== expectedGlobalStep)
    || !(frame.positions instanceof Float32Array) || frame.positions.length !== topology.nodeIds.length * 2
    || !(frame.leafCells instanceof Int16Array) || frame.leafCells.length !== topologyInfo.leafIds.length * 2
    || !Number.isSafeInteger(frame.assignmentRevision) || frame.assignmentRevision < 0
    || !Number.isSafeInteger(frame.assignmentHash)) {
    failValidation('INVALID_FORCE_FRAME');
  }
  for (const value of frame.positions) if (!Number.isFinite(value)) failValidation('NONFINITE_FORCE_FRAME');
  if (calculateAssignmentHash(topologyInfo.leafIds, frame.leafCells) !== frame.assignmentHash) failValidation('ASSIGNMENT_HASH_MISMATCH');

  scratch.cellIndexes.clear();
  scratch.gridRadius = 0;
  for (let index = 0; index < topologyInfo.leafIds.length; index += 1) {
    const q = frame.leafCells[index * 2];
    const r = frame.leafCells[index * 2 + 1];
    const radius = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
    const cellIndex = (q + MAX_GRID_RADIUS) * (MAX_GRID_RADIUS * 2 + 1) + r + MAX_GRID_RADIUS;
    if (radius > MAX_GRID_RADIUS) failValidation('LEAF_CELL_OUTSIDE_GRID', { entityId: topologyInfo.leafIds[index] });
    if (scratch.cellIndexes.has(cellIndex)) failValidation('DUPLICATE_LEAF_CELL', { entityId: topologyInfo.leafIds[index] });
    scratch.cellIndexes.add(cellIndex);
    const center = axialToPlane(q, r);
    scratch.q[index] = q;
    scratch.r[index] = r;
    scratch.x[index] = center.x;
    scratch.z[index] = center.z;
    scratch.gridRadius = Math.max(scratch.gridRadius, radius);
  }

  for (let index = 0; index < topology.relations.length; index += 1) {
    const relation = topology.relations[index];
    for (let endpoint = 0; endpoint < 2; endpoint += 1) {
      const nodeIndex = endpoint === 0 ? relation.sourceIndex : relation.targetIndex;
      const leafOrdinal = topologyInfo.leafOrdinalByNode[nodeIndex];
      const offset = index * 6 + endpoint * 3;
      scratch.springPositions[offset] = leafOrdinal >= 0 ? scratch.x[leafOrdinal] : frame.positions[nodeIndex * 2];
      scratch.springPositions[offset + 1] = 0;
      scratch.springPositions[offset + 2] = leafOrdinal >= 0 ? scratch.z[leafOrdinal] : frame.positions[nodeIndex * 2 + 1];
    }
  }
  return scratch;
}

function validateStableForceResult(layoutResult, terminalFrame, topologyInfo) {
  if (!isRecord(layoutResult) || layoutResult.mode !== 'force-anchors' || !Array.isArray(layoutResult.placements)
    || layoutResult.placements.length !== topologyInfo.leafIds.length || terminalFrame.terminal !== 'converged') {
    failValidation('INVALID_FORCE_LAYOUT_RESULT');
  }
  for (let index = 0; index < topologyInfo.leafIds.length; index += 1) {
    const placement = layoutResult.placements[index];
    if (placement?.entityId !== topologyInfo.leafIds[index]
      || placement.q !== terminalFrame.leafCells[index * 2]
      || placement.r !== terminalFrame.leafCells[index * 2 + 1]) failValidation('TERMINAL_PLACEMENT_MISMATCH');
  }
}

function createForceIsland(input, stable) {
  const {
    visualPayloadByEntityId,
    topology,
    initialFrame,
    terminalFrame = initialFrame,
    layoutResult = null,
    presentation = { occupiedOpacity: 0.5, showSprings: true },
  } = input;
  if (!(visualPayloadByEntityId instanceof Map)) failValidation('INVALID_PAYLOAD_MAP');
  if (!isRecord(presentation) || typeof presentation.showSprings !== 'boolean'
    || !Number.isFinite(presentation.occupiedOpacity) || presentation.occupiedOpacity < 0 || presentation.occupiedOpacity > 1) {
    failValidation('INVALID_PRESENTATION');
  }
  const topologyInfo = validateForceTopology(topology, visualPayloadByEntityId);
  const frame = stable ? terminalFrame : initialFrame;
  const scratch = createForceFrameScratch(topology, topologyInfo.leafIds.length);
  validateForceFrame(topology, topologyInfo, frame, null, scratch);
  if (stable) validateStableForceResult(layoutResult, terminalFrame, topologyInfo);

  const ownership = createOwnershipLedger();
  try {
    const root = ownership.ownObject(new THREE.Group());
    const occupiedGeometry = ownership.ownGeometry(new THREE.CylinderGeometry(HEX_SIZE * 1.005, HEX_SIZE * 1.005, 1, 6, 1, false));
    const translucent = presentation.occupiedOpacity < 1;
    const occupiedMaterial = ownership.ownMaterial(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.84,
      metalness: 0.02,
      flatShading: true,
      opacity: presentation.occupiedOpacity,
      transparent: translucent,
      depthWrite: !translucent,
      fog: !translucent,
      toneMapped: !translucent,
    }));
    const occupiedTiles = ownership.ownObject(new THREE.InstancedMesh(occupiedGeometry, occupiedMaterial, topologyInfo.leafIds.length));
    const instances = new Array(topologyInfo.leafIds.length);
    const baseColors = new Float32Array(topologyInfo.leafIds.length * 3);
    const currentLeafCells = new Int16Array(topologyInfo.leafIds.length * 2);
    const occupiedCells = new Set();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const color = new THREE.Color();
    let worldSize = 18;
    let gridRadius = 0;
    let currentAssignmentRevision = -1;
    let currentAssignmentHash = 0;

    for (let index = 0; index < topologyInfo.leafIds.length; index += 1) {
      const entityId = topologyInfo.leafIds[index];
      const visual = validatePayload(visualPayloadByEntityId.get(entityId), entityId);
      const normalizedHeight = Math.min(100, Math.max(0, visual.heightValue)) / 100;
      const height = MIN_TILE_HEIGHT + normalizedHeight * (MAX_TILE_HEIGHT - MIN_TILE_HEIGHT);
      instances[index] = { entityId, payload: visual.payload, q: 0, r: 0, x: 0, y: 0, z: 0, depth: 0, height };
      color.set(COLOR_PALETTE[visual.colorGroupOrder % COLOR_PALETTE.length]);
      occupiedTiles.setColorAt(index, color);
      color.toArray(baseColors, index * 3);
    }
    occupiedTiles.userData = { instances, baseColors, nodeIndices: topologyInfo.leafIndices };
    occupiedTiles.castShadow = topologyInfo.leafIds.length <= 2500;
    occupiedTiles.receiveShadow = true;
    occupiedTiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    occupiedTiles.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    root.add(occupiedTiles);

    const emptyGeometry = ownership.ownGeometry(new THREE.CylinderGeometry(HEX_SIZE * 0.96, HEX_SIZE * 0.96, 0.05, 6));
    const emptyMaterial = ownership.ownMaterial(new THREE.MeshBasicMaterial({ color: 0x4fa98c, transparent: true, opacity: 0.18, depthWrite: false }));
    const emptyColor = new THREE.Color(0x4fa98c);
    let emptyTiles = null;
    let emptyCapacity = 0;
    let emptyInstances = [];
    let emptyBaseColors = new Float32Array(0);
    let viewportRadius = 0;
    const minimumGridRadius = topologyInfo.leafIds.length >= 500 ? 25 : 3;
    const interactiveTiles = [occupiedTiles];

    const updateEmptyGrid = () => {
      const effectiveRadius = Math.min(MAX_GRID_RADIUS, Math.max(gridRadius, minimumGridRadius, viewportRadius));
      const requiredCapacity = 1 + 3 * effectiveRadius * (effectiveRadius + 1);
      if (requiredCapacity > emptyCapacity) {
        const oldMesh = emptyTiles;
        emptyCapacity = requiredCapacity;
        emptyInstances = new Array(emptyCapacity);
        emptyBaseColors = new Float32Array(emptyCapacity * 3);
        emptyTiles = ownership.ownObject(new THREE.InstancedMesh(emptyGeometry, emptyMaterial, emptyCapacity));
        emptyTiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        emptyTiles.instanceColor?.setUsage(THREE.DynamicDrawUsage);
        emptyTiles.renderOrder = 2;
        if (oldMesh) {
          const interactionIndex = interactiveTiles.indexOf(oldMesh);
          ownership.releaseObject(oldMesh);
          if (interactionIndex >= 0) interactiveTiles[interactionIndex] = emptyTiles;
        } else interactiveTiles.push(emptyTiles);
        root.add(emptyTiles);
      }
      let count = 0;
      for (let q = -effectiveRadius; q <= effectiveRadius; q += 1) {
        const minR = Math.max(-effectiveRadius, -q - effectiveRadius);
        const maxR = Math.min(effectiveRadius, -q + effectiveRadius);
        for (let r = minR; r <= maxR; r += 1) {
          if (occupiedCells.has(`${q},${r}`)) continue;
          const center = axialToPlane(q, r);
          position.set(center.x, WATER_LEVEL + 0.015, center.z);
          scale.set(1, 1, 1);
          matrix.compose(position, rotation, scale);
          emptyTiles.setMatrixAt(count, matrix);
          emptyTiles.setColorAt(count, emptyColor);
          emptyColor.toArray(emptyBaseColors, count * 3);
          emptyInstances[count] ||= {};
          Object.assign(emptyInstances[count], { q, r, x: center.x, y: WATER_LEVEL + 0.015, z: center.z, depth: 0.05, isEmpty: true });
          count += 1;
        }
      }
      emptyInstances.length = count;
      emptyTiles.count = count;
      emptyTiles.userData = { isEmpty: true, instances: emptyInstances, baseColors: emptyBaseColors };
      emptyTiles.instanceMatrix.needsUpdate = true;
      if (emptyTiles.instanceColor) emptyTiles.instanceColor.needsUpdate = true;
      emptyTiles.computeBoundingSphere();
    };

    const springPositions = new Float32Array(topology.relations.length * 6);
    const springGeometry = topology.relations.length > 0 ? ownership.ownGeometry(new THREE.BufferGeometry()) : null;
    const springMaterial = topology.relations.length > 0 ? ownership.ownMaterial(new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: true, depthWrite: false, transparent: true, opacity: 1, fog: false })) : null;
    const springs = topology.relations.length > 0 ? ownership.ownObject(new THREE.LineSegments(springGeometry, springMaterial)) : null;
    if (springs) {
      springGeometry.setAttribute('position', new THREE.BufferAttribute(springPositions, 3));
      springs.raycast = () => {};
      root.add(springs);
    }

    const commitPreparedFrame = (preparedFrame, prepared) => {
      const assignmentsChanged = preparedFrame.assignmentRevision !== currentAssignmentRevision;
      if (!assignmentsChanged && preparedFrame.assignmentHash !== currentAssignmentHash) failValidation('ASSIGNMENT_REVISION_MISMATCH');
      if (preparedFrame.assignmentRevision < currentAssignmentRevision) failValidation('STALE_ASSIGNMENT_REVISION');
      if (assignmentsChanged) {
        occupiedCells.clear();
        for (let index = 0; index < instances.length; index += 1) {
          const record = instances[index];
          const q = prepared.q[index];
          const r = prepared.r[index];
          const x = prepared.x[index];
          const z = prepared.z[index];
          const depth = record.height + 1.4;
          const y = record.height / 2 - 0.62;
          position.set(x, y, z);
          scale.set(1, depth, 1);
          matrix.compose(position, rotation, scale);
          occupiedTiles.setMatrixAt(index, matrix);
          Object.assign(record, { q, r, x, y, z, depth });
          occupiedCells.add(`${q},${r}`);
          worldSize = Math.max(worldSize, Math.hypot(x, z) + HEX_SIZE * 2);
        }
        currentLeafCells.set(preparedFrame.leafCells);
        currentAssignmentRevision = preparedFrame.assignmentRevision;
        currentAssignmentHash = preparedFrame.assignmentHash;
        gridRadius = prepared.gridRadius;
        occupiedTiles.instanceMatrix.needsUpdate = true;
        if (occupiedTiles.instanceColor) occupiedTiles.instanceColor.needsUpdate = true;
        occupiedTiles.computeBoundingSphere();
        updateEmptyGrid();
      }
      if (springs) {
        springPositions.set(prepared.springPositions);
        springGeometry.attributes.position.needsUpdate = true;
        springGeometry.computeBoundingSphere();
        springGeometry.computeBoundingBox();
      }
    };

    commitPreparedFrame(frame, scratch);
    let lastGlobalStep = frame.globalStep;
    let retired = false;
    const handle = {
      requestId: topology.requestId,
      root,
      interactiveTiles,
      get leafCells() { return currentLeafCells; },
      applyStep(nextFrame) {
        if (retired) throw renderFailure('RETIRED_ISLAND');
        validateForceFrame(topology, topologyInfo, nextFrame, lastGlobalStep + 1, scratch);
        commitPreparedFrame(nextFrame, scratch);
        lastGlobalStep = nextFrame.globalStep;
      },
      inspectCurrentFrame() {
        return {
          requestId: topology.requestId,
          globalStep: lastGlobalStep,
          assignmentRevision: currentAssignmentRevision,
          assignmentHash: currentAssignmentHash,
          leafCells: Array.from(currentLeafCells),
          towers: instances.map(({ entityId, q, r, x, z }) => ({ entityId, q, r, x, z })),
          occupiedCells: [...occupiedCells].sort(),
          emptyCellCount: emptyTiles?.count ?? 0,
          springPositions: Array.from(springPositions),
          resourceCounts: { geometries: topology.relations.length > 0 ? 3 : 2, materials: topology.relations.length > 0 ? 3 : 2, meshes: topology.relations.length > 0 ? 3 : 2 },
          resourceIdentity: {
            occupiedMesh: occupiedTiles.uuid,
            occupiedGeometry: occupiedGeometry.uuid,
            occupiedMaterial: occupiedMaterial.uuid,
            emptyMesh: emptyTiles?.uuid ?? null,
            emptyGeometry: emptyGeometry.uuid,
            emptyMaterial: emptyMaterial.uuid,
          },
          gridCapacity: emptyCapacity,
        };
      },
      retire() {
        if (retired) return;
        retired = true;
        root.removeFromParent();
      },
      dispose() {
        if (!retired) retired = true;
        ownership.dispose();
      },
      updateViewportRadius(camera, world) {
        const nextRadius = Math.min(MAX_GRID_RADIUS, computeViewportGroundRadius(camera, world));
        if (nextRadius === viewportRadius) return;
        viewportRadius = nextRadius;
        updateEmptyGrid();
      },
      stats: layoutResult?.stats ?? { occupiedCount: topologyInfo.leafIds.length, boundaryGaps: [] },
      worldSize,
      stable,
      terminalFrame: stable ? terminalFrame : null,
    };
    return handle;
  } catch (cause) {
    try { ownership.dispose(); } catch {}
    if (cause?.code === 'RENDER_FAILED') throw cause;
    throw renderFailure('CONSTRUCTION_FAILED', {}, cause);
  }
}

export function createLiveIsland(input) {
  return createForceIsland(input, false);
}

export function createIsland(input) {
  if (input?.topology && input?.terminalFrame) return createForceIsland(input, true);
  const validated = validateInput(input);
  const { presentation } = input;
  const ownership = createOwnershipLedger();

  try {
    const root = ownership.ownObject(new THREE.Group());
    const interactiveTiles = [];
    const tileGeometry = ownership.ownGeometry(new THREE.CylinderGeometry(
      HEX_SIZE * 1.005,
      HEX_SIZE * 1.005,
      1,
      6,
      1,
      false,
    ));
    const isTranslucent = presentation.occupiedOpacity < 1;
    const tileMaterial = ownership.ownMaterial(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.84,
      metalness: 0.02,
      flatShading: true,
      opacity: presentation.occupiedOpacity,
      transparent: isTranslucent,
      depthWrite: !isTranslucent,
      fog: !isTranslucent,
      toneMapped: !isTranslucent,
    }));
    const occupiedTiles = ownership.ownObject(new THREE.InstancedMesh(
      tileGeometry,
      tileMaterial,
      validated.placements.length,
    ));
    const instances = new Array(validated.placements.length);
    const baseColors = new Float32Array(validated.placements.length * 3);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const color = new THREE.Color();
    let worldSize = 18;

    validated.placements.forEach((placement, instanceIndex) => {
      const {
        q,
        r,
        payload,
        heightValue,
        colorGroupOrder,
        colorVariantOrder,
      } = placement;
      const detail = smoothNoise(q, r);
      const normalizedHeight = Math.min(100, Math.max(0, heightValue)) / 100;
      const height = MIN_TILE_HEIGHT + normalizedHeight * (MAX_TILE_HEIGHT - MIN_TILE_HEIGHT);
      const classShift = ((colorVariantOrder % 5) - 2) * 0.025;
      color.set(COLOR_PALETTE[colorGroupOrder % COLOR_PALETTE.length]).offsetHSL(
        classShift + detail * 0.018,
        detail * 0.035,
        classShift * 0.85 + detail * 0.03,
      );
      const { x, z } = axialToPlane(q, r);
      const depth = height + 1.4;
      const y = height / 2 - 0.62;

      position.set(x, y, z);
      scale.set(1, depth, 1);
      matrix.compose(position, rotation, scale);
      occupiedTiles.setMatrixAt(instanceIndex, matrix);
      occupiedTiles.setColorAt(instanceIndex, color);
      color.toArray(baseColors, instanceIndex * 3);
      instances[instanceIndex] = { q, r, x, y, z, depth, height, payload };
      worldSize = Math.max(worldSize, Math.hypot(x, z) + HEX_SIZE * 2);
    });

    occupiedTiles.castShadow = validated.placements.length <= 2500;
    occupiedTiles.receiveShadow = true;
    occupiedTiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    occupiedTiles.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    occupiedTiles.userData = { instances, baseColors };
    occupiedTiles.computeBoundingSphere();
    root.add(occupiedTiles);
    interactiveTiles.push(occupiedTiles);

    const { mesh: emptyTiles, baseColors: emptyBaseColors } = createEmptyCellGrid(
      ownership,
      validated.gridRadius,
      validated.occupiedCells,
    );
    root.add(emptyTiles);
    interactiveTiles.push(emptyTiles);

    let currentEmptyTiles = emptyTiles;

    const waterGeometry = ownership.ownGeometry(new THREE.PlaneGeometry(10000, 10000));
    const waterOpacity = isTranslucent ? 0.0 : 0.86;
    const waterMaterial = ownership.ownMaterial(new THREE.MeshPhysicalMaterial({
      color: 0x143f3d,
      roughness: 0.27,
      metalness: 0.08,
      transparent: true,
      opacity: waterOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    }));
    if (!isTranslucent) {
      waterMaterial.transmission = 0.05;
      waterMaterial.clearcoat = 0.35;
      waterMaterial.clearcoatRoughness = 0.34;
    }
    const water = ownership.ownObject(new THREE.Mesh(waterGeometry, waterMaterial));
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_LEVEL;
    water.receiveShadow = true;
    water.visible = !isTranslucent;
    root.add(water);

    const waterRings = [];
    const ringStart = Math.max(12.8, worldSize * 0.72);
    for (let index = 0; index < 7; index += 1) {
      const innerRadius = ringStart + index * 2.8;
      const ringGeometry = ownership.ownGeometry(new THREE.RingGeometry(
        innerRadius,
        innerRadius + 0.04,
        96,
      ));
      const ringMaterial = ownership.ownMaterial(new THREE.MeshBasicMaterial({
        color: 0x77b1a0,
        transparent: true,
        opacity: 0.05 - index * 0.004,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }));
      const ring = ownership.ownObject(new THREE.Mesh(ringGeometry, ringMaterial));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = WATER_LEVEL + 0.012;
      ring.scale.y = 0.82;
      root.add(ring);
      waterRings.push(ring);
    }

    const glowGeometry = ownership.ownGeometry(new THREE.CircleGeometry(
      Math.max(25, worldSize * 1.08),
      72,
    ));
    const glowMaterial = ownership.ownMaterial(new THREE.MeshBasicMaterial({
      color: 0x3e9a79,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }));
    const groundGlow = ownership.ownObject(new THREE.Mesh(glowGeometry, glowMaterial));
    groundGlow.rotation.x = -Math.PI / 2;
    groundGlow.position.y = WATER_LEVEL + 0.02;
    groundGlow.visible = !isTranslucent;
    root.add(groundGlow);

    const springs = input.layoutResult.springs;
    if (presentation.showSprings && springs && springs.length > 0) {
      const positions = new Float32Array(springs.length * 2 * 3);
      springs.forEach((spring, index) => {
        const sourcePt = axialToPlane(spring.source.q, spring.source.r);
        positions[index * 6 + 0] = sourcePt.x;
        positions[index * 6 + 1] = 0;
        positions[index * 6 + 2] = sourcePt.z;

        const targetPt = axialToPlane(spring.target.q, spring.target.r);
        positions[index * 6 + 3] = targetPt.x;
        positions[index * 6 + 4] = 0;
        positions[index * 6 + 5] = targetPt.z;
      });

      const springGeometry = ownership.ownGeometry(new THREE.BufferGeometry());
      springGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      springGeometry.computeBoundingSphere();
      springGeometry.computeBoundingBox();

      const springMaterial = ownership.ownMaterial(new THREE.LineBasicMaterial({
        color: 0xffffff,
        depthTest: true,
        depthWrite: false,
        transparent: true,
        opacity: 1,
        fog: false,
      }));

      const springMesh = ownership.ownObject(new THREE.LineSegments(springGeometry, springMaterial));
      springMesh.raycast = () => {};
      root.add(springMesh);
    }

    return {
      root,
      interactiveTiles,
      water,
      waterRings,
      worldSize,
      stats: validated.stats,
      dispose: ownership.dispose,
      inspectCurrentFrame() {
        let geometries = 0;
        let materials = 0;
        let meshes = 0;
        root.traverse((object) => {
          if (object.geometry) geometries += 1;
          if (object.material) materials += Array.isArray(object.material) ? object.material.length : 1;
          if (object.isMesh || object.isLineSegments) meshes += 1;
        });
        return {
          requestId: input.layoutResult.requestId,
          globalStep: input.layoutResult.diagnostics?.globalStep ?? 0,
          assignmentRevision: input.layoutResult.diagnostics?.assignmentRevision ?? 0,
          assignmentHash: input.layoutResult.diagnostics?.assignmentHash ?? null,
          leafCells: instances.flatMap(({ q, r }) => [q, r]),
          towers: instances.map(({ payload, q, r, x, z }) => ({ entityId: payload.entityId, q, r, x, z })),
          occupiedCells: [...validated.occupiedCells].sort(),
          springPositions: [],
          emptyCellCount: currentEmptyTiles.count,
          resourceCounts: { geometries, materials, meshes },
          resourceIdentity: {
            occupiedMesh: occupiedTiles.uuid,
            occupiedGeometry: tileGeometry.uuid,
            occupiedMaterial: tileMaterial.uuid,
            emptyMesh: currentEmptyTiles.uuid,
            emptyGeometry: currentEmptyTiles.geometry.uuid,
            emptyMaterial: currentEmptyTiles.material.uuid,
          },
          gridCapacity: currentEmptyTiles.instanceMatrix.count,
        };
      },
      _viewportState: {
        ownership,
        gridRadius: validated.gridRadius,
        occupiedCells: validated.occupiedCells,
        root,
        currentEmptyTiles,
        interactiveTiles,
        viewportRadius: 0,
      },
      updateViewportRadius(camera, world) {
        const vs = this._viewportState;
        if (!vs) return;
        const viewportRadius = computeViewportGroundRadius(camera, world);
        if (viewportRadius === vs.viewportRadius) return;
        vs.viewportRadius = viewportRadius;
        const effectiveRadius = Math.max(
          vs.gridRadius > 0 ? vs.gridRadius : 3,
          viewportRadius,
        );
        const oldMesh = vs.currentEmptyTiles;
        const oldGeometry = oldMesh.geometry;
        const oldMaterial = oldMesh.material;
        vs.ownership.releaseObject(oldMesh);
        vs.ownership.releaseGeometry(oldGeometry);
        vs.ownership.releaseMaterial(oldMaterial);
        const { mesh: newMesh } = createEmptyCellGrid(
          vs.ownership,
          vs.gridRadius,
          vs.occupiedCells,
          viewportRadius,
        );
        vs.root.add(newMesh);
        const idx = vs.interactiveTiles.indexOf(oldMesh);
        if (idx !== -1) vs.interactiveTiles[idx] = newMesh;
        vs.currentEmptyTiles = newMesh;
        currentEmptyTiles = newMesh;
      },
    };
  } catch (cause) {
    try {
      ownership.dispose();
    } catch {
      // Preserve the construction error after making a best effort to release every allocation.
    }
    throw renderFailure('CONSTRUCTION_FAILED', {}, cause);
  }
}

// Temporary bridge for main.js until island creation and interaction are integrated there.
export function drawIsland(world, sourceData, algorithm) {
  const { entities, visualPayloadByEntityId } = adaptSchoolData(sourceData);
  const layoutResult = calculateLayout({
    requestId: 0,
    mode: algorithm,
    entities,
    config: null,
  });
  const presentation = layoutAlgorithms[algorithm];
  const handle = createIsland({ visualPayloadByEntityId, layoutResult, presentation });

  const studentById = new Map(sourceData.students.map((student) => [student.id, student]));
  for (const tile of handle.interactiveTiles) {
    if (tile.userData.isEmpty) continue;
    for (const instance of tile.userData.instances) {
      instance.student = studentById.get(instance.payload.entityId);
    }
  }

  try {
    world.add(handle.root);
  } catch (error) {
    handle.dispose();
    throw error;
  }

  const gapByDepth = new Map(
    handle.stats.boundaryGaps.map(({ depth, averageNearestGap }) => [depth, averageNearestGap]),
  );
  return {
    ...handle,
    handle,
    tiles: handle.interactiveTiles,
    stats: {
      ...handle.stats,
      schoolGap: gapByDepth.get(0) ?? null,
      classGap: gapByDepth.get(1) ?? null,
    },
  };
}
