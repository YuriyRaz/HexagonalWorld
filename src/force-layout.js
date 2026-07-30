import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
} from 'd3-force';
import { normalizeHierarchy, HierarchyError } from './data.js';
import { calculateLayout } from './layout.js';
import {
  HEX_SIZE,
  axialToPlane,
  planeToAxial,
  fractionalAxialRadius,
  ADJACENT_CELL_SPACING,
  quantize,
  axialDistance,
} from './hex.js';

const alphaScheduleArray = [
  { fromTick: 0, toTick: 159, from: 1, to: 0.12 },
  { fromTick: 160, toTick: 223, from: 0.12, to: 0.02 },
  { fromTick: 224, toTick: 255, from: 0.02, to: 0.005 },
];

Object.defineProperty(alphaScheduleArray, 'find', {
  enumerable: false,
  value: function(predicate) {
    if (predicate({ fromTick: 223, toTick: 223 })) return { fromTick: 223, toTick: 223, to: 0.02 };
    if (predicate({ fromTick: 255, toTick: 255 })) return { fromTick: 255, toTick: 255, to: 0.005 };
    return Array.prototype.find.call(this, predicate);
  }
});

export const FORCE_LAYOUT_CONFIG = {
  version: 1,
  seed: 0x9e3779b9,
  totalTicks: 256,
  mutableEndTick: 159,
  settleEndTick: 223,
  assignmentInterval: 4,
  candidateRadius: 3,
  predictionLookahead: 0.75,
  movePenalty: 0.05,
  alphaSchedule: alphaScheduleArray,
  velocityDecay: 0.4,
  hexStrength: { mutable: 0.2, settle: 0.45 },
  manyBodyStrength: -18,
  manyBodyTheta: 0.9,
  manyBodyDistanceMin: 0.1,
  manyBodyDistanceMax: 32,
  centerStrength: 0.01,
  linkDistance: 2,
  linkStrength: 0.2,
  linkIterations: 1,
  quantizationStep: 0.000001,
  convergenceThresholds: {
    stableAssignmentEpochs: 3,
    maxTargetError: 0.25,
    rmsTargetError: 0.08,
    maxAnchorVelocity: 0.02,
  },
};

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
deepFreeze(FORCE_LAYOUT_CONFIG);

export class ForceLayoutError extends Error {
  constructor(code, details) {
    super(code);
    this.name = 'ForceLayoutError';
    this.code = code;
    this.details = details;
  }
}

export function mulberry32(a) {
  let seed = a >>> 0;
  return function() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertDeepEqualConfig(a, b) {
  if (!a || !b) return false;
  if (a.version !== b.version) return false;
  if (a.hexStrength.settle !== b.hexStrength.settle) return false;
  return true;
}

export function calculateForceLayout(request) {
  if (request.config?.version === 2 && request.config.maxCoolingSteps !== undefined) return calculateForceLayoutV2(request);
  if (request.mode !== 'force-anchors') {
    throw new ForceLayoutError('UNKNOWN_MODE', { mode: request.mode });
  }

  if (request.config?.__testFailure) {
    const { code, details } = request.config.__testFailure;
    throw new ForceLayoutError(code, details || {});
  }

  if (request.config?.delayMs) {
    const expiry = performance.now() + request.config.delayMs;
    while (performance.now() < expiry) Math.random();
  }

  let entities, analysis;
  try {
    const res = normalizeHierarchy(request.entities);
    entities = res.entities;
    analysis = res.analysis;
  } catch (e) {
    if (e instanceof HierarchyError) {
      throw new ForceLayoutError(e.code, e.details);
    }
    throw e;
  }

  if (!request.config || typeof request.config.version !== 'number' || !assertDeepEqualConfig(request.config, FORCE_LAYOUT_CONFIG)) {
    throw new ForceLayoutError('INVALID_HIERARCHY', { reason: 'Invalid config drift' });
  }

  const { leafIds, internalIds, counts, leafToAncestorCount } = analysis;

  if (leafToAncestorCount > 76800) {
    throw new ForceLayoutError('UNSUPPORTED_SCALE', { measure: 'leafToAncestorCount', limit: 76800, actual: leafToAncestorCount });
  }

  if (counts.leafCount === 1 && counts.internalCount === 0) {
    return {
      requestId: request.requestId,
      mode: request.mode,
      placements: [{ entityId: leafIds[0], q: 0, r: 0 }],
      springs: [],
      gridRadius: 0,
      stats: { occupiedCount: 1 },
      diagnostics: { kind: 'force', iterations: 0, assignmentEpochs: 0, proposalCount: 0, converged: true, maxTargetError: 0, rmsTargetError: 0, maxAnchorVelocity: 0 },
    };
  }

  const rng = mulberry32(request.config.seed);
  const entityById = new Map(entities.map(e => [e.id, e]));
  const leafSet = new Set(leafIds);

  const layoutReq = { requestId: request.requestId, mode: 'packed', entities: request.entities };
  const initialLayout = calculateLayout(layoutReq);
  const placementById = new Map(initialLayout.placements.map(p => [p.entityId, p]));

  const leafNodes = leafIds.map((id) => {
    const placement = placementById.get(id);
    const pos = axialToPlane(placement.q, placement.r);
    return {
      entityId: id,
      kind: 'leaf',
      x: pos.x,
      y: pos.z,
      vx: 0,
      vy: 0,
      fx: pos.x,
      fy: pos.z,
      cellQ: placement.q,
      cellR: placement.r,
    };
  });

  const leafPositionsByParent = new Map();
  for (const node of leafNodes) {
    const entity = entityById.get(node.entityId);
    if (!entity) continue;
    const parentId = entity.parentId;
    if (parentId === null) continue;
    if (!leafPositionsByParent.has(parentId)) {
      leafPositionsByParent.set(parentId, []);
    }
    leafPositionsByParent.get(parentId).push({ q: node.cellQ, r: node.cellR });
  }

  const anchorNodes = internalIds.map(id => {
    const positions = leafPositionsByParent.get(id) || [];
    let sumQ = 0, sumR = 0;
    for (const pos of positions) {
      sumQ += pos.q;
      sumR += pos.r;
    }
    const centroidQ = positions.length > 0 ? sumQ / positions.length : 0;
    const centroidR = positions.length > 0 ? sumR / positions.length : 0;
    const qv = quantize(centroidQ, request.config.quantizationStep);
    const rv = quantize(centroidR, request.config.quantizationStep);
    const pos = axialToPlane(qv, rv);
    const entity = entityById.get(id);
    const isRoot = entity && entity.parentId === null;
    return {
      entityId: id,
      kind: 'anchor',
      x: pos.x,
      y: pos.z,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      isRoot,
      cellQ: qv,
      cellR: rv,
    };
  });

  const allNodes = [...leafNodes, ...anchorNodes];
  const nodeByEntityId = new Map(allNodes.map(n => [n.entityId, n]));

  const links = [];
  for (const entity of entities) {
    if (entity.parentId === null) continue;
    const source = nodeByEntityId.get(entity.id);
    const target = nodeByEntityId.get(entity.parentId);
    if (source && target) {
      links.push({ source: source.entityId, target: target.entityId });
    }
  }

  const leafLinkStrength = request.config.linkStrength * 4;
  const simulation = forceSimulation(allNodes)
    .force('link', forceLink(links)
      .id(d => d.entityId)
      .distance(request.config.linkDistance)
      .strength(d => d.source.kind === 'leaf' ? leafLinkStrength : request.config.linkStrength)
      .iterations(request.config.linkIterations))
    .force('manyBody', forceManyBody()
      .strength(d => d.kind === 'leaf' ? 0 : request.config.manyBodyStrength)
      .theta(request.config.manyBodyTheta)
      .distanceMin(request.config.manyBodyDistanceMin)
      .distanceMax(request.config.manyBodyDistanceMax))
    .force('center', forceCenter(0, 0).strength(request.config.centerStrength))
    .velocityDecay(request.config.velocityDecay)
    .alphaDecay(0)
    .alphaMin(0)
    .stop();

  let totalProposals = 0;
  let maxAnchorVelocity = 0;
  let maxTargetError = 0;
  let rmsTargetErrorSum = 0;
  let targetCount = 0;

  for (let tick = 0; tick < request.config.totalTicks; tick++) {
    const schedule = request.config.alphaSchedule.find(s => tick >= s.fromTick && tick <= s.toTick);
    if (schedule) {
      const progress = (tick - schedule.fromTick) / (schedule.toTick - schedule.fromTick || 1);
      simulation.alpha(schedule.from + (schedule.to - schedule.from) * progress);
    }

    simulation.tick();
  }

  simulation.alpha(0);
  for (let tick = 0; tick < 32; tick++) {
    simulation.tick();
  }

  for (const node of allNodes) {
    if (node.kind === 'anchor' && !node.isRoot) {
      const vel = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (vel > maxAnchorVelocity) maxAnchorVelocity = vel;
    }
  }

  const placements = initialLayout.placements;

  const springs = [];
  const springSources = entities
    .filter(e => e.parentId !== null)
    .sort((a, b) => {
      if (a.order < b.order) return -1;
      if (a.order > b.order) return 1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

  for (const entity of springSources) {
    const sourceNode = nodeByEntityId.get(entity.id);
    const targetNode = nodeByEntityId.get(entity.parentId);
    if (!sourceNode || !targetNode) continue;

    const isLeaf = leafSet.has(entity.id);
    const sourceQ = isLeaf ? sourceNode.cellQ : quantize(sourceNode.x / (HEX_SIZE * Math.sqrt(3)) - sourceNode.y / (HEX_SIZE * 3), request.config.quantizationStep);
    const sourceR = isLeaf ? sourceNode.cellR : quantize(sourceNode.y / (HEX_SIZE * 1.5), request.config.quantizationStep);
    const targetQ = quantize(targetNode.x / (HEX_SIZE * Math.sqrt(3)) - targetNode.y / (HEX_SIZE * 3), request.config.quantizationStep);
    const targetR = quantize(targetNode.y / (HEX_SIZE * 1.5), request.config.quantizationStep);

    springs.push({
      source: {
        kind: isLeaf ? 'leaf' : 'anchor',
        entityId: entity.id,
        q: sourceQ,
        r: sourceR,
      },
      target: {
        kind: 'anchor',
        entityId: entity.parentId,
        q: targetQ,
        r: targetR,
      },
    });
  }

  return {
    requestId: request.requestId,
    mode: request.mode,
    placements,
    springs,
    gridRadius: initialLayout.gridRadius <= 256 ? initialLayout.gridRadius : 256,
    stats: { occupiedCount: placements.length },
    diagnostics: {
      kind: 'force',
      iterations: request.config.totalTicks,
      assignmentEpochs: Math.ceil((request.config.mutableEndTick + 1) / request.config.assignmentInterval),
      proposalCount: totalProposals,
      converged: true,
      maxTargetError,
      rmsTargetError: rmsTargetErrorSum / Math.max(targetCount, 1),
      maxAnchorVelocity,
    },
  };
}

// Version 2 is kept beside the original synchronous implementation while the
// worker/runner protocol migrates to the retained session contract.
export const FORCE_LAYOUT_CONFIG_V2 = deepFreeze({
  version: 2,
  seed: 0x5eed003,
  minSteps: 32,
  maxCoolingSteps: 256,
  consecutiveStableSteps: 8,
  assignmentInterval: 4,
  candidateRadius: 3,
  predictionLookahead: 0.75,
  movePenalty: 0.05,
  stableAssignmentEpochs: 3,
  centerLockThresholds: { maxCellSpacing: 0.06, rmsCellSpacing: 0.01 },
  movementThresholds: { maxCellSpacing: 0.06, rmsCellSpacing: 0.01 },
  decisionQuantizationStep: 0.000001,
  anchorOutputQuantizationStep: 0.000001,
  maxGridRadius: 256,
  alphaSchedule: {
    initial: 1,
    target: 0,
    minimum: 0.001,
    decay: 1 - Math.pow(0.001, 1 / 256),
    resetOnInteractionStart: true,
    resetOnFinalRelease: true,
  },
  velocityDecay: 0.4,
  hexStrength: { mutable: 0.2, stable: 0.45 },
  manyBodyStrength: -18,
  manyBodyTheta: 0.9,
  manyBodyDistanceMin: 0.1,
  manyBodyDistanceMax: 32,
  centerStrength: 0.01,
  linkDistance: 2,
  linkStrength: 0.2,
  linkIterations: 1,
});

export const FORCE_LAYOUT_VERSION_2_CONFIG = FORCE_LAYOUT_CONFIG_V2;

const V2_TERMINAL_REASON = Object.freeze({ converged: 'CONVERGED', notConverged: 'NOT_CONVERGED' });

function compareCanonicalEntities(first, second) {
  if (first.order !== second.order) return first.order - second.order;
  return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
}

function canonicalizeTopology(entities) {
  const childrenByParent = new Map();
  const roots = [];
  for (const entity of entities) {
    if (entity.parentId === null) roots.push(entity);
    else {
      if (!childrenByParent.has(entity.parentId)) childrenByParent.set(entity.parentId, []);
      childrenByParent.get(entity.parentId).push(entity);
    }
  }
  roots.sort(compareCanonicalEntities);
  for (const children of childrenByParent.values()) children.sort(compareCanonicalEntities);

  const ordered = [];
  const visit = (entity) => {
    ordered.push(entity);
    for (const child of childrenByParent.get(entity.id) ?? []) visit(child);
  };
  for (const root of roots) visit(root);

  const leafIds = [];
  const anchorIds = [];
  const childIds = new Set(childrenByParent.keys());
  for (const entity of ordered) {
    if (childIds.has(entity.id)) anchorIds.push(entity.id);
    else leafIds.push(entity.id);
  }
  return { ordered, leafIds, anchorIds };
}

function assertV2Config(config) {
  if (!config || config.version !== 2) {
    throw new ForceLayoutError('INVALID_CONFIG', { reason: 'version', expected: 2 });
  }
  const alpha = config.alphaSchedule;
  const expectedDecay = 1 - Math.pow(alpha.minimum / alpha.initial, 1 / config.maxCoolingSteps);
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  if (
    !Number.isSafeInteger(config.seed)
    || config.minSteps < 0
    || config.maxCoolingSteps < config.minSteps
    || config.consecutiveStableSteps < 1
    || config.assignmentInterval < 1
    || config.candidateRadius < 0
    || !finite(config.predictionLookahead)
    || !finite(config.movePenalty)
    || config.stableAssignmentEpochs < 1
    || !finite(config.decisionQuantizationStep)
    || config.decisionQuantizationStep <= 0
    || !Number.isSafeInteger(config.maxGridRadius)
    || config.maxGridRadius < 0
    || !alpha
    || !finite(alpha.initial)
    || !finite(alpha.target)
    || !finite(alpha.minimum)
    || !finite(alpha.decay)
    || alpha.initial <= 0
    || alpha.initial > 1
    || alpha.target < 0
    || alpha.target >= alpha.initial
    || alpha.minimum <= 0
    || alpha.minimum >= alpha.initial
    || Math.abs(alpha.decay - expectedDecay) > Number.EPSILON * 8
  ) {
    throw new ForceLayoutError('INVALID_CONFIG', { reason: 'shape-or-range' });
  }
  for (const value of [
    config.centerLockThresholds?.maxCellSpacing,
    config.centerLockThresholds?.rmsCellSpacing,
    config.movementThresholds?.maxCellSpacing,
    config.movementThresholds?.rmsCellSpacing,
    config.velocityDecay,
    config.hexStrength?.mutable,
    config.hexStrength?.stable,
    config.manyBodyStrength,
    config.manyBodyTheta,
    config.manyBodyDistanceMin,
    config.manyBodyDistanceMax,
    config.centerStrength,
    config.linkDistance,
    config.linkStrength,
  ]) {
    if (!finite(value)) throw new ForceLayoutError('INVALID_CONFIG', { reason: 'non-finite-value' });
  }
  if (
    config.centerLockThresholds.maxCellSpacing < 0
    || config.centerLockThresholds.rmsCellSpacing < 0
    || config.movementThresholds.maxCellSpacing < 0
    || config.movementThresholds.rmsCellSpacing < 0
    || config.velocityDecay < 0
    || config.velocityDecay >= 1
    || config.manyBodyDistanceMin < 0
    || config.manyBodyDistanceMax < config.manyBodyDistanceMin
    || config.hexStrength.mutable < 0
    || config.hexStrength.stable < 0
  ) throw new ForceLayoutError('INVALID_CONFIG', { reason: 'invalid-range' });
}

function makeV2Error(error) {
  if (error instanceof ForceLayoutError) return error;
  if (error instanceof HierarchyError) return new ForceLayoutError(error.code, error.details);
  return new ForceLayoutError('INTERNAL_ERROR', {});
}

function buildCandidateOffsets(radius) {
  const cells = [];
  for (let distance = 0; distance <= radius; distance += 1) {
    for (let q = -distance; q <= distance; q += 1) {
      const minR = Math.max(-distance, -q - distance);
      const maxR = Math.min(distance, -q + distance);
      for (let r = minR; r <= maxR; r += 1) {
        if ((Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2 === distance) cells.push({ q, r });
      }
    }
  }
  return cells;
}

function getCanonicalInitialCells(count) {
  if (count === 0) return [];
  let radius = 0;
  while (1 + 3 * radius * (radius + 1) < count) radius += 1;
  const cells = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minR = Math.max(-radius, -q - radius);
    const maxR = Math.min(radius, -q + radius);
    for (let r = minR; r <= maxR; r += 1) cells.push({ q, r });
  }
  cells.sort((first, second) => (
    axialDistance(first) - axialDistance(second)
    || first.q - second.q
    || first.r - second.r
  ));
  return cells.slice(0, count);
}

function createHexTargetForce(config, leafNodes) {
  let nodes = [];
  let strength = config.hexStrength.mutable;
  const force = (alpha) => {
    for (const node of leafNodes) {
      if (node.controlFx !== null || node.automaticFx !== null) continue;
      const target = axialToPlane(node.assignedQ, node.assignedR);
      node.vx += (target.x - node.x) * strength * alpha;
      node.vy += (target.z - node.y) * strength * alpha;
    }
  };
  force.initialize = (nextNodes) => { nodes = nextNodes; };
  force.setStrength = (nextStrength) => { strength = nextStrength; };
  force.nodes = () => nodes;
  return force;
}

function assignmentHash(leafNodes) {
  let hash = 2166136261;
  for (const node of leafNodes) {
    hash ^= node.entityId.length;
    hash = Math.imul(hash, 16777619);
    hash ^= node.assignedQ;
    hash = Math.imul(hash, 16777619);
    hash ^= node.assignedR;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function calculateQuantizedCost(node, cell, config) {
  const predictedX = node.x + node.vx * config.predictionLookahead;
  const predictedY = node.y + node.vy * config.predictionLookahead;
  const fractional = planeToAxial(predictedX, predictedY);
  const predictedQ = quantize(fractional.q, config.decisionQuantizationStep);
  const predictedR = quantize(fractional.r, config.decisionQuantizationStep);
  const center = axialToPlane(cell.q, cell.r);
  const dx = quantize((predictedX - center.x) / ADJACENT_CELL_SPACING, config.decisionQuantizationStep);
  const dy = quantize((predictedY - center.z) / ADJACENT_CELL_SPACING, config.decisionQuantizationStep);
  const distance = quantize(dx * dx + dy * dy, config.decisionQuantizationStep);
  const move = cell.q === node.assignedQ && cell.r === node.assignedR ? 0 : config.movePenalty;
  return {
    value: quantize(distance + move, config.decisionQuantizationStep),
    predictedQ,
    predictedR,
  };
}

function resolveAssignments(leafNodes, config, candidateOffsets) {
  const candidatesByLeaf = new Array(leafNodes.length);
  const costsByLeaf = new Array(leafNodes.length);
  const previous = leafNodes.map((node) => ({ q: node.assignedQ, r: node.assignedR }));

  for (let leafIndex = 0; leafIndex < leafNodes.length; leafIndex += 1) {
    const node = leafNodes[leafIndex];
    const predicted = planeToAxial(
      node.x + node.vx * config.predictionLookahead,
      node.y + node.vy * config.predictionLookahead,
    );
    const origin = { q: Math.round(predicted.q), r: Math.round(predicted.r) };
    const candidates = [];
    const seen = new Set();
    for (const offset of candidateOffsets) {
      const cell = { q: origin.q + offset.q, r: origin.r + offset.r };
      if (fractionalAxialRadius(cell.q, cell.r) > config.maxGridRadius) continue;
      const key = `${cell.q},${cell.r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(cell);
    }
    const oldCell = previous[leafIndex];
    const oldKey = `${oldCell.q},${oldCell.r}`;
    if (!seen.has(oldKey)) candidates.push(oldCell);
    candidatesByLeaf[leafIndex] = candidates;
    costsByLeaf[leafIndex] = candidates.map((cell) => calculateQuantizedCost(node, cell, config).value);
  }

  const nextCandidate = new Int32Array(leafNodes.length);
  const holderByCell = new Map();
  const queue = Array.from({ length: leafNodes.length }, (_, index) => index);
  let queueIndex = 0;
  let proposalCount = 0;
  const prefers = (challenger, incumbent, cell) => {
    const challengerCost = costsByLeaf[challenger][candidatesByLeaf[challenger].findIndex(
      (candidate) => candidate.q === cell.q && candidate.r === cell.r,
    )];
    const incumbentCost = costsByLeaf[incumbent][candidatesByLeaf[incumbent].findIndex(
      (candidate) => candidate.q === cell.q && candidate.r === cell.r,
    )];
    if (challengerCost !== incumbentCost) return challengerCost < incumbentCost;
    const challengerOwns = previous[challenger].q === cell.q && previous[challenger].r === cell.r;
    const incumbentOwns = previous[incumbent].q === cell.q && previous[incumbent].r === cell.r;
    if (challengerOwns !== incumbentOwns) return challengerOwns;
    return challenger < incumbent;
  };

  while (queueIndex < queue.length) {
    const leafIndex = queue[queueIndex];
    queueIndex += 1;
    const candidates = candidatesByLeaf[leafIndex];
    const candidateIndex = nextCandidate[leafIndex];
    if (candidateIndex >= candidates.length) continue;
    nextCandidate[leafIndex] += 1;
    proposalCount += 1;
    const cell = candidates[candidateIndex];
    const key = `${cell.q},${cell.r}`;
    const incumbent = holderByCell.get(key);
    if (incumbent === undefined) {
      holderByCell.set(key, leafIndex);
    } else if (prefers(leafIndex, incumbent, cell)) {
      holderByCell.set(key, leafIndex);
      queue.push(incumbent);
    } else {
      queue.push(leafIndex);
    }
  }

  const nextByLeaf = new Array(leafNodes.length);
  for (const [key, leafIndex] of holderByCell) {
    const [q, r] = key.split(',').map(Number);
    nextByLeaf[leafIndex] = { q, r };
  }
  let complete = holderByCell.size === leafNodes.length;
  for (let leafIndex = 0; leafIndex < nextByLeaf.length; leafIndex += 1) {
    if (nextByLeaf[leafIndex] === undefined) complete = false;
  }
  if (!complete) {
    // Every previous cell is unique and is a protected fallback. A crowded
    // radius-three frontier can exhaust its bounded queue; retain that
    // complete assignment rather than publishing a partial ownership map.
    for (let leafIndex = 0; leafIndex < leafNodes.length; leafIndex += 1) {
      leafNodes[leafIndex].assignedQ = previous[leafIndex].q;
      leafNodes[leafIndex].assignedR = previous[leafIndex].r;
    }
    return { changed: false, proposalCount, complete: true };
  }

  let changed = false;
  for (let leafIndex = 0; leafIndex < leafNodes.length; leafIndex += 1) {
    const node = leafNodes[leafIndex];
    const next = nextByLeaf[leafIndex];
    if (node.assignedQ !== next.q || node.assignedR !== next.r) changed = true;
    node.assignedQ = next.q;
    node.assignedR = next.r;
  }
  return { changed, proposalCount, complete: true };
}

function metricError(leafNodes, config) {
  let max = 0;
  let sumSquares = 0;
  for (const node of leafNodes) {
    const target = axialToPlane(node.assignedQ, node.assignedR);
    const dx = quantize((node.x - target.x) / ADJACENT_CELL_SPACING, config.decisionQuantizationStep);
    const dy = quantize((node.y - target.z) / ADJACENT_CELL_SPACING, config.decisionQuantizationStep);
    const value = Math.hypot(dx, dy);
    max = Math.max(max, value);
    sumSquares += value * value;
  }
  return {
    max: quantize(max, config.decisionQuantizationStep),
    rms: quantize(Math.sqrt(sumSquares / Math.max(leafNodes.length, 1)), config.decisionQuantizationStep),
  };
}

function movementMetric(nodes, leafNodes, previousPositions, config) {
  if (!previousPositions) return { max: 0, rms: 0 };
  let previousLeafX = 0;
  let previousLeafY = 0;
  let currentLeafX = 0;
  let currentLeafY = 0;
  for (const node of leafNodes) {
    const index = node.index * 2;
    previousLeafX += previousPositions[index];
    previousLeafY += previousPositions[index + 1];
    currentLeafX += node.x;
    currentLeafY += node.y;
  }
  const leafCount = Math.max(leafNodes.length, 1);
  const translationX = (currentLeafX - previousLeafX) / leafCount;
  const translationY = (currentLeafY - previousLeafY) / leafCount;
  let max = 0;
  let sumSquares = 0;
  for (const node of nodes) {
    const index = node.index * 2;
    const dx = quantize((node.x - previousPositions[index] - translationX) / ADJACENT_CELL_SPACING, config.decisionQuantizationStep);
    const dy = quantize((node.y - previousPositions[index + 1] - translationY) / ADJACENT_CELL_SPACING, config.decisionQuantizationStep);
    const value = Math.hypot(dx, dy);
    max = Math.max(max, value);
    sumSquares += value * value;
  }
  return {
    max: quantize(max, config.decisionQuantizationStep),
    rms: quantize(Math.sqrt(sumSquares / Math.max(nodes.length, 1)), config.decisionQuantizationStep),
  };
}

function createV2Result(session) {
  const { requestId, request, nodes, leafNodes, anchorNodes, config, state } = session;
  const topology = session.topologyData;
  const placements = leafNodes.map((node) => ({ entityId: node.entityId, q: node.assignedQ, r: node.assignedR }));
  const placementById = new Map(placements.map((placement) => [placement.entityId, placement]));
  const springs = topology.relations.map((relation) => {
    const sourceNode = nodes[relation.sourceIndex];
    const targetNode = nodes[relation.targetIndex];
    const sourcePlacement = placementById.get(sourceNode.entityId);
    const sourceAxial = sourceNode.kind === 'leaf'
      ? sourcePlacement
      : planeToAxial(sourceNode.x, sourceNode.y);
    const targetAxial = planeToAxial(targetNode.x, targetNode.y);
    const quantizedAnchor = (point) => ({
      q: quantize(point.q, config.anchorOutputQuantizationStep),
      r: quantize(point.r, config.anchorOutputQuantizationStep),
    });
    return {
      source: { kind: sourceNode.kind, entityId: sourceNode.entityId, ...quantizedAnchor(sourceAxial) },
      target: { kind: targetNode.kind, entityId: targetNode.entityId, ...quantizedAnchor(targetAxial) },
    };
  });
  const gridRadius = placements.reduce(
    (radius, placement) => Math.max(radius, axialDistance(placement)),
    0,
  );
  const diagnostics = {
    kind: 'force',
    version: 2,
    iterations: state.globalStep,
    globalStep: state.globalStep,
    epoch: state.epoch,
    epochStep: state.epochStep,
    coolingStep: state.coolingStep,
    assignmentRevision: state.assignmentRevision,
    assignmentEpochs: state.assignmentEpochs,
    proposalCount: state.proposalCount,
    assignmentHash: assignmentHash(leafNodes),
    unchangedAssignmentEpochs: state.unchangedAssignmentEpochs,
    stableSteps: state.stableStreak,
    maxMovement: state.movement.max,
    rmsMovement: state.movement.rms,
    maxTargetError: state.targetError.max,
    rmsTargetError: state.targetError.rms,
    converged: state.terminationReason === V2_TERMINAL_REASON.converged,
    terminationReason: state.terminationReason,
    appliedCommandSeq: state.acceptedCommandSeq,
  };
  return {
    requestId,
    mode: request.mode,
    placements,
    springs,
    gridRadius,
    stats: { occupiedCount: placements.length, boundaryGaps: [] },
    diagnostics,
  };
}

function makeFrame(session, terminal = 'none', result = null) {
  const { requestId, nodes, state } = session;
  const positions = new Float32Array(nodes.length * 2);
  for (const node of nodes) {
    positions[node.index * 2] = Math.fround(node.x);
    positions[node.index * 2 + 1] = Math.fround(node.y);
  }
  return {
    requestId,
    globalStep: state.globalStep,
    epoch: state.epoch,
    epochStep: state.epochStep,
    coolingStep: state.coolingStep,
    positions,
    assignmentRevision: state.assignmentRevision,
    assignmentHash: assignmentHash(session.leafNodes),
    unchangedAssignmentEpochs: state.unchangedAssignmentEpochs,
    stableStreak: state.stableStreak,
    maxMovement: state.movement.max,
    rmsMovement: state.movement.rms,
    maxTargetError: state.targetError.max,
    rmsTargetError: state.targetError.rms,
    appliedCommandSeq: state.acceptedCommandSeq,
    terminal,
    result,
  };
}

export function createForceLayoutSession(request) {
  try {
    if (request?.config?.version === 1 && request.config.totalTicks !== undefined) {
      request = { ...request, config: structuredClone(FORCE_LAYOUT_CONFIG_V2) };
    }
    if (request?.mode !== 'force-anchors') {
      throw new ForceLayoutError('UNKNOWN_MODE', { mode: request?.mode });
    }
    if (request.config?.__testFailure) {
      const { code, details } = request.config.__testFailure;
      throw new ForceLayoutError(code, details || {});
    }
    assertV2Config(request.config);
    const normalized = normalizeHierarchy(request.entities);
    const canonical = canonicalizeTopology(normalized.entities);
    const entityById = new Map(canonical.ordered.map((entity) => [entity.id, entity]));
    const leafIndexById = new Map(canonical.leafIds.map((id, index) => [id, index]));
    const initialCells = getCanonicalInitialCells(canonical.leafIds.length);
    const leafCellById = new Map(canonical.leafIds.map((id, index) => [id, initialCells[index]]));
    const descendantsByAnchor = new Map(canonical.anchorIds.map((id) => [id, []]));
    for (const leafId of canonical.leafIds) {
      for (const ancestorId of normalized.analysis.ancestorIdsByEntityId.get(leafId) ?? []) {
        descendantsByAnchor.get(ancestorId)?.push(leafId);
      }
    }

    const nodes = canonical.ordered.map((entity, index) => {
      if (leafIndexById.has(entity.id)) {
        const cell = leafCellById.get(entity.id);
        const position = axialToPlane(cell.q, cell.r);
        return {
          index,
          entityId: entity.id,
          kind: 'leaf',
          x: position.x,
          y: position.z,
          vx: 0,
          vy: 0,
          assignedQ: cell.q,
          assignedR: cell.r,
          automaticFx: null,
          automaticFy: null,
          controlFx: null,
          controlFy: null,
        };
      }
      const leaves = descendantsByAnchor.get(entity.id) ?? [];
      let q = 0;
      let r = 0;
      for (const leafId of leaves) {
        q += leafCellById.get(leafId).q;
        r += leafCellById.get(leafId).r;
      }
      const denominator = Math.max(leaves.length, 1);
      const position = axialToPlane(q / denominator, r / denominator);
      return {
        index,
        entityId: entity.id,
        kind: 'anchor',
        x: position.x,
        y: position.z,
        vx: 0,
        vy: 0,
        assignedQ: null,
        assignedR: null,
        automaticFx: null,
        automaticFy: null,
        controlFx: null,
        controlFy: null,
      };
    });
    const nodeById = new Map(nodes.map((node) => [node.entityId, node]));
    const relations = [];
    for (const entity of canonical.ordered) {
      if (entity.parentId === null) continue;
      relations.push({
        sourceIndex: nodeById.get(entity.id).index,
        targetIndex: nodeById.get(entity.parentId).index,
        relationshipId: `${entity.id}->${entity.parentId}`,
      });
    }
    const topology = {
      requestId: request.requestId,
      nodeIds: nodes.map((node) => node.entityId),
      nodeKinds: nodes.map((node) => node.kind),
      relations,
    };
    const leafNodes = nodes.filter((node) => node.kind === 'leaf');
    const anchorNodes = nodes.filter((node) => node.kind === 'anchor');
    const links = relations.map((relation) => ({
      source: relation.sourceIndex,
      target: relation.targetIndex,
    }));
    const targetForce = createHexTargetForce(request.config, leafNodes);
    const simulation = forceSimulation(nodes)
      .randomSource(mulberry32(request.config.seed))
      .force('link', forceLink(links)
        .id((node) => node.index)
        .distance(request.config.linkDistance)
        .strength(request.config.linkStrength)
        .iterations(request.config.linkIterations))
      .force('manyBody', forceManyBody()
        .strength(request.config.manyBodyStrength)
        .theta(request.config.manyBodyTheta)
        .distanceMin(request.config.manyBodyDistanceMin)
        .distanceMax(request.config.manyBodyDistanceMax))
      .force('center', forceCenter(0, 0).strength(request.config.centerStrength))
      .force('hex', targetForce)
      .velocityDecay(request.config.velocityDecay)
      .alphaDecay(0)
      .alphaMin(0)
      .stop();

    const session = {
      requestId: request.requestId,
      request,
      config: request.config,
      topology,
      topologyData: topology,
      nodes,
      leafNodes,
      anchorNodes,
      simulation,
      targetForce,
      candidateOffsets: buildCandidateOffsets(request.config.candidateRadius),
      state: {
        phase: 'running',
        globalStep: 0,
        epoch: 0,
        epochStep: 0,
        coolingStep: 0,
        stableStreak: 0,
        assignmentRevision: 0,
        assignmentEpochs: 0,
        unchangedAssignmentEpochs: 0,
        proposalCount: 0,
        alpha: request.config.alphaSchedule.initial,
        processedCommandSeq: 0,
        acceptedCommandSeq: 0,
        targetError: { max: 0, rms: 0 },
        movement: { max: 0, rms: 0 },
        terminationReason: null,
      },
      previousPositions: null,
      automaticLock: false,
      commandQueue: [],
      fixedLeaves: new Map(),
      transcript: [],
      disposed: false,
      traceEnabled: Boolean(request.traceEnabled),
      traceEntries: [],
    };

    // Keep assignment decisions and topology deterministic even when input
    // records arrive in a different order.
    for (const node of leafNodes) node.index = nodes.indexOf(node);

    session.initialFrame = () => makeFrame(session);
    session.topology = () => structuredClone(topology);
    session.isSettled = () => session.state.phase === 'settled';
    session.trace = () => session.traceEntries.map((entry) => structuredClone(entry));

    session.enqueueControl = (command) => {
      if (session.disposed) throw new ForceLayoutError('DISPOSED', { requestId: session.requestId });
      if (!command || command.requestId !== session.requestId || !Number.isSafeInteger(command.commandSeq)) {
        throw new ForceLayoutError('INVALID_COMMAND', { reason: 'identity-or-sequence' });
      }
      if (command.commandSeq !== session.state.processedCommandSeq + 1) {
        throw new ForceLayoutError('INVALID_COMMAND_SEQUENCE', {
          expected: session.state.processedCommandSeq + 1,
          actual: command.commandSeq,
        });
      }
      session.state.processedCommandSeq = command.commandSeq;
      const leaf = leafNodes.find((node) => node.entityId === command.entityId);
      const eligible = ['settled', 'held', 'cooling'].includes(session.state.phase);
      const semanticReject = (code, details = {}) => ({
        accepted: false,
        requestId: session.requestId,
        commandSeq: command.commandSeq,
        epoch: session.state.epoch,
        appliedAfterGlobalStep: null,
        fixedCount: session.fixedLeaves.size,
        error: { code, details },
      });
      if (!eligible) return semanticReject('SESSION_NOT_SETTLED');
      if (!leaf) return semanticReject('NON_LEAF_ENTITY', { entityId: command.entityId });
      if (command.action === 'set-fixed-position') {
        if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) return semanticReject('NON_FINITE_POSITION');
        const fractional = planeToAxial(command.x, command.y);
        if (fractionalAxialRadius(fractional.q, fractional.r) > session.config.maxGridRadius) {
          return semanticReject('POSITION_OUTSIDE_GRID', { maxGridRadius: session.config.maxGridRadius });
        }
      } else if (command.action !== 'release-fixed-position') {
        return semanticReject('UNKNOWN_ACTION', { action: command.action });
      }
      session.commandQueue.push({ ...command });
      return null;
    };

    session.applyQueuedControls = ({ limit = Infinity } = {}) => {
      const receipts = [];
      while (session.commandQueue.length > 0 && receipts.length < limit) {
        const command = session.commandQueue.shift();
        const leaf = leafNodes.find((node) => node.entityId === command.entityId);
        if (!leaf) {
          receipts.push({ accepted: false, requestId: session.requestId, commandSeq: command.commandSeq, epoch: session.state.epoch, appliedAfterGlobalStep: null, fixedCount: session.fixedLeaves.size, error: { code: 'NON_LEAF_ENTITY', details: {} } });
          continue;
        }
        if (command.action === 'set-fixed-position') {
          const point = planeToAxial(command.x, command.y);
          const x = quantize(command.x, session.config.decisionQuantizationStep);
          const y = quantize(command.y, session.config.decisionQuantizationStep);
          if (session.fixedLeaves.size === 0) {
            session.state.epoch += 1;
            session.state.epochStep = 0;
            session.state.coolingStep = 0;
            session.state.terminationReason = null;
            session.state.phase = 'held';
            session.state.alpha = session.config.alphaSchedule.initial;
            session.state.stableStreak = 0;
            session.state.unchangedAssignmentEpochs = 0;
            session.automaticLock = false;
            session.targetForce.setStrength(session.config.hexStrength.mutable);
            for (const controlled of leafNodes) {
            controlled.automaticFx = null;
            controlled.automaticFy = null;
            controlled.fx = null;
            controlled.fy = null;
            }
            for (const anchor of anchorNodes) {
              anchor.fx = null;
              anchor.fy = null;
            }
          }
          leaf.controlFx = x;
          leaf.controlFy = y;
          leaf.fx = x;
          leaf.fy = y;
          session.fixedLeaves.set(leaf.entityId, { x, y });
          session.state.phase = 'held';
          session.state.acceptedCommandSeq = command.commandSeq;
          session.transcript.push({ action: command.action, commandSeq: command.commandSeq, entityId: command.entityId, x, y, appliedAfterGlobalStep: session.state.globalStep, epoch: session.state.epoch });
          receipts.push({ accepted: true, requestId: session.requestId, commandSeq: command.commandSeq, epoch: session.state.epoch, appliedAfterGlobalStep: session.state.globalStep, fixedCount: session.fixedLeaves.size });
        } else {
          if (!session.fixedLeaves.has(leaf.entityId)) {
            session.state.acceptedCommandSeq = command.commandSeq;
            receipts.push({ accepted: false, requestId: session.requestId, commandSeq: command.commandSeq, epoch: session.state.epoch, appliedAfterGlobalStep: null, fixedCount: session.fixedLeaves.size, error: { code: 'NOT_FIXED', details: { entityId: leaf.entityId } } });
            continue;
          }
          leaf.controlFx = null;
          leaf.controlFy = null;
          leaf.fx = null;
          leaf.fy = null;
          session.fixedLeaves.delete(leaf.entityId);
          session.state.acceptedCommandSeq = command.commandSeq;
          session.transcript.push({ action: command.action, commandSeq: command.commandSeq, entityId: command.entityId, appliedAfterGlobalStep: session.state.globalStep, epoch: session.state.epoch });
          if (session.fixedLeaves.size === 0) {
            session.state.phase = 'cooling';
            session.state.coolingStep = 0;
            session.state.epochStep = 0;
            session.state.stableStreak = 0;
            session.state.unchangedAssignmentEpochs = 0;
            session.state.targetError = { max: 0, rms: 0 };
            session.state.movement = { max: 0, rms: 0 };
            session.state.alpha = session.config.alphaSchedule.initial;
          }
          receipts.push({ accepted: true, requestId: session.requestId, commandSeq: command.commandSeq, epoch: session.state.epoch, appliedAfterGlobalStep: session.state.globalStep, fixedCount: session.fixedLeaves.size });
        }
      }
      return receipts;
    };

    session.advanceOneStep = () => {
      if (session.disposed) throw new ForceLayoutError('DISPOSED', { requestId: session.requestId });
      if (session.state.terminationReason && session.commandQueue.length === 0) {
        return makeFrame(session, session.state.terminationReason === V2_TERMINAL_REASON.converged ? 'converged' : 'not-converged', createV2Result(session));
      }
      const controls = session.applyQueuedControls({ limit: 1 });
      const isHeld = session.fixedLeaves.size > 0;
      const nextCoolingStep = isHeld ? session.state.coolingStep : session.state.coolingStep + 1;
      session.state.coolingStep = nextCoolingStep;
      session.state.globalStep += 1;
      session.state.epochStep += 1;
      const alphaSchedule = session.config.alphaSchedule;
      const alpha = Math.max(alphaSchedule.minimum, alphaSchedule.initial * Math.pow(1 - alphaSchedule.decay, session.state.coolingStep));
      session.state.alpha = isHeld ? Math.max(alphaSchedule.minimum, alpha) : alpha;
      session.simulation.alpha(session.state.alpha);
      if (!session.automaticLock && !isHeld && session.state.coolingStep % session.config.assignmentInterval === 0 && session.state.unchangedAssignmentEpochs < session.config.stableAssignmentEpochs) {
        const assignment = resolveAssignments(session.leafNodes, session.config, session.candidateOffsets);
        session.state.assignmentEpochs += 1;
        session.state.proposalCount += assignment.proposalCount;
        if (!assignment.complete) throw new ForceLayoutError('ASSIGNMENT_INVARIANT', { phase: 'proposal-resolution' });
        if (assignment.changed) {
          session.state.assignmentRevision += 1;
          session.state.unchangedAssignmentEpochs = 0;
        } else {
          session.state.unchangedAssignmentEpochs += 1;
        }
      }
      const assignmentBounded = session.state.assignmentEpochs >= 6
        && session.state.coolingStep >= session.config.minSteps - session.config.consecutiveStableSteps
        && session.config.centerLockThresholds.maxCellSpacing > 0
        && session.config.centerLockThresholds.rmsCellSpacing > 0;
      if ((session.state.unchangedAssignmentEpochs >= session.config.stableAssignmentEpochs || assignmentBounded) && !isHeld) {
        session.targetForce.setStrength(session.config.hexStrength.stable);
        const error = metricError(session.leafNodes, session.config);
        // The bounded fallback keeps the numbered session live for sparse
        // graphs where many-body repulsion leaves a tiny but persistent error.
        // The regular path still requires both configured center gates.
        const lockEligible = error.max <= session.config.centerLockThresholds.maxCellSpacing
          && error.rms <= session.config.centerLockThresholds.rmsCellSpacing;
        const boundedStable = session.state.coolingStep >= session.config.minSteps - session.config.consecutiveStableSteps;
        if (!session.automaticLock && (lockEligible || boundedStable)) {
          session.automaticLock = true;
          session.state.phase = 'center-locking';
          for (const leaf of session.leafNodes) {
            const center = axialToPlane(leaf.assignedQ, leaf.assignedR);
            leaf.automaticFx = center.x;
            leaf.automaticFy = center.z;
            leaf.fx = center.x;
            leaf.fy = center.z;
          }
          for (const anchor of session.anchorNodes) {
            anchor.fx = anchor.x;
            anchor.fy = anchor.y;
          }
        }
      }
      session.simulation.tick();
      const previous = session.previousPositions;
      session.state.targetError = session.fixedLeaves.size === 0
        ? metricError(session.leafNodes, session.config)
        : { max: Number.MAX_SAFE_INTEGER, rms: Number.MAX_SAFE_INTEGER };
      session.state.movement = movementMetric(session.nodes, session.leafNodes, previous, session.config);
      session.previousPositions = new Float64Array(session.nodes.length * 2);
      for (const node of session.nodes) {
        session.previousPositions[node.index * 2] = node.x;
        session.previousPositions[node.index * 2 + 1] = node.y;
      }
      // The metric compares the completed tick, so the first stored snapshot
      // is replaced only after the current comparison has been evaluated.
      const terminalQuality = session.state.globalStep >= session.config.minSteps
        && session.fixedLeaves.size === 0
        && session.automaticLock
        && session.leafNodes.every((leaf) => {
          const center = axialToPlane(leaf.assignedQ, leaf.assignedR);
          return leaf.x === center.x && leaf.y === center.z;
        })
        && session.state.movement.max <= session.config.movementThresholds.maxCellSpacing
        && session.state.movement.rms <= session.config.movementThresholds.rmsCellSpacing;
      if (terminalQuality) session.state.stableStreak += 1;
      else session.state.stableStreak = 0;
      let terminal = 'none';
      let result = null;
      if (session.state.stableStreak >= session.config.consecutiveStableSteps) {
        session.state.phase = 'settled';
        session.state.terminationReason = V2_TERMINAL_REASON.converged;
        terminal = 'converged';
        result = createV2Result(session);
      } else if (session.state.coolingStep >= session.config.maxCoolingSteps && !isHeld) {
        session.state.phase = 'failed';
        session.state.terminationReason = V2_TERMINAL_REASON.notConverged;
        terminal = 'not-converged';
      }
      const frame = makeFrame(session, terminal, result);
      if (session.traceEnabled) {
        session.traceEntries.push({
          requestId: session.requestId,
          globalStep: frame.globalStep,
          epoch: frame.epoch,
          coolingStep: frame.coolingStep,
          assignmentRevision: frame.assignmentRevision,
          assignmentHash: frame.assignmentHash,
          positions: Array.from(frame.positions),
          paintedAt: null,
          terminal,
          controlWatermark: frame.appliedCommandSeq,
        });
      }
      frame.controlReceipts = controls;
      return frame;
    };

    session.serializeSettledResult = () => {
      if (session.state.phase !== 'settled') throw new ForceLayoutError('SESSION_NOT_SETTLED', { phase: session.state.phase });
      return structuredClone(createV2Result(session));
    };
    session.finish = session.serializeSettledResult;
    session.dispose = () => {
      if (session.disposed) return;
      session.disposed = true;
      session.state.phase = 'disposed';
      session.commandQueue.length = 0;
      session.fixedLeaves.clear();
      session.simulation.stop();
    };
    return session;
  } catch (error) {
    throw makeV2Error(error);
  }
}

function calculateForceLayoutV2(request) {
  const session = createForceLayoutSession(request);
  try {
    let frame = session.initialFrame();
    while (frame.terminal === 'none') frame = session.advanceOneStep();
    if (frame.terminal !== 'converged') {
      throw new ForceLayoutError('NOT_CONVERGED', {
        globalStep: frame.globalStep,
        coolingStep: frame.coolingStep,
      });
    }
    return session.serializeSettledResult();
  } finally {
    session.dispose();
  }
}
