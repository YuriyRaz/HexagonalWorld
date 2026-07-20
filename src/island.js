import * as THREE from 'three';
import { calculateLayout } from './layout.js';

const HEX_SIZE = 1.14;
const WATER_LEVEL = 0.12;
const MIN_TILE_HEIGHT = 0.55;
const MAX_TILE_HEIGHT = 6.2;

const schoolPalette = [
  new THREE.Color(0x95aa67),
  new THREE.Color(0x4fa98c),
  new THREE.Color(0x7898b2),
  new THREE.Color(0xb68b62),
  new THREE.Color(0x8d79aa),
  new THREE.Color(0x6f9e9e),
];

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

function axialToWorld(q, r) {
  return {
    x: HEX_SIZE * Math.sqrt(3) * (q + r / 2),
    z: HEX_SIZE * 1.5 * r,
  };
}

export function drawIsland(world, data, algorithm) {
  const { placements, gridRadius, stats } = calculateLayout(data, algorithm);
  const tiles = [];
  const occupiedCells = new Set();
  const classById = new Map(data.classes.map((classEntity) => [classEntity.id, classEntity]));
  const tileGeometry = new THREE.CylinderGeometry(HEX_SIZE * 1.005, HEX_SIZE * 1.005, 1, 6, 1, false);
  const tileMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.02,
    flatShading: true,
  });
  const occupiedTiles = new THREE.InstancedMesh(tileGeometry, tileMaterial, placements.length);
  const instances = new Array(placements.length);
  const baseColors = new Float32Array(placements.length * 3);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  let worldSize = 18;

  placements.forEach(({ student, q, r }, instanceIndex) => {
    const detail = smoothNoise(q, r);
    const normalizedMark = THREE.MathUtils.clamp(student.mark, 0, 100) / 100;
    const height = MIN_TILE_HEIGHT + normalizedMark * (MAX_TILE_HEIGHT - MIN_TILE_HEIGHT);
    const classEntity = classById.get(student.classId);
    const baseColor = schoolPalette[student.schoolIndex % schoolPalette.length];
    const classShift = ((classEntity.indexInSchool % 5) - 2) * 0.025;
    const color = baseColor.clone().offsetHSL(
      classShift + detail * 0.018,
      detail * 0.035,
      classShift * 0.85 + detail * 0.03,
    );
    const { x, z } = axialToWorld(q, r);
    const depth = height + 1.4;
    const y = height / 2 - 0.62;

    position.set(x, y, z);
    scale.set(1, depth, 1);
    matrix.compose(position, rotation, scale);
    occupiedTiles.setMatrixAt(instanceIndex, matrix);
    occupiedTiles.setColorAt(instanceIndex, color);
    color.toArray(baseColors, instanceIndex * 3);
    instances[instanceIndex] = { q, r, x, y, z, depth, height, student };
    occupiedCells.add(`${q},${r}`);
    worldSize = Math.max(worldSize, Math.hypot(x, z) + HEX_SIZE * 2);
  });

  occupiedTiles.castShadow = placements.length <= 2500;
  occupiedTiles.receiveShadow = true;
  occupiedTiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  occupiedTiles.instanceColor.setUsage(THREE.DynamicDrawUsage);
  occupiedTiles.userData = { instances, baseColors };
  occupiedTiles.computeBoundingSphere();
  world.add(occupiedTiles);
  tiles.push(occupiedTiles);

  const emptyCellPositions = [];
  const radius = Math.ceil(gridRadius);
  for (let q = -radius; q <= radius; q += 1) {
    const minR = Math.max(-radius, -q - radius);
    const maxR = Math.min(radius, -q + radius);
    for (let r = minR; r <= maxR; r += 1) {
      if (!occupiedCells.has(`${q},${r}`)) emptyCellPositions.push({ q, r });
    }
  }

  const emptyGeometry = new THREE.CylinderGeometry(HEX_SIZE * 0.96, HEX_SIZE * 0.96, 0.035, 6);
  const emptyMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  const emptyTiles = new THREE.InstancedMesh(emptyGeometry, emptyMaterial, emptyCellPositions.length);
  const emptyInstances = new Array(emptyCellPositions.length);
  const emptyBaseColors = new Float32Array(emptyCellPositions.length * 3);
  const emptyColor = new THREE.Color(0x4fa98c);

  emptyCellPositions.forEach(({ q, r }, index) => {
    const { x, z } = axialToWorld(q, r);
    position.set(x, WATER_LEVEL + 0.015, z);
    scale.set(1, 1, 1);
    matrix.compose(position, rotation, scale);
    emptyTiles.setMatrixAt(index, matrix);
    emptyTiles.setColorAt(index, emptyColor);
    emptyColor.toArray(emptyBaseColors, index * 3);
    emptyInstances[index] = { q, r, x, y: WATER_LEVEL + 0.015, z, depth: 0.035, isEmpty: true };
  });
  emptyTiles.instanceColor.setUsage(THREE.DynamicDrawUsage);
  emptyTiles.userData = { isEmpty: true, instances: emptyInstances, baseColors: emptyBaseColors };
  emptyTiles.renderOrder = 2;
  emptyTiles.computeBoundingSphere();
  world.add(emptyTiles);
  tiles.push(emptyTiles);

  const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
  const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x143f3d,
    roughness: 0.27,
    metalness: 0.08,
    transparent: true,
    opacity: 0.86,
    transmission: 0.05,
    clearcoat: 0.35,
    clearcoatRoughness: 0.34,
    side: THREE.DoubleSide,
  });
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  water.receiveShadow = true;
  world.add(water);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x77b1a0,
    transparent: true,
    opacity: 0.065,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const waterRings = [];
  const ringStart = Math.max(12.8, worldSize * 0.72);
  for (let index = 0; index < 7; index += 1) {
    const innerRadius = ringStart + index * 2.8;
    const ring = new THREE.Mesh(new THREE.RingGeometry(innerRadius, innerRadius + 0.04, 96), ringMaterial.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = WATER_LEVEL + 0.012;
    ring.scale.y = 0.82;
    ring.material.opacity = 0.05 - index * 0.004;
    world.add(ring);
    waterRings.push(ring);
  }

  const groundGlow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(25, worldSize * 1.08), 72),
    new THREE.MeshBasicMaterial({
      color: 0x3e9a79,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.y = WATER_LEVEL + 0.02;
  world.add(groundGlow);

  return { tiles, water, waterRings, worldSize, stats };
}
