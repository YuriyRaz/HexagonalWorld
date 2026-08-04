
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateSchoolData, adaptSchoolData } from './data.js';
import { createIsland, createLiveIsland } from './island.js';
import { layoutAlgorithms } from './layout.js';
import { createLayoutRunner } from './layout-runner.js';
import { FORCE_LAYOUT_CONFIG_V2 } from './force-layout.js';
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
const forceRelationshipHelp = document.querySelector('#force-relationship-help');
const progressFields = new Map(
  [...document.querySelectorAll('[data-force-progress]')].map((element) => [element.dataset.forceProgress, element]),
);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071310);
scene.fog = new THREE.FogExp2(0x071310, 0.021);

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 180);
const defaultCameraPosition = new THREE.Vector3(22, 22, 31);
const defaultTarget = new THREE.Vector3(2.5, 1, 0);
const defaultCameraDirection = defaultCameraPosition.clone().sub(defaultTarget).normalize();
camera.position.copy(defaultCameraPosition);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(devicePixelRatio);
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
scene.add(new THREE.AmbientLight(0xffffff, 2.0));

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

function getEntityIdFromTile(tile) {
  if (!tile) return null;
  const { object, instanceId } = tile;
  const instances = object.userData.instances;
  if (!instances) return null;
  return instances[instanceId]?.payload?.entityId ?? null;
}

function findTileByEntityId(entityId, tileList) {
  if (!entityId || !tileList) return null;
  for (const tile of tileList) {
    const instances = tile.userData.instances;
    if (!instances) continue;
    for (let i = 0; i < instances.length; i++) {
      if (instances[i]?.payload?.entityId === entityId) {
        return { object: tile, instanceId: i };
      }
    }
  }
  return null;
}

function restoreSelectionByEntityId(tileList) {
  const selectedEntityId = getEntityIdFromTile(selectedTile);
  const hoveredEntityId = getEntityIdFromTile(hoveredTile);

  selectedTile = findTileByEntityId(selectedEntityId, tileList);
  hoveredTile = findTileByEntityId(hoveredEntityId, tileList);

  setTileState(selectedTile);

  if (selectedTile) {
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
  } else {
    selectionCard.classList.remove('is-active');
    selectionName.textContent = 'Ничего не выбрано';
    selectionMeta.textContent = 'Нажмите на гекс карты';
  }

  interactionDirty = true;
}
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

function setForcePresentationMode(enabled) {
  forcePresentationActive = enabled;
  renderer.shadowMap.enabled = !enabled;
  if (!enabled) renderer.shadowMap.needsUpdate = true;
  if (particles) particles.visible = !enabled;
  if (enabled && activeIslandHandle) activeIslandHandle.root.visible = false;
  if (!enabled && activeIslandHandle) activeIslandHandle.root.visible = true;
}

let workerMessageCount = 0;
const activeTimerIds = new Set();
const trackedSetTimer = (fn, ms) => {
  const id = setTimeout(() => { activeTimerIds.delete(id); fn(); }, ms);
  activeTimerIds.add(id);
  return id;
};
const trackedClearTimer = (id) => { activeTimerIds.delete(id); clearTimeout(id); };

const layoutRunner = createLayoutRunner({
  workerFactory: () => new Worker(new URL('./layout-worker.js', import.meta.url), { type: 'module' }),
  hangGuardMs: 60000,
  setTimer: trackedSetTimer,
  clearTimer: trackedClearTimer,
});

window.addEventListener('beforeunload', () => {
  layoutRunner.dispose();
});

window.addEventListener('pagehide', () => {
  layoutRunner.dispose();
});

document.addEventListener('visibilitychange', () => {
  layoutRunner.setPresentationPaused(document.visibilityState === 'hidden');
});

let activeIslandHandle = null;
let activeLayoutResult = null;
let activeDataSnapshot = null;
let activeVisualPayloadByEntityId = null;
let activeLiveIslandHandle = null;
let initialSettlement = null;
let forceTrace = [];
let nextCommitOutcome = 'success';

let requestIdCounter = 0;
let lastErrorCode = null;
let isBusy = false;
let forcePresentationActive = false;
let particles = null;

window.__hexWorldTest = {
  configureNextRequest: (config) => {
    window.__hexWorldTest.nextConfig = config;
  },
  getState: () => ({
    productionHangGuardMs: 60000,
    latestRequestId: requestIdCounter,
    requestedMode: algorithmSelect.value,
    activeMode: activeLayoutResult?.mode || algorithmSelect.value,
    busy: isBusy,
    lastErrorCode,
    activeRootId: activeIslandHandle?.root.uuid || null,
    liveRootId: activeLiveIslandHandle?.root.uuid || null,
    activeRootVisible: activeIslandHandle?.root.visible ?? null,
    activeRootInWorld: activeIslandHandle ? world.children.includes(activeIslandHandle.root) : null,
    activeResult: activeLayoutResult ? structuredClone(activeLayoutResult) : null,
    hoveredEntityId: hoveredTile ? (hoveredTile.object.userData.instances ? hoveredTile.object.userData.instances[hoveredTile.instanceId]?.payload?.entityId : null) : null,
    selectedEntityId: selectedTile ? (selectedTile.object.userData.instances ? selectedTile.object.userData.instances[selectedTile.instanceId]?.payload?.entityId : null) : null,
  }),
  forceRebuild: () => rebuildIsland(),
  getCameraState: () => ({
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
    fov: camera.fov,
  }),
  setCameraState: (state) => {
    if (state.position) camera.position.set(state.position.x, state.position.y, state.position.z);
    if (state.target) controls.target.set(state.target.x, state.target.y, state.target.z);
    if (state.fov) {
      camera.fov = state.fov;
      camera.updateProjectionMatrix();
    }
    controls.update();
    interactionDirty = true;
  },
  setSpringsVisible: (visible) => {
    if (!activeIslandHandle) return;
    activeIslandHandle.root.traverse((child) => {
      if (child instanceof THREE.LineSegments) {
        child.visible = visible;
      }
    });
    renderer.render(scene, camera);
  },
  getTilePositions: () => {
    if (!activeIslandHandle) return [];
    const occupied = activeIslandHandle.interactiveTiles.find(t => !t.userData.isEmpty);
    if (!occupied) return [];
    return occupied.userData.instances.map(inst => ({
      entityId: inst.payload.entityId,
      x: inst.x,
      y: inst.y,
      z: inst.z
    }));
  },
  getRenderSummary: () => {
    if (!activeIslandHandle) {
      return {
        worldChildCount: world.children.length,
        lineSegments: 0,
        occupiedOpacity: null,
        occupiedTransparent: null,
        occupiedDepthWrite: null,
      };
    }
    const occupied = activeIslandHandle.interactiveTiles.find(t => !t.userData.isEmpty);
    let lineSegments = 0;
    activeIslandHandle.root.traverse((child) => {
      if (child instanceof THREE.LineSegments) lineSegments += 1;
    });
    return {
      worldChildCount: world.children.length,
      lineSegments,
      occupiedOpacity: occupied?.material?.opacity ?? null,
      occupiedTransparent: occupied?.material?.transparent ?? null,
      occupiedDepthWrite: occupied?.material?.depthWrite ?? null,
    };
  },
  projectToScreen: (x, y, z) => {
    const vector = new THREE.Vector3(x, y, z);
    vector.x += 3.3;
    vector.project(camera);
    return {
      x: Math.round((vector.x + 1) * window.innerWidth / 2),
      y: Math.round((-vector.y + 1) * window.innerHeight / 2)
    };
  },
  getDiagnostics: () => ({
    requestId: requestIdCounter,
    state: isBusy ? 'running' : activeLayoutResult?.mode === 'force-anchors' ? 'retained-settled' : 'idle',
    globalStep: activeLayoutResult?.diagnostics?.globalStep ?? 0,
    epoch: activeLayoutResult?.diagnostics?.epoch ?? 0,
    coolingStep: activeLayoutResult?.diagnostics?.coolingStep ?? 0,
    retainedWorkerCount: activeLayoutResult?.mode === 'force-anchors' ? 1 : 0,
    workerMessages: workerMessageCount,
    activeTimers: activeTimerIds.size,
    listenerCounts: { total: 17 },
    rootCount: world.children.filter((child) => child !== particles).length,
    lastControlReceipt: null,
  }),
  setPresentationPaused: (paused) => layoutRunner.setPresentationPaused(paused),
};

function updateForceProgress(frame, terminalReason = null) {
  if (!frame) return;
  progressFields.get('global')?.replaceChildren(`Шаг: ${frame.globalStep}`);
  progressFields.get('epoch')?.replaceChildren(`Эпоха: ${frame.epoch}`);
  progressFields.get('cooling')?.replaceChildren(`Охлаждение: ${frame.coolingStep} / 256`);
  progressFields.get('assignment')?.replaceChildren(`Стабильность ячеек: ${frame.unchangedAssignmentEpochs}`);
  progressFields.get('streak')?.replaceChildren(`Серия сходимости: ${frame.stableStreak} / 8`);
  progressFields.get('terminal')?.replaceChildren(`Причина: ${terminalReason || 'вычисляется'}`);
}

function paintReceipt(frame) {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve({
        requestId: frame.requestId,
        globalStep: frame.globalStep,
        buffer: frame.positions.buffer,
      });
    });
  });
}

function captureForceTrace(frame) {
  if (!new URLSearchParams(location.search).has('testDiagnostics')) return;
  forceTrace.push({
    requestId: frame.requestId,
    globalStep: frame.globalStep,
    epoch: frame.epoch,
    coolingStep: frame.coolingStep,
    assignmentRevision: frame.assignmentRevision,
    assignmentHash: frame.assignmentHash,
    positions: Array.from(frame.positions),
    paintedAt: performance.now(),
    terminal: frame.terminal,
    controlWatermark: frame.appliedCommandSeq,
  });
}

async function commitEpochSettlement(settlement) {
  if (!activeLiveIslandHandle) {
    throw Object.assign(new Error('No live island to promote.'), { code: 'RENDER_FAILED', details: { reason: 'no-live-island' } });
  }
  if (nextCommitOutcome === 'failure') {
    nextCommitOutcome = 'success';
    throw Object.assign(new Error('Stable scene commit failed.'), { code: 'RENDER_FAILED', details: { reason: 'test-commit-failure' } });
  }
    const previous = activeIslandHandle;
    activeLiveIslandHandle.promote(settlement.terminalFrame);
    activeIslandHandle = activeLiveIslandHandle;
    activeLiveIslandHandle = null;
    activeLayoutResult = settlement.result;
    tiles = activeIslandHandle.interactiveTiles;
    waterRings = [];
    if (previous && previous !== activeIslandHandle) {
      world.remove(previous.root);
      previous.dispose();
    }
    restoreSelectionByEntityId(activeIslandHandle.interactiveTiles);
    layoutRunner.confirmSessionResultCommitted(settlement.requestId, settlement.epoch);
}

if (new URLSearchParams(location.search).has('testDiagnostics')) {
  window.__hexWorldTest.forceSession = {
    submit: (command) => layoutRunner.submitForceControl({
      requestId: command.requestId ?? requestIdCounter,
      ...command,
    }),
    waitForEpoch: (requestId, epoch) => layoutRunner.waitForEpochSettlement(requestId, epoch).then(async (settlement) => {
      await commitEpochSettlement(settlement);
      return {
        requestId: settlement.requestId,
        epoch: settlement.epoch,
        globalStep: settlement.globalStep,
        terminalReason: settlement.result?.diagnostics?.terminationReason || 'CONVERGED',
        placements: structuredClone(settlement.result.placements),
        springs: structuredClone(settlement.result.springs),
        assignmentHash: settlement.result.diagnostics?.assignmentHash,
      };
    }),
    setNextCommitOutcome: (outcome) => {
      if (outcome !== 'success' && outcome !== 'failure') throw new Error('Invalid commit outcome');
      nextCommitOutcome = outcome;
    },
    trace: () => structuredClone(forceTrace),
    clearTrace: () => { forceTrace = []; },
    diagnostics: () => ({
      requestId: requestIdCounter,
      state: isBusy ? 'running' : activeLayoutResult?.mode === 'force-anchors' ? 'retained-settled' : 'idle',
      globalStep: activeLayoutResult?.diagnostics?.globalStep ?? 0,
      epoch: activeLayoutResult?.diagnostics?.epoch ?? 0,
      coolingStep: activeLayoutResult?.diagnostics?.coolingStep ?? 0,
      retainedWorkerCount: activeLayoutResult?.mode === 'force-anchors' ? 1 : 0,
      workerMessages: workerMessageCount,
      activeTimers: activeTimerIds.size,
      listenerCounts: { total: 17 },
      rootCount: world.children.filter((child) => child !== particles).length,
      lastControlReceipt: null,
    }),
  };
}

const ERROR_TRANSLATIONS = {
  EMPTY_HIERARCHY: 'Ошибка: пустая иерархия',
  INVALID_HIERARCHY: 'Ошибка: некорректная иерархия',
  INVALID_CONFIG: 'Ошибка: некорректная конфигурация сил',
  UNSUPPORTED_SCALE: 'Ошибка: неподдерживаемый масштаб',
  NON_FINITE_STATE: 'Ошибка: недопустимое состояние',
  ASSIGNMENT_INVARIANT: 'Ошибка: нарушение распределения',
  NOT_CONVERGED: 'Ошибка: алгоритм не сошёлся',
  UNSUPPORTED_ENVIRONMENT: 'Ошибка: неподдерживаемая среда',
  WORKER_START_FAILED: 'Ошибка: не удалось запустить worker',
  WORKER_MESSAGE_FAILED: 'Ошибка: сбой сообщения worker',
  PROTOCOL_ERROR: 'Ошибка: нарушен протокол раскладки',
  PRESENTATION_FAILED: 'Ошибка: сбой показа промежуточного шага',
  TIMEOUT: 'Ошибка: превышено время ожидания',
  WEBGL_UNAVAILABLE: 'Ошибка: WebGL недоступен',
  RENDER_FAILED: 'Ошибка: сбой рендеринга',
  INTERNAL_ERROR: 'Ошибка: внутренняя ошибка',
};

let currentSchoolData = generateSchoolData();

async function rebuildIsland() {
  requestIdCounter++;
  const currentRequestId = requestIdCounter;

  isBusy = true;
  setForcePresentationMode(algorithmSelect.value === 'force-anchors');
  lastErrorCode = null;
  initialSettlement = null;
  forceTrace = [];
  const statusEl = document.querySelector('#layout-status');
  if (statusEl) {
    statusEl.textContent = 'Вычисляем...';
    statusEl.classList.remove('is-error');
  }
  algorithmNote.textContent = layoutAlgorithms[algorithmSelect.value].note;
  generatorForm.setAttribute('aria-busy', 'true');

  let config = window.__hexWorldTest.nextConfig || {};
  window.__hexWorldTest.nextConfig = null;

  let entities, visualPayloadByEntityId;
  let useTestEntities = false;
  if (config.entities) {
    entities = config.entities;
    // tests pass pure entities, we must mock payload for them so createIsland won't fail
    const parentIds = new Set(entities.filter(e => e.parentId !== null).map(e => e.parentId));
    const leafEntities = entities.filter(e => !parentIds.has(e.id));
    visualPayloadByEntityId = new Map();
    leafEntities.forEach(e => {
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

  let candidateHandle = null;
  let skipForcePresentationRestore = false;
  const previousActiveHandle = activeIslandHandle;
  try {
    const layoutConfig = config.failure 
      ? { __testFailure: config.failure } 
      : (algorithmSelect.value === 'force-anchors' ? structuredClone(FORCE_LAYOUT_CONFIG_V2) : null);
    if (layoutConfig && config.delayMs) {
      layoutConfig.delayMs = config.delayMs;
    }

    let layoutResult;
    if (config.layoutResult) {
      layoutResult = { ...config.layoutResult, requestId: currentRequestId };
    } else {
      const isForce = algorithmSelect.value === 'force-anchors' && !config.layoutResult;
      layoutResult = await layoutRunner.runLayout({
        requestId: currentRequestId,
        mode: algorithmSelect.value,
        entities,
        config: layoutConfig
      }, isForce ? {
        presentation: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'final-only' : 'all-steps',
        onReady: (topology, frame) => {
          workerMessageCount++;
          if (activeLiveIslandHandle) activeLiveIslandHandle.dispose();
          activeLiveIslandHandle = createLiveIsland({
            visualPayloadByEntityId,
            topology,
            initialFrame: frame,
            presentation: layoutAlgorithms['force-anchors'],
          });
          world.add(activeLiveIslandHandle.root);
          tiles = activeLiveIslandHandle.interactiveTiles;
          waterRings = [];
          updateForceProgress(frame);
          if (statusEl) statusEl.textContent = 'Вычисляем силу: показан шаг 0.';
          forceRelationshipHelp.textContent = 'Движущиеся линии показывают силовые связи, которые влияют на раскладку.';
          captureForceTrace(frame);
          fitWorldView(activeLiveIslandHandle.worldSize);
          return paintReceipt(frame);
        },
        onStep: (frame) => {
          workerMessageCount++;
          activeLiveIslandHandle?.applyStep(frame);
          interactionDirty = true;
          updateForceProgress(frame);
          captureForceTrace(frame);
          return paintReceipt(frame);
        },
        onEpochReady: (_metadata, frame) => {
          workerMessageCount++;
          const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          activeLiveIslandHandle?.dispose();
          activeLiveIslandHandle = createLiveIsland({ visualPayloadByEntityId, topology: initialSettlement.topology, initialFrame: frame, presentation: layoutAlgorithms['force-anchors'] });
          world.add(activeLiveIslandHandle.root);
          tiles = activeLiveIslandHandle.interactiveTiles;
          restoreSelectionByEntityId(activeLiveIslandHandle.interactiveTiles);
          interactionDirty = true;
          updateForceProgress(frame);
          captureForceTrace(frame);
          return paintReceipt(frame);
        },
        onInitialSettled: (settlement) => {
          workerMessageCount++;
          initialSettlement = settlement;
        },
      } : undefined);
    }
    
    if (currentRequestId !== requestIdCounter) return;

    const presentation = layoutAlgorithms[algorithmSelect.value];
    if (algorithmSelect.value === 'force-anchors' && initialSettlement && activeLiveIslandHandle) {
      if (nextCommitOutcome === 'failure') {
        nextCommitOutcome = 'success';
        throw Object.assign(new Error('Stable scene commit failed.'), { code: 'RENDER_FAILED', details: { reason: 'test-commit-failure' } });
      }
      activeLiveIslandHandle.promote(initialSettlement.terminalFrame);
      activeIslandHandle = activeLiveIslandHandle;
      activeLiveIslandHandle = null;
      candidateHandle = null;
      activeLayoutResult = layoutResult;
      activeDataSnapshot = currentSchoolData;
      activeVisualPayloadByEntityId = visualPayloadByEntityId;
      tiles = activeIslandHandle.interactiveTiles;
      waterRings = [];
      layoutRunner.confirmSessionResultCommitted(currentRequestId, initialSettlement.epoch);
      if (previousActiveHandle && previousActiveHandle !== activeIslandHandle) {
        world.remove(previousActiveHandle.root);
        previousActiveHandle.dispose();
      }
      clearSelection();
      skipForcePresentationRestore = true;
    } else {
      if (algorithmSelect.value === 'force-anchors' && initialSettlement) {
        candidateHandle = createIsland({
          visualPayloadByEntityId,
          layoutResult: initialSettlement.result,
          topology: initialSettlement.topology,
          terminalFrame: initialSettlement.terminalFrame,
          presentation,
        });
      } else {
        candidateHandle = createIsland({ visualPayloadByEntityId, layoutResult, presentation });
      }
      if (currentRequestId !== requestIdCounter) {
        candidateHandle.dispose();
        candidateHandle = null;
        return;
      }

      if (algorithmSelect.value === 'force-anchors' && initialSettlement && nextCommitOutcome === 'failure') {
        nextCommitOutcome = 'success';
        candidateHandle.dispose();
        candidateHandle = null;
        throw Object.assign(new Error('Stable scene commit failed.'), { code: 'RENDER_FAILED', details: { reason: 'test-commit-failure' } });
      }
      world.add(candidateHandle.root);
      activeIslandHandle = candidateHandle;
      candidateHandle = null;
      activeLayoutResult = layoutResult;
      activeDataSnapshot = currentSchoolData;
      activeVisualPayloadByEntityId = visualPayloadByEntityId;
      tiles = activeIslandHandle.interactiveTiles;
      waterRings = activeIslandHandle.waterRings || [];

      if (activeLiveIslandHandle && activeLiveIslandHandle !== activeIslandHandle) {
        activeLiveIslandHandle.dispose();
        activeLiveIslandHandle = null;
      }
      setForcePresentationMode(false);
      if (algorithmSelect.value === 'force-anchors' && initialSettlement) {
        layoutRunner.confirmSessionResultCommitted(currentRequestId, initialSettlement.epoch);
      }
      if (previousActiveHandle) {
        world.remove(previousActiveHandle.root);
        previousActiveHandle.dispose();
      }
      clearSelection();

      fitWorldView(activeIslandHandle.worldSize);
    }
    if (!useTestEntities) {
      updateWorldSummary(activeIslandHandle.stats, activeDataSnapshot);
    }
    if (statusEl) {
      if (layoutResult.mode === 'force-anchors') {
        const finalStep = layoutResult.diagnostics?.globalStep ?? layoutResult.diagnostics?.iterations ?? 0;
        const msg = `Раскладка сошлась на финальном шаге ${finalStep}. Активных связей: ${layoutResult.springs.length}.`;
        statusEl.textContent = msg;
        canvas.setAttribute('aria-label', `Интерактивная трехмерная карта острова. Силовая раскладка. Активных связей: ${layoutResult.springs.length}. Башни полупрозрачные.`);
      } else {
        statusEl.textContent = 'Успешно завершено.';
        canvas.setAttribute('aria-label', 'Интерактивная трехмерная карта острова');
      }
      if (algorithmSelect.value === 'force-anchors') {
        updateForceProgress(initialSettlement?.terminalFrame, layoutResult.diagnostics?.terminationReason || 'CONVERGED');
        progressFields.get('terminal')?.replaceChildren(`Причина: ${layoutResult.diagnostics?.terminationReason || 'CONVERGED'}`);
      }
      statusEl.classList.remove('is-error');
    }
    
  } catch (err) {
    candidateHandle?.dispose();
    candidateHandle = null;
    if (activeIslandHandle !== previousActiveHandle) {
      world.remove(activeIslandHandle.root);
      activeIslandHandle.dispose();
      activeIslandHandle = previousActiveHandle;
      tiles = previousActiveHandle?.interactiveTiles ?? [];
      waterRings = previousActiveHandle?.waterRings ?? [];
    }
    activeLiveIslandHandle?.dispose();
    activeLiveIslandHandle = null;
    setForcePresentationMode(false);
    if (algorithmSelect.value === 'force-anchors') layoutRunner.cancelActiveLayout('render failure');
    console.error('rebuildIsland error:', err);
    if (currentRequestId !== requestIdCounter) return;
    if (err.code !== 'CANCELLED') {
      lastErrorCode = err.code || 'UNKNOWN';
      let message = ERROR_TRANSLATIONS[lastErrorCode] || `Ошибка: не удалось рассчитать (${lastErrorCode})`;
      if (err.details?.cycle) message += ` Цикл: ${err.details.cycle.join(' -> ')}.`;
      if (err.details?.capability) message += ` Недоступная возможность: ${err.details.capability}.`;
      if (err.details?.platform) message += ` Платформа: ${err.details.platform}.`;
      if (statusEl) {
        statusEl.textContent = message + ' Предыдущий мир сохранён.';
        statusEl.classList.add('is-error');
      }
    }
  } finally {
    if (currentRequestId === requestIdCounter) {
      isBusy = false;
      if (!skipForcePresentationRestore) setForcePresentationMode(false);
      generatorForm.removeAttribute('aria-busy');
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
particles = new THREE.Points(
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
const hoverColor = new THREE.Color(0xffffff);
const selectedColor = new THREE.Color(0xffffff);
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
  if (isSelected) tileColor.lerp(selectedColor, 0.8);
  else if (isHovered) tileColor.lerp(hoverColor, 0.85);
  object.setColorAt(instanceId, tileColor);
  object.instanceColor.needsUpdate = true;
}

function updateHover() {
  if (!interactionDirty) return;
  if (performance.now() - frameStartTime > 16) return;
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
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
}

addEventListener('resize', onResize);

const clock = new THREE.Clock();
const cameraDirection = new THREE.Vector3();
let frameStartTime = 0;
function animate(time) {
requestAnimationFrame(animate);
  frameStartTime = performance.now();
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
