import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateSchoolData } from './data.js';
import { drawIsland } from './island.js';
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

const students = generateSchoolData();
const { tiles, water, waterRings } = drawIsland(world, students);

let hoveredTile = null;
let selectedTile = null;

tileCount.textContent = `${students.length} УЧЕНИКОВ`;

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
  
  if (tile.userData.isEmpty) {
    const edges = tile.children[0];
    const { edgeMaterials } = tile.userData;
    edges.material = isSelected ? edgeMaterials.selected : isHovered ? edgeMaterials.hover : edgeMaterials.base;
    return;
  }

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

  const { q, r, student, isEmpty } = selectedTile.userData;
  selectionCard.classList.add('is-active');

  if (isEmpty) {
    selectionName.textContent = 'Свободное место';
    selectionMeta.textContent = `Координаты: [${q}; ${r}]`;
  } else {
    selectionName.textContent = student.name;
    selectionMeta.textContent = `Класс: ${student.className} · Оценка: ${student.mark} · [${q}; ${r}]`;
  }
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
