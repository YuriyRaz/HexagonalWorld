import * as THREE from 'three';

import { adaptSchoolData } from './data.js';
import { HEX_SIZE, axialToPlane } from './hex.js';
import { calculateLayout, layoutAlgorithms } from './layout.js';

const WATER_LEVEL = 0.12;
const MIN_TILE_HEIGHT = 0.55;
const MAX_TILE_HEIGHT = 6.2;
const MAX_GRID_RADIUS = 256;
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

  return { ownObject, ownGeometry, ownMaterial, dispose };
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

export function createIsland(input) {
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

    const emptyCellPositions = [];
    for (let q = -validated.gridRadius; q <= validated.gridRadius; q += 1) {
      const minR = Math.max(-validated.gridRadius, -q - validated.gridRadius);
      const maxR = Math.min(validated.gridRadius, -q + validated.gridRadius);
      for (let r = minR; r <= maxR; r += 1) {
        if (!validated.occupiedCells.has(`${q},${r}`)) emptyCellPositions.push({ q, r });
      }
    }

    const emptyGeometry = ownership.ownGeometry(new THREE.CylinderGeometry(
      HEX_SIZE * 0.96,
      HEX_SIZE * 0.96,
      0.035,
      6,
    ));
    const emptyMaterial = ownership.ownMaterial(new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
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
        depth: 0.035,
        isEmpty: true,
      };
    });
    emptyTiles.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    emptyTiles.userData = { isEmpty: true, instances: emptyInstances, baseColors: emptyBaseColors };
    emptyTiles.renderOrder = 2;
    emptyTiles.computeBoundingSphere();
    root.add(emptyTiles);
    interactiveTiles.push(emptyTiles);

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
