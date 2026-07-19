import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const canvas = document.querySelector('#world');
const loading = document.querySelector('#loading');
const selectionCard = document.querySelector('#selection-card');
const selectionName = document.querySelector('#selection-name');
const selectionMeta = document.querySelector('#selection-meta');
const tileCount = document.querySelector('#tile-count');
const compassDial = document.querySelector('#compass-dial');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071310);
scene.fog = new THREE.FogExp2(0x071310, 0.021);

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 180);
const defaultCameraPosition = new THREE.Vector3(22, 22, 31);
const defaultTarget = new THREE.Vector3(2.5, 1, 0);
camera.position.copy(defaultCameraPosition);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(defaultTarget);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 14;
controls.maxDistance = 72;
controls.maxPolarAngle = Math.PI * 0.485;
controls.minPolarAngle = Math.PI * 0.08;
controls.screenSpacePanning = true;
controls.zoomToCursor = true;
controls.rotateSpeed = 0.55;
controls.panSpeed = 0.75;
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
controls.update();

scene.add(new THREE.HemisphereLight(0xb9dac8, 0x112018, 1.7));

const sun = new THREE.DirectionalLight(0xfff1c2, 3.1);
sun.position.set(-13, 24, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -24;
sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 65;
sun.shadow.bias = -0.0004;
scene.add(sun);

const rimLight = new THREE.DirectionalLight(0x4fa98c, 1.8);
rimLight.position.set(18, 7, -20);
scene.add(rimLight);

const world = new THREE.Group();
world.position.x = 3.3;
scene.add(world);

const HEX_SIZE = 1.14;
const MAP_RADIUS = 6;
const WATER_LEVEL = 0.12;
const tiles = [];
let hoveredTile = null;
let selectedTile = null;

const palette = {
  sand: new THREE.Color(0xa4a878),
  meadow: new THREE.Color(0x6d9a5d),
  forest: new THREE.Color(0x3d7650),
  highland: new THREE.Color(0x738e68),
  peak: new THREE.Color(0xb8c2a1),
};

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

function getBiome(height, detail) {
  if (height < 0.8) return ['Песчаная отмель', palette.sand, 'ПОБЕРЕЖЬЕ'];
  if (height < 1.8) return ['Луговая терраса', palette.meadow, 'РАВНИНА'];
  if (height < 3.1) return detail > 0.08
    ? ['Северный лес', palette.forest, 'ЛЕС']
    : ['Зеленое плато', palette.meadow, 'ПЛАТО'];
  if (height < 4.25) return ['Каменное нагорье', palette.highland, 'НАГОРЬЕ'];
  return ['Белая вершина', palette.peak, 'ВЕРШИНА'];
}

function addTile(q, r) {
  const distance = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
  const radial = 1 - distance / (MAP_RADIUS + 0.75);
  const detail = smoothNoise(q, r);
  const ridge = Math.max(0, 1 - Math.hypot(q + 0.8, r - 0.3) / 6.3);
  const height = Math.max(0.48, 0.42 + radial * 3.4 + ridge * 1.35 + detail * 1.15);
  const [name, baseColor, type] = getBiome(height, detail);

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
  mesh.userData = { q, r, height, name, type, baseColor: color.clone() };
  world.add(mesh);
  tiles.push(mesh);

  const edgeGeometry = new THREE.EdgesGeometry(geometry, 20);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xbfd1a5, transparent: true, opacity: 0.085 });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  mesh.add(edges);
}

for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q += 1) {
  const rMin = Math.max(-MAP_RADIUS, -q - MAP_RADIUS);
  const rMax = Math.min(MAP_RADIUS, -q + MAP_RADIUS);
  for (let r = rMin; r <= rMax; r += 1) addTile(q, r);
}

tileCount.textContent = `${tiles.length} ГЕКСОВ`;

const waterGeometry = new THREE.CircleGeometry(42, 96);
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

const particlesGeometry = new THREE.BufferGeometry();
const particlePositions = [];
for (let i = 0; i < 240; i += 1) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 18 + Math.random() * 48;
  particlePositions.push(Math.cos(angle) * radius, 1 + Math.random() * 24, Math.sin(angle) * radius);
}
particlesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));
const particles = new THREE.Points(
  particlesGeometry,
  new THREE.PointsMaterial({ color: 0xb6d6bf, size: 0.045, transparent: true, opacity: 0.34, depthWrite: false })
);
scene.add(particles);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(2, 2);
let pointerDown = null;
let cameraTween = null;

function setTileState(tile) {
  if (!tile) return;
  const isSelected = tile === selectedTile;
  const isHovered = tile === hoveredTile;
  tile.material.color.copy(tile.userData.baseColor);
  tile.material.emissive.set(isSelected ? 0xb7df70 : isHovered ? 0x8ecf8a : 0x000000);
  tile.material.emissiveIntensity = isSelected ? 0.43 : isHovered ? 0.24 : 0;
  tile.scale.setScalar(isSelected ? 1.035 : isHovered ? 1.018 : 1);
}

function updateHover() {
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(tiles, false)[0]?.object ?? null;
  if (hit === hoveredTile) return;
  const previous = hoveredTile;
  hoveredTile = hit;
  setTileState(previous);
  setTileState(hoveredTile);
  canvas.style.cursor = hoveredTile ? 'pointer' : 'grab';
}

function selectTile(tile) {
  const previous = selectedTile;
  selectedTile = selectedTile === tile ? null : tile;
  setTileState(previous);
  setTileState(selectedTile);

  if (!selectedTile) {
    selectionCard.classList.remove('is-active');
    selectionName.textContent = 'Ничего не выбрано';
    selectionMeta.textContent = 'Нажмите на гекс карты';
    return;
  }

  const { q, r, height, name, type } = selectedTile.userData;
  selectionCard.classList.add('is-active');
  selectionName.textContent = name;
  selectionMeta.textContent = `${type} · ${Math.round(height * 128)} М · [${q}; ${r}]`;
}

canvas.addEventListener('pointermove', (event) => {
  pointer.x = (event.clientX / innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / innerHeight) * 2 + 1;
});

canvas.addEventListener('pointerleave', () => {
  pointer.set(2, 2);
  const previous = hoveredTile;
  hoveredTile = null;
  setTileState(previous);
});

canvas.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY, button: event.button };
});

canvas.addEventListener('pointerup', (event) => {
  if (!pointerDown || pointerDown.button !== 0) return;
  const movement = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  if (movement < 5 && hoveredTile) selectTile(hoveredTile);
  pointerDown = null;
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

document.querySelector('#reset-view').addEventListener('click', () => {
  cameraTween = {
    start: performance.now(),
    fromPosition: camera.position.clone(),
    fromTarget: controls.target.clone(),
  };
});

function animateCamera(time) {
  if (!cameraTween) return;
  const progress = Math.min((time - cameraTween.start) / 850, 1);
  const eased = 1 - Math.pow(1 - progress, 3);
  camera.position.lerpVectors(cameraTween.fromPosition, defaultCameraPosition, eased);
  controls.target.lerpVectors(cameraTween.fromTarget, defaultTarget, eased);
  if (progress === 1) cameraTween = null;
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
}

addEventListener('resize', onResize);

const clock = new THREE.Clock();
function animate(time) {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  animateCamera(time);
  controls.update();
  updateHover();

  water.material.opacity = 0.84 + Math.sin(elapsed * 0.42) * 0.018;
  waterRings.forEach((ring, index) => {
    ring.material.opacity = 0.025 + Math.sin(elapsed * 0.34 + index * 0.7) * 0.012;
    ring.rotation.z = elapsed * (index % 2 ? 0.006 : -0.004);
  });
  particles.rotation.y = elapsed * 0.006;

  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const heading = Math.atan2(direction.x, direction.z) * 180 / Math.PI;
  compassDial.style.transform = `rotate(${-heading}deg)`;

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
setTimeout(() => loading.classList.add('is-hidden'), 520);
