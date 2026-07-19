import * as THREE from 'three';

const HEX_SIZE = 1.14;
const WATER_LEVEL = 0.12;
const ISLAND_DISTANCE = 7;
const WORLD_RADIUS = 11;
const MIN_TILE_HEIGHT = 0.55;
const MAX_TILE_HEIGHT = 6.2;

const islandDirections = [
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
];

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

function* getHexSpiral() {
  yield { q: 0, r: 0 };
  let radius = 1;
  const walkDirs = [
    {q: 1, r: 0}, {q: 1, r: -1}, {q: 0, r: -1},
    {q: -1, r: 0}, {q: -1, r: 1}, {q: 0, r: 1}
  ];
  while (true) {
    let hex = { q: -radius, r: radius };
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < radius; j++) {
        yield { q: hex.q, r: hex.r };
        hex.q += walkDirs[i].q;
        hex.r += walkDirs[i].r;
      }
    }
    radius++;
  }
}

export function drawIsland(world, students) {
  const tiles = [];
  const occupiedCells = new Set();
  const classes = Map.groupBy(students, (student) => student.classIndex);

  [...classes.values()].forEach((classStudents, islandIndex) => {
    const direction = islandDirections[islandIndex % islandDirections.length];
    const islandQ = direction.q * ISLAND_DISTANCE;
    const islandR = direction.r * ISLAND_DISTANCE;
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
      const geometry = new THREE.CylinderGeometry(HEX_SIZE * 1.005, HEX_SIZE * 1.005, depth, 6, 1, false);
      const color = baseColor.clone().offsetHSL(detail * 0.025, detail * 0.04, detail * 0.035);
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.84,
        metalness: 0.02,
        emissive: 0x000000,
        emissiveIntensity: 0,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, height / 2 - 0.62, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        q,
        r,
        height,
        student,
        baseColor: color.clone(),
      };

      world.add(mesh);
      tiles.push(mesh);
      occupiedCells.add(`${q},${r}`);

      const edgeGeometry = new THREE.EdgesGeometry(geometry, 20);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xbfd1a5, transparent: true, opacity: 0.085 });
      mesh.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
    });
  });

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
  const emptyEdgeGeometry = new THREE.EdgesGeometry(emptyGeometry, 20);
  const emptyEdgeMaterials = {
    base: new THREE.LineBasicMaterial({ color: 0x4fa98c, transparent: true, opacity: 0.2 }),
    hover: new THREE.LineBasicMaterial({ color: 0x8ecf8a, transparent: true, opacity: 0.65 }),
    selected: new THREE.LineBasicMaterial({ color: 0xb7df70, transparent: true, opacity: 0.9 }),
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

    mesh.add(new THREE.LineSegments(emptyEdgeGeometry, emptyEdgeMaterials.base));
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

  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x77b1a0, transparent: true, opacity: 0.065, side: THREE.DoubleSide });
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
    new THREE.MeshBasicMaterial({ color: 0x3e9a79, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.y = WATER_LEVEL + 0.02;
  world.add(groundGlow);

  return { tiles, water, waterRings };
}
