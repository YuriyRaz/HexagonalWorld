
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateSchoolData, adaptSchoolData } from './data.js';
import { createIsland } from './island.js';
import { layoutAlgorithms } from './layout.js';
import { createLayoutRunner } from './layout-runner.js';
import './style.css';

const canvas = document.querySelector('#world');
const loading = document.querySelector('#loading');
const selectionCard = document.querySelector('#selection-card');
const selectionName = document.querySelector('#selection-name');
const selectionMeta = document.querySelector('#selection-meta');
const tileCount = document.querySelector('#tile-count');
const compassDial = document.querySelector('#compass-dial');
const generatorForm = document.querySelector('#generator-form');
const schoolCountInput = document.querySelector('#school-count');
const classCountInput = document.querySelector('#class-count');
const minStudentsInput = document.querySelector('#min-students');
const maxStudentsInput = document.querySelector('#max-students');
const algorithmSelect = document.querySelector('#layout-algorithm');
const algorithmNote = document.querySelector('#algorithm-note');
const schoolTotal = document.querySelector('#school-total');
const classTotal = document.querySelector('#class-total');
const classGap = document.querySelector('#class-gap');
const schoolGap = document.querySelector('#school-gap');
const formError = document.querySelector('#form-error');

const layoutStatus = document.createElement('div');
layoutStatus.id = 'layout-status';
layoutStatus.setAttribute('role', 'status');
layoutStatus.setAttribute('aria-live', 'polite');
// document.body.appendChild(layoutStatus); // Will be inserted into DOM or already exists?
// tests check #layout-status text. Wait, main.js has no reference to it. Let's query it.
const layoutStatusEl = document.querySelector('#layout-status') || layoutStatus;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071310);
scene.fog = new THREE.FogExp2(0x071310, 0.021);

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 180);
const defaultCameraPosition = new THREE.Vector3(22, 22, 31);
const defaultTarget = new THREE.Vector3(2.5, 1, 0);
const defaultCameraDirection = defaultCameraPosition.clone().sub(defaultTarget).normalize();
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
const sunDirection = sun.position.clone().normalize();
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

function fitWorldView(worldSize) {
  const cameraDistance = Math.max(43, worldSize * 2.65);
  const shadowSize = Math.max(24, worldSize * 1.1);

  defaultCameraPosition.copy(defaultCameraDirection).multiplyScalar(cameraDistance).add(defaultTarget);
  camera.position.copy(defaultCameraPosition);
  camera.far = Math.max(180, cameraDistance + worldSize * 3);
  camera.updateProjectionMatrix();
  controls.target.copy(defaultTarget);
  controls.maxDistance = Math.max(72, cameraDistance * 2);
  controls.update();
  scene.fog.density = 0.021 * Math.min(1, 18 / worldSize);

  sun.position.copy(sunDirection).multiplyScalar(Math.max(30, worldSize * 1.5));
  sun.shadow.camera.left = -shadowSize;
  sun.shadow.camera.right = shadowSize;
  sun.shadow.camera.top = shadowSize;
  sun.shadow.camera.bottom = -shadowSize;
  sun.shadow.camera.far = Math.max(65, worldSize * 4);
  sun.shadow.camera.updateProjectionMatrix();
}

let hoveredTile = null;
let selectedTile = null;
let interactionDirty = true;
let tiles = [];
let waterRings = [];

controls.addEventListener('change', () => {
  interactionDirty = true;
});

function formatGap(value) {
  return value === null ? '—' : `${value.toFixed(1)} ГЕКСА`;
}

function updateWorldSummary(stats, schoolData) {
  tileCount.textContent = `${schoolData.students.length} УЧЕНИКОВ`;
  schoolTotal.textContent = schoolData.schools.length;
  classTotal.textContent = schoolData.classes.length;
  
  const gapByDepth = new Map(
    stats.boundaryGaps.map(({ depth, averageNearestGap }) => [depth, averageNearestGap]),
  );
  classGap.textContent = formatGap(gapByDepth.get(1) ?? null);
  schoolGap.textContent = formatGap(gapByDepth.get(0) ?? null);
  
  algorithmNote.textContent = layoutAlgorithms[algorithmSelect.value].note;
}

function clearSelection() {
  hoveredTile = null;
  selectedTile = null;
  selectionCard.classList.remove('is-active');
  selectionName.textContent = 'Ничего не выбрано';
  selectionMeta.textContent = 'Нажмите на гекс карты';
  canvas.style.cursor = 'grab';
  interactionDirty = true;
}

const layoutRunner = createLayoutRunner({
  workerFactory: () => new Worker(new URL('./layout-worker.js', import.meta.url), { type: 'module' }),
  hangGuardMs: 60000
});

let activeIslandHandle = null;
let activeLayoutResult = null;
let activeDataSnapshot = null;
let activeVisualPayloadByEntityId = null;

let requestIdCounter = 0;
let lastErrorCode = null;
let requestedMode = algorithmSelect.value;
let isBusy = false;

window.__hexWorldTest = {
  configureNextRequest: (config) => {
    window.__hexWorldTest.nextConfig = config;
  },
  getState: () => ({
    productionHangGuardMs: 60000,
    latestRequestId: requestIdCounter,
    requestedMode: requestedMode,
    activeMode: activeLayoutResult?.mode || requestedMode,
    busy: isBusy,
    lastErrorCode: lastErrorCode,
    activeRootId: activeIslandHandle?.root.uuid || null,
    activeResult: activeLayoutResult ? structuredClone(activeLayoutResult) : null,
  })
};

let currentSchoolData = generateSchoolData();

async function rebuildIsland() {
  requestIdCounter++;
  const currentRequestId = requestIdCounter;
  requestedMode = algorithmSelect.value;
  
  isBusy = true;
  lastErrorCode = null;
  const statusEl = document.querySelector('#layout-status');
  if (statusEl) statusEl.textContent = 'Вычисляем...';
  generatorForm.setAttribute('aria-busy', 'true');
  algorithmSelect.disabled = true;

  let config = window.__hexWorldTest.nextConfig || {};
  window.__hexWorldTest.nextConfig = null;

  let entities, visualPayloadByEntityId;
  let useTestEntities = false;
  if (config.entities) {
    entities = config.entities;
    // tests pass pure entities, we must mock payload for them so createIsland won't fail
    visualPayloadByEntityId = new Map();
    entities.forEach(e => {
      visualPayloadByEntityId.set(e.id, {
        entityId: e.id,
        title: `Test ${e.id}`,
        metadataText: `Test Meta ${e.id}`,
        heightValue: 50,
        colorGroupId: 'test',
        colorGroupOrder: 0,
        colorVariantOrder: 0
      });
    });
    useTestEntities = true;
  } else {
    const adapted = adaptSchoolData(currentSchoolData);
    entities = adapted.entities;
    visualPayloadByEntityId = adapted.visualPayloadByEntityId;
  }

  try {
    const layoutResult = await layoutRunner.runLayout({
      requestId: currentRequestId,
      mode: requestedMode,
      entities,
      config: config.failure ? { __testFailure: config.failure } : config
    });
    
    if (currentRequestId !== requestIdCounter) return;

    const presentation = layoutAlgorithms[requestedMode];
    const newHandle = createIsland({ visualPayloadByEntityId, layoutResult, presentation });
    
    clearSelection();
    if (activeIslandHandle) {
      world.remove(activeIslandHandle.root);
      activeIslandHandle.dispose();
    }
    
    activeIslandHandle = newHandle;
    activeLayoutResult = layoutResult;
    activeDataSnapshot = currentSchoolData;
    activeVisualPayloadByEntityId = visualPayloadByEntityId;
    
    world.add(activeIslandHandle.root);
    tiles = activeIslandHandle.interactiveTiles;
    waterRings = activeIslandHandle.waterRings;
    
    fitWorldView(activeIslandHandle.worldSize);
    if (!useTestEntities) {
      updateWorldSummary(activeIslandHandle.stats, activeDataSnapshot);
    }
    if (statusEl) statusEl.textContent = 'Успешно завершено.';
    
  } catch (err) {
    if (currentRequestId !== requestIdCounter) return;
    if (err.code !== 'CANCELLED') {
      lastErrorCode = err.code || 'UNKNOWN';
      if (statusEl) statusEl.textContent = `Ошибка: не удалось рассчитать (${lastErrorCode})`;
    }
  } finally {
    if (currentRequestId === requestIdCounter) {
      isBusy = false;
      generatorForm.removeAttribute('aria-busy');
      algorithmSelect.disabled = false;
    }
  }
}

// Initial build
rebuildIsland().then(() => {
  setTimeout(() => loading.classList.add('is-hidden'), 520);
});


generatorForm.addEventListener('submit', (event) => {
  event.preventDefault();
  formError.textContent = '';
  schoolCountInput.setCustomValidity('');
  maxStudentsInput.setCustomValidity('');

  if (!generatorForm.checkValidity()) {
    generatorForm.reportValidity();
    return;
  }

  const formData = new FormData(generatorForm);
  const schoolCount = Number(formData.get('schoolCount'));
  const classCount = Number(formData.get('classCount'));
  const minStudents = Number(formData.get('minStudents'));
  const maxStudents = Number(formData.get('maxStudents'));

  if (minStudents > maxStudents) {
    const message = 'Максимум должен быть не меньше минимума.';
    maxStudentsInput.setCustomValidity(message);
    formError.textContent = message;
    maxStudentsInput.reportValidity();
    return;
  }

  if (schoolCount > classCount) {
    const message = 'Школ не может быть больше, чем классов.';
    schoolCountInput.setCustomValidity(message);
    formError.textContent = message;
    schoolCountInput.reportValidity();
    return;
  }

  currentSchoolData = generateSchoolData({ schoolCount, classCount, minStudents, maxStudents });
  rebuildIsland();
});

[schoolCountInput, classCountInput, minStudentsInput, maxStudentsInput].forEach((input) => {
  input.addEventListener('input', () => {
    schoolCountInput.setCustomValidity('');
    maxStudentsInput.setCustomValidity('');
    formError.textContent = '';
  });
});

algorithmSelect.addEventListener('change', () => {
  rebuildIsland();
});

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
const tileMatrix = new THREE.Matrix4();
const tilePosition = new THREE.Vector3();
const tileRotation = new THREE.Quaternion();
const tileScale = new THREE.Vector3();
const tileColor = new THREE.Color();
const hoverColor = new THREE.Color(0x8ecf8a);
const selectedColor = new THREE.Color(0xb7df70);
let pointerDown = null;
let cameraTween = null;

function isSameTile(first, second) {
  return first?.object === second?.object && first?.instanceId === second?.instanceId;
}

function setTileState(tile) {
  if (!tile) return;
  const isSelected = isSameTile(tile, selectedTile);
  const isHovered = isSameTile(tile, hoveredTile);
  const { object, instanceId } = tile;

  if (object.userData.isEmpty) {
    tileColor.fromArray(object.userData.baseColors, instanceId * 3);
    if (isSelected) tileColor.lerp(selectedColor, 0.78);
    else if (isHovered) tileColor.lerp(hoverColor, 0.58);
    object.setColorAt(instanceId, tileColor);
    object.instanceColor.needsUpdate = true;
    return;
  }

  const data = object.userData.instances[instanceId];
  const stateScale = isSelected ? 1.035 : isHovered ? 1.018 : 1;
  tilePosition.set(data.x, data.y, data.z);
  tileScale.set(stateScale, data.depth * stateScale, stateScale);
  tileMatrix.compose(tilePosition, tileRotation, tileScale);
  object.setMatrixAt(instanceId, tileMatrix);
  object.instanceMatrix.needsUpdate = true;

  tileColor.fromArray(object.userData.baseColors, instanceId * 3);
  if (isSelected) tileColor.lerp(selectedColor, 0.48);
  else if (isHovered) tileColor.lerp(hoverColor, 0.32);
  object.setColorAt(instanceId, tileColor);
  object.instanceColor.needsUpdate = true;
}

function updateHover() {
  if (!interactionDirty) return;
  interactionDirty = false;
  raycaster.setFromCamera(pointer, camera);
  const intersection = raycaster.intersectObjects(tiles, false)[0];
  const hit = intersection ? {
    object: intersection.object,
    instanceId: intersection.instanceId ?? null,
  } : null;
  if (isSameTile(hit, hoveredTile)) return;
  const previous = hoveredTile;
  hoveredTile = hit;
  setTileState(previous);
  setTileState(hoveredTile);
  canvas.style.cursor = hoveredTile ? 'pointer' : 'grab';
}

function selectTile(tile) {
  const previous = selectedTile;
  selectedTile = isSameTile(selectedTile, tile) ? null : tile;
  setTileState(previous);
  setTileState(selectedTile);

  if (!selectedTile) {
    selectionCard.classList.remove('is-active');
    selectionName.textContent = 'Ничего не выбрано';
    selectionMeta.textContent = 'Нажмите на гекс карты';
    return;
  }

  const { object, instanceId } = selectedTile;
  const data = object.userData.instances[instanceId];
  const { q, r, payload, isEmpty } = data;
  selectionCard.classList.add('is-active');

  if (isEmpty) {
    selectionName.textContent = 'Свободное место';
    selectionMeta.textContent = `Координаты: [${q}; ${r}]`;
  } else {
    selectionName.textContent = payload.title;
    selectionMeta.textContent = `${payload.metadataText} · [${q}; ${r}]`;
  }
}

canvas.addEventListener('pointermove', (event) => {
  pointer.x = (event.clientX / innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / innerHeight) * 2 + 1;
  interactionDirty = true;
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
const cameraDirection = new THREE.Vector3();
function animate(time) {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  animateCamera(time);
  controls.update();
  updateHover();

  waterRings.forEach((ring, index) => {
    ring.rotation.z = elapsed * (index % 2 ? 0.006 : -0.004);
  });
  particles.rotation.y = elapsed * 0.006;

  camera.getWorldDirection(cameraDirection);
  const heading = Math.atan2(cameraDirection.x, cameraDirection.z) * 180 / Math.PI;
  compassDial.style.transform = `rotate(${-heading}deg)`;

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
