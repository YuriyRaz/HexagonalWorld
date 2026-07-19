import * as THREE from 'three';

const HEX_SIZE = 1.14;
const WATER_LEVEL = 0.12;
const WORLD_RADIUS = 11;
const CLASS_DISTANCE = 6;
const MIN_TILE_HEIGHT = 0.55;
const MAX_TILE_HEIGHT = 6.2;

const palette = [
  new THREE.Color(0xa4a878), // Class 0
  new THREE.Color(0x6d9a5d), // Class 1
  new THREE.Color(0x3d7650), // Class 2
  new THREE.Color(0x738e68), // Class 3
  new THREE.Color(0xb8c2a1), // Class 4
  new THREE.Color(0x77b1a0), // Class 5
  new THREE.Color(0x4fa98c), // Class 6 (fallback)
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

function getHexRing(radius) {
  const cells = [];
  const walkDirs = [
    {q: 1, r: 0}, {q: 1, r: -1}, {q: 0, r: -1},
    {q: -1, r: 0}, {q: -1, r: 1}, {q: 0, r: 1}
  ];
  let hex = { q: -radius, r: radius };

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      cells.push({ q: hex.q, r: hex.r });
      hex.q += walkDirs[i].q;
      hex.r += walkDirs[i].r;
    }
  }

  return cells;
}

function* getHexSpiral() {
  yield { q: 0, r: 0 };
  let radius = 1;
  while (true) {
    yield* getHexRing(radius);
    radius++;
  }
}

function getDistributedClassCells(classCount) {
  const cells = [{ q: 0, r: 0 }];
  let remaining = classCount - 1;
  let radius = 1;

  while (remaining > 0) {
    const ring = getHexRing(radius);
    const cellsOnRing = Math.min(remaining, ring.length);

    for (let i = 0; i < cellsOnRing; i += 1) {
      cells.push(ring[Math.floor(i * ring.length / cellsOnRing)]);
    }

    remaining -= cellsOnRing;
    radius += 1;
  }

  return cells;
}

export function drawIsland(world, students) {
  const tiles = [];
  const occupiedCells = new Set();
  const classes = Map.groupBy(students, (student) => student.classIndex);
  const classCells = getDistributedClassCells(classes.size);
  const tileGeometry = new THREE.CylinderGeometry(HEX_SIZE * 1.005, HEX_SIZE * 1.005, 1, 6, 1, false);
  const tileMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.02,
    flatShading: true,
  });
  const occupiedTiles = new THREE.InstancedMesh(tileGeometry, tileMaterial, students.length);
  const instances = new Array(students.length);
  const baseColors = new Float32Array(students.length * 3);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  let instanceIndex = 0;
  let worldSize = 18;

  [...classes.values()].forEach((classStudents, classIndex) => {
    const classCell = classCells[classIndex];
    const islandQ = classCell.q * CLASS_DISTANCE;
    const islandR = classCell.r * CLASS_DISTANCE;
    const spiral = getHexSpiral();

    classStudents.forEach((student) => {
      const localCell = spiral.next().value;
      const q = islandQ + localCell.q;
      const r = islandR + localCell.r;
      const detail = smoothNoise(q, r);
      const normalizedMark = THREE.MathUtils.clamp(student.mark, 0, 100) / 100;
      const height = MIN_TILE_HEIGHT + normalizedMark * (MAX_TILE_HEIGHT - MIN_TILE_HEIGHT);
      const baseColor = palette[student.classIndex % palette.length];
      const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
      const z = HEX_SIZE * 1.5 * r;
      const depth = height + 1.4;
      const color = baseColor.clone().offsetHSL(detail * 0.025, detail * 0.04, detail * 0.035);
      const y = height / 2 - 0.62;

      position.set(x, y, z);
      scale.set(1, depth, 1);
      matrix.compose(position, rotation, scale);
      occupiedTiles.setMatrixAt(instanceIndex, matrix);
      occupiedTiles.setColorAt(instanceIndex, color);
      color.toArray(baseColors, instanceIndex * 3);
      instances[instanceIndex] = {
        q,
        r,
        x,
        y,
        z,
        depth,
        height,
        student,
      };
      instanceIndex += 1;
      occupiedCells.add(`${q},${r}`);
      worldSize = Math.max(worldSize, Math.hypot(x, z) + HEX_SIZE * 2);
    });
  });

  occupiedTiles.castShadow = students.length <= 2500;
  occupiedTiles.receiveShadow = true;
  occupiedTiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  occupiedTiles.instanceColor.setUsage(THREE.DynamicDrawUsage);
  occupiedTiles.userData = { instances, baseColors };
  occupiedTiles.computeBoundingSphere();
  world.add(occupiedTiles);
  tiles.push(occupiedTiles);

  const emptyCellPositions = [];
  for (let q = -WORLD_RADIUS; q <= WORLD_RADIUS; q += 1) {
    const minR = Math.max(-WORLD_RADIUS, -q - WORLD_RADIUS);
    const maxR = Math.min(WORLD_RADIUS, -q + WORLD_RADIUS);
    for (let r = minR; r <= maxR; r += 1) {
      if (!occupiedCells.has(`${q},${r}`)) emptyCellPositions.push({ q, r });
    }
  }

  const emptyGeometry = new THREE.CylinderGeometry(HEX_SIZE * 0.965, HEX_SIZE * 0.965, 0.04, 6);
  const emptyMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const emptyEdgePoints = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = i / 6 * Math.PI * 2;
    emptyEdgePoints.push(new THREE.Vector3(
      Math.sin(angle) * HEX_SIZE * 0.965,
      0.021,
      Math.cos(angle) * HEX_SIZE * 0.965
    ));
  }
  const emptyEdgeGeometry = new THREE.BufferGeometry().setFromPoints(emptyEdgePoints);
  const emptyEdgeMaterials = {
    base: new THREE.LineBasicMaterial({ color: 0x4fa98c, transparent: true, opacity: 0.2, depthWrite: false }),
    hover: new THREE.LineBasicMaterial({ color: 0x8ecf8a, transparent: true, opacity: 0.65, depthWrite: false }),
    selected: new THREE.LineBasicMaterial({ color: 0xb7df70, transparent: true, opacity: 0.9, depthWrite: false }),
  };

  emptyCellPositions.forEach(({ q, r }) => {
    const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
    const z = HEX_SIZE * 1.5 * r;
    const mesh = new THREE.Mesh(emptyGeometry, emptyMaterial);
    mesh.position.set(x, WATER_LEVEL + 0.015, z);
    mesh.userData = {
      q,
      r,
      isEmpty: true,
      edgeMaterials: emptyEdgeMaterials,
    };

    const edges = new THREE.LineLoop(emptyEdgeGeometry, emptyEdgeMaterials.base);
    edges.renderOrder = 2;
    mesh.add(edges);
    world.add(mesh);
    tiles.push(mesh);
  });

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
  for (let i = 0; i < 7; i += 1) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(12.8 + i * 2.8, 12.84 + i * 2.8, 96), ringMaterial.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = WATER_LEVEL + 0.012;
    ring.scale.y = 0.82;
    ring.material.opacity = 0.05 - i * 0.004;
    world.add(ring);
    waterRings.push(ring);
  }

  const groundGlow = new THREE.Mesh(
    new THREE.CircleGeometry(25, 72),
    new THREE.MeshBasicMaterial({
      color: 0x3e9a79,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.y = WATER_LEVEL + 0.02;
  world.add(groundGlow);

  return { tiles, water, waterRings, worldSize };
}
