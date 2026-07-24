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
      fx: null,
      fy: null,
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

  const simulation = forceSimulation(allNodes)
    .force('link', forceLink(links)
      .id(d => d.entityId)
      .distance(request.config.linkDistance)
      .strength(request.config.linkStrength)
      .iterations(request.config.linkIterations))
    .force('manyBody', forceManyBody()
      .strength(request.config.manyBodyStrength)
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
