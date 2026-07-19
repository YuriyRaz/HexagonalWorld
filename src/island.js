import * as THREE from 'three';

const HEX_SIZE = 1.14;
const WATER_LEVEL = 0.12;

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
  const N = students.length;
  // Calculate approximate map radius needed for N tiles
  const MAP_RADIUS = Math.ceil((-3 + Math.sqrt(9 - 12 * (1 - N))) / 6);
  
  const spiral = getHexSpiral();

  for (let i = 0; i < N; i++) {
    const student = students[i];
    const { q, r } = spiral.next().value;

    const distance = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
    const radial = 1 - distance / (MAP_RADIUS + 0.75);
    const detail = smoothNoise(q, r);
    const ridge = Math.max(0, 1 - Math.hypot(q + 0.8, r - 0.3) / 6.3);
    const height = Math.max(0.48, 0.42 + radial * 3.4 + ridge * 1.35 + detail * 1.15);
    
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
    
    // Store student data in userData for UI representation
    mesh.userData = { 
      q, r, height, 
      student,
      baseColor: color.clone() 
    };
    
    world.add(mesh);
    tiles.push(mesh);

    const edgeGeometry = new THREE.EdgesGeometry(geometry, 20);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xbfd1a5, transparent: true, opacity: 0.085 });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    mesh.add(edges);
  }

  // Generate empty cells
  const EMPTY_RADIUS = 20; // Enough to look infinite with fog
  for (let i = 0; i < EMPTY_RADIUS * EMPTY_RADIUS * 3; i++) {
    const { q, r } = spiral.next().value;
    
    const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
    const z = HEX_SIZE * 1.5 * r;
    const height = 0.2; // flat empty cells
    const depth = height + 1.4;
    
    const geometry = new THREE.CylinderGeometry(HEX_SIZE * 1.005, HEX_SIZE * 1.005, depth, 6, 1, false);
    
    // Invisible mesh for raycasting
    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, height / 2 - 0.62, z);
    
    mesh.userData = { 
      q, r, height, 
      isEmpty: true,
      baseColor: new THREE.Color(0x000000)
    };
    
    world.add(mesh);
    tiles.push(mesh);
    
    const edgeGeometry = new THREE.EdgesGeometry(geometry, 20);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x4fa98c, transparent: true, opacity: 0.15 });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    mesh.add(edges);
  }
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
