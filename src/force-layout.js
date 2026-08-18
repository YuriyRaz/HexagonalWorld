import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force';
import { normalizeHierarchy, HierarchyError } from './data.js';
import {
  axialToPlane,
  axialToPlaneInto,
  planeToAxial,
  planeToAxialInto,
  fractionalAxialRadius,
  ADJACENT_CELL_SPACING,
  quantize,
  axialDistance,
} from './hex.js';

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

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
  collideStrength: 1.0,
  collideRadiusMultiplier: 1.0,
});

export const FORCE_LAYOUT_VERSION_2_CONFIG = FORCE_LAYOUT_CONFIG_V2;
// Kept as a thin export alias for existing importers; all calculations use V2.
export const FORCE_LAYOUT_CONFIG = FORCE_LAYOUT_CONFIG_V2;

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
      node.vx += (node.centerX - node.x) * strength * alpha;
      node.vy += (node.centerY - node.y) * strength * alpha;
    }
  };
  force.initialize = (nextNodes) => { nodes = nextNodes; };
  force.setStrength = (nextStrength) => { strength = nextStrength; };
  force.nodes = () => nodes;
  return force;
}

export function calculateAssignmentHash(leafIds, leafCells) {
  let hash = 2166136261;
  for (let index = 0; index < leafIds.length; index += 1) {
    hash ^= leafIds[index].length;
    hash = Math.imul(hash, 16777619);
    hash ^= leafCells[index * 2];
    hash = Math.imul(hash, 16777619);
    hash ^= leafCells[index * 2 + 1];
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

function calculateQuantizedCost(node, q, r, config, center) {
  const predictedX = node.x + node.vx * config.predictionLookahead;
  const predictedY = node.y + node.vy * config.predictionLookahead;
  axialToPlaneInto(q, r, center);
  const dx = predictedX - center.x;
  const dy = predictedY - center.z;
  const distance = quantize(
    (dx * dx + dy * dy) / (ADJACENT_CELL_SPACING * ADJACENT_CELL_SPACING),
    config.decisionQuantizationStep,
  );
  const move = q === node.assignedQ && r === node.assignedR ? 0 : config.movePenalty;
  return quantize(distance + move, config.decisionQuantizationStep);
}

function resolveAssignments(leafNodes, config, candidateOffsets, storage) {
  const { candidateQ, candidateR, costs, candidateCounts, nextCandidate, queue,
    holderByCell, previousQ, previousR, nextQ, nextR, candidateCapacity,
    fractional, center } = storage;
  candidateCounts.fill(0);
  nextCandidate.fill(0);
  holderByCell.fill(-1);
  for (let leafIndex = 0; leafIndex < leafNodes.length; leafIndex += 1) {
    const node = leafNodes[leafIndex];
    previousQ[leafIndex] = node.assignedQ;
    previousR[leafIndex] = node.assignedR;
    const predicted = planeToAxialInto(
      node.x + node.vx * config.predictionLookahead,
      node.y + node.vy * config.predictionLookahead,
      fractional,
    );
    const predictedQ = quantize(predicted.q, config.decisionQuantizationStep);
    const predictedR = quantize(predicted.r, config.decisionQuantizationStep);
    // Search around the current assignment. Using the predicted world position
    // as the lattice origin lets mobile anchors drag assignments indefinitely.
    const originQ = node.assignedQ;
    const originR = node.assignedR;
    const start = leafIndex * candidateCapacity;
    let count = 0;
    for (const offset of candidateOffsets) {
      const q = originQ + offset.q;
      const r = originR + offset.r;
      if (fractionalAxialRadius(q, r) > config.maxGridRadius) continue;
      const cost = calculateQuantizedCost(node, q, r, config, center);
      let insert = count;
      while (insert > 0) {
        const previousIndex = start + insert - 1;
        if (costs[previousIndex] < cost) break;
        if (costs[previousIndex] === cost
          && (candidateQ[previousIndex] < q
            || (candidateQ[previousIndex] === q && candidateR[previousIndex] <= r))) break;
        candidateQ[previousIndex + 1] = candidateQ[previousIndex];
        candidateR[previousIndex + 1] = candidateR[previousIndex];
        costs[previousIndex + 1] = costs[previousIndex];
        insert -= 1;
      }
      candidateQ[start + insert] = q;
      candidateR[start + insert] = r;
      costs[start + insert] = cost;
      count += 1;
    }
    let hasPrevious = false;
    for (let index = 0; index < count; index += 1) {
      if (candidateQ[start + index] === node.assignedQ && candidateR[start + index] === node.assignedR) {
        hasPrevious = true;
        break;
      }
    }
    if (!hasPrevious) {
      const q = node.assignedQ;
      const r = node.assignedR;
      const cost = calculateQuantizedCost(node, q, r, config, center);
      let insert = count;
      while (insert > 0) {
        const previousIndex = start + insert - 1;
        if (costs[previousIndex] < cost) break;
        if (costs[previousIndex] === cost
          && (candidateQ[previousIndex] < q
            || (candidateQ[previousIndex] === q && candidateR[previousIndex] <= r))) break;
        candidateQ[previousIndex + 1] = candidateQ[previousIndex];
        candidateR[previousIndex + 1] = candidateR[previousIndex];
        costs[previousIndex + 1] = costs[previousIndex];
        insert -= 1;
      }
      candidateQ[start + insert] = q;
      candidateR[start + insert] = r;
      costs[start + insert] = cost;
      count += 1;
    }
    candidateCounts[leafIndex] = count;
    queue[leafIndex] = leafIndex;
  }

  const cellWidth = config.maxGridRadius * 2 + 1;
  let queueHead = 0;
  let queueTail = leafNodes.length;
  let proposalCount = 0;
  while (queueHead < queueTail) {
    const leafIndex = queue[queueHead];
    queueHead += 1;
    const candidateIndex = nextCandidate[leafIndex];
    if (candidateIndex >= candidateCounts[leafIndex]) continue;
    nextCandidate[leafIndex] += 1;
    proposalCount += 1;
    const flatIndex = leafIndex * candidateCapacity + candidateIndex;
    const q = candidateQ[flatIndex];
    const r = candidateR[flatIndex];
    const cellIndex = (q + config.maxGridRadius) * cellWidth + r + config.maxGridRadius;
    const incumbent = holderByCell[cellIndex];
    let challengerWins = incumbent === -1;
    if (!challengerWins) {
      let incumbentCost = Infinity;
      const incumbentStart = incumbent * candidateCapacity;
      for (let index = 0; index < candidateCounts[incumbent]; index += 1) {
        if (candidateQ[incumbentStart + index] === q && candidateR[incumbentStart + index] === r) {
          incumbentCost = costs[incumbentStart + index];
          break;
        }
      }
      const challengerCost = costs[flatIndex];
      const challengerOwned = previousQ[leafIndex] === q && previousR[leafIndex] === r;
      const incumbentOwned = previousQ[incumbent] === q && previousR[incumbent] === r;
      challengerWins = challengerOwned !== incumbentOwned
        ? challengerOwned
        : challengerCost < incumbentCost
          || (challengerCost === incumbentCost && leafIndex < incumbent);
    }
    if (challengerWins) {
      holderByCell[cellIndex] = leafIndex;
      nextQ[leafIndex] = q;
      nextR[leafIndex] = r;
      if (incumbent !== -1) queue[queueTail++] = incumbent;
    } else {
      queue[queueTail++] = leafIndex;
    }
  }

  let changed = false;
  for (let leafIndex = 0; leafIndex < leafNodes.length; leafIndex += 1) {
    const node = leafNodes[leafIndex];
    if (nextCandidate[leafIndex] === 0) return { changed: false, proposalCount, complete: false };
    if (node.assignedQ !== nextQ[leafIndex] || node.assignedR !== nextR[leafIndex]) changed = true;
    node.assignedQ = nextQ[leafIndex];
    node.assignedR = nextR[leafIndex];
    axialToPlaneInto(node.assignedQ, node.assignedR, center);
    node.centerX = center.x;
    node.centerY = center.z;
  }
  return { changed, proposalCount, complete: true };
}

function metricError(leafNodes, config, output) {
  let max = 0;
  let sumSquares = 0;
  for (const node of leafNodes) {
    const dx = quantize((node.x - node.centerX) / ADJACENT_CELL_SPACING, config.decisionQuantizationStep);
    const dy = quantize((node.y - node.centerY) / ADJACENT_CELL_SPACING, config.decisionQuantizationStep);
    const value = Math.hypot(dx, dy);
    max = Math.max(max, value);
    sumSquares += value * value;
  }
  output.max = quantize(max, config.decisionQuantizationStep);
  output.rms = quantize(Math.sqrt(sumSquares / Math.max(leafNodes.length, 1)), config.decisionQuantizationStep);
  return output;
}

function movementMetric(nodes, leafNodes, previousPositions, config, output) {
  let previousNodeX = 0;
  let previousNodeY = 0;
  let currentNodeX = 0;
  let currentNodeY = 0;
  for (const node of nodes) {
    const index = node.index * 2;
    previousNodeX += previousPositions[index];
    previousNodeY += previousPositions[index + 1];
    currentNodeX += node.x;
    currentNodeY += node.y;
  }
  const nodeCount = Math.max(nodes.length, 1);
  const translationX = (currentNodeX - previousNodeX) / nodeCount;
  const translationY = (currentNodeY - previousNodeY) / nodeCount;
  let max = 0;
  let sumSquares = 0;
  for (const node of leafNodes) {
    const index = node.index * 2;
    const dx = quantize((node.x - previousPositions[index] - translationX) / ADJACENT_CELL_SPACING, config.decisionQuantizationStep);
    const dy = quantize((node.y - previousPositions[index + 1] - translationY) / ADJACENT_CELL_SPACING, config.decisionQuantizationStep);
    const value = Math.hypot(dx, dy);
    max = Math.max(max, value);
    sumSquares += value * value;
  }
  output.max = quantize(max, config.decisionQuantizationStep);
  output.rms = quantize(Math.sqrt(sumSquares / Math.max(leafNodes.length, 1)), config.decisionQuantizationStep);
  return output;
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
  const leafCells = {};
  const towerPositions = {};
  for (const placement of placements) {
    leafCells[placement.entityId] = { q: placement.q, r: placement.r };
    const center = axialToPlane(placement.q, placement.r);
    towerPositions[placement.entityId] = { x: center.x, z: center.z };
  }
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
    leafCells,
    towerPositions,
    springs,
    gridRadius,
    stats: { occupiedCount: placements.length, boundaryGaps: [] },
    diagnostics,
  };
}

function makeFrame(session, terminal = 'none', result = null) {
  const { requestId, nodes, state } = session;
  const { positions, leafCells: leafCellsArray } = session.frameBuffers;
  if (positions.buffer.byteLength === 0 || leafCellsArray.buffer.byteLength === 0) {
    throw new ForceLayoutError('FRAME_BUFFERS_UNAVAILABLE', { requestId });
  }

  for (const node of nodes) {
    positions[node.index * 2] = Math.fround(node.x);
    positions[node.index * 2 + 1] = Math.fround(node.y);
  }
  for (let i = 0; i < session.leafNodes.length; i += 1) {
    const node = session.leafNodes[i];
    leafCellsArray[i * 2] = node.assignedQ;
    leafCellsArray[i * 2 + 1] = node.assignedR;
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
    leafCells: leafCellsArray,
    terminal,
    result,
  };
}

export function createForceLayoutSession(request) {
  try {
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
          centerX: position.x,
          centerY: position.z,
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
    const collideRadius = ADJACENT_CELL_SPACING * 0.5 * request.config.collideRadiusMultiplier;
    const collisionForce = forceCollide()
      .radius((node) => node.kind === 'leaf' ? collideRadius : 0)
      .strength(request.config.collideStrength)
      .iterations(1);
    const simulation = forceSimulation(nodes)
      .randomSource(mulberry32(request.config.seed))
      .force('link', forceLink(links)
        .id((node) => node.index)
        .distance(request.config.linkDistance)
        .strength(request.config.linkStrength)
        .iterations(request.config.linkIterations))
      .force('manyBody', forceManyBody()
        .strength((node) => node.kind === 'leaf' ? 0 : request.config.manyBodyStrength)
        .theta(request.config.manyBodyTheta)
        .distanceMin(request.config.manyBodyDistanceMin)
        .distanceMax(request.config.manyBodyDistanceMax))
      .force('center', forceCenter(0, 0).strength(request.config.centerStrength))
      .force('hex', targetForce)
      .force('collide', collisionForce)
      .velocityDecay(request.config.velocityDecay)
      .alphaDecay(0)
      .alphaMin(0)
      .stop();

    const candidateOffsets = buildCandidateOffsets(request.config.candidateRadius);
    const candidateCapacity = candidateOffsets.length + 1;
    const leafCount = leafNodes.length;
    const assignmentStorage = {
      candidateCapacity,
      candidateQ: new Int32Array(leafCount * candidateCapacity),
      candidateR: new Int32Array(leafCount * candidateCapacity),
      costs: new Float64Array(leafCount * candidateCapacity),
      candidateCounts: new Uint8Array(leafCount),
      nextCandidate: new Uint8Array(leafCount),
      queue: new Int32Array(leafCount * (candidateCapacity + 1)),
      holderByCell: new Int32Array((request.config.maxGridRadius * 2 + 1) ** 2),
      previousQ: new Int32Array(leafCount),
      previousR: new Int32Array(leafCount),
      nextQ: new Int32Array(leafCount),
      nextR: new Int32Array(leafCount),
      fractional: { q: 0, r: 0 },
      center: { x: 0, z: 0 },
    };
    const previousPositions = new Float64Array(nodes.length * 2);
    for (const node of nodes) {
      previousPositions[node.index * 2] = node.x;
      previousPositions[node.index * 2 + 1] = node.y;
    }
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
      candidateOffsets,
      assignmentStorage,
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
      previousPositions,
      frameBuffers: {
        positions: new Float32Array(nodes.length * 2),
        leafCells: new Int16Array(leafNodes.length * 2),
      },
      automaticLock: false,
      assignmentFrozen: false,
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
    session.reclaimFrameBuffers = (positionBuffer, cellBuffer) => {
      const expectedPositionBytes = nodes.length * 2 * Float32Array.BYTES_PER_ELEMENT;
      const expectedCellBytes = leafNodes.length * 2 * Int16Array.BYTES_PER_ELEMENT;
      if (!(positionBuffer instanceof ArrayBuffer) || positionBuffer.byteLength !== expectedPositionBytes
        || !(cellBuffer instanceof ArrayBuffer) || cellBuffer.byteLength !== expectedCellBytes) {
        throw new ForceLayoutError('INVALID_FRAME_RECEIPT', { requestId: session.requestId });
      }
      session.frameBuffers.positions = new Float32Array(positionBuffer);
      session.frameBuffers.leafCells = new Int16Array(cellBuffer);
    };
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
        const x = quantize(command.x, session.config.decisionQuantizationStep);
        const y = quantize(command.y, session.config.decisionQuantizationStep);
        const fractional = planeToAxial(x, y);
        const q = quantize(fractional.q, session.config.decisionQuantizationStep);
        const r = quantize(fractional.r, session.config.decisionQuantizationStep);
        if (fractionalAxialRadius(q, r) > session.config.maxGridRadius) {
          return semanticReject('POSITION_OUTSIDE_GRID', { maxGridRadius: session.config.maxGridRadius });
        }
        session.commandQueue.push({ ...command, x, y });
      } else if (command.action !== 'release-fixed-position') {
        return semanticReject('UNKNOWN_ACTION', { action: command.action });
      } else if (!session.fixedLeaves.has(command.entityId)) {
        return semanticReject('NOT_FIXED', { entityId: command.entityId });
      } else {
        session.commandQueue.push({ ...command });
      }
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
          const x = command.x;
          const y = command.y;
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
            session.assignmentFrozen = false;
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
            session.state.targetError.max = 0;
            session.state.targetError.rms = 0;
            session.state.movement.max = 0;
            session.state.movement.rms = 0;
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
      if (!session.assignmentFrozen && !isHeld && session.state.coolingStep % session.config.assignmentInterval === 0) {
        const assignment = resolveAssignments(
          session.leafNodes,
          session.config,
          session.candidateOffsets,
          session.assignmentStorage,
        );
        session.state.assignmentEpochs += 1;
        session.state.proposalCount += assignment.proposalCount;
        if (!assignment.complete) throw new ForceLayoutError('ASSIGNMENT_INVARIANT', { phase: 'proposal-resolution' });
        if (assignment.changed) {
          session.state.assignmentRevision += 1;
          session.state.unchangedAssignmentEpochs = 0;
        } else {
          session.state.unchangedAssignmentEpochs += 1;
        }
        if (session.state.unchangedAssignmentEpochs >= session.config.stableAssignmentEpochs
          || session.state.coolingStep >= session.config.maxCoolingSteps - 32) {
          session.assignmentFrozen = true;
          session.targetForce.setStrength(session.config.hexStrength.stable);
        }
      }
      if (session.assignmentFrozen && !isHeld) {
        const error = metricError(session.leafNodes, session.config, session.state.targetError);
        const lockEligible = error.max <= session.config.centerLockThresholds.maxCellSpacing
          && error.rms <= session.config.centerLockThresholds.rmsCellSpacing;
        if (!session.automaticLock && (session.state.unchangedAssignmentEpochs >= session.config.stableAssignmentEpochs || session.state.coolingStep >= session.config.maxCoolingSteps - 32)) {
          session.automaticLock = true;
          session.state.phase = 'center-locking';
          for (const leaf of session.leafNodes) {
            leaf.automaticFx = leaf.centerX;
            leaf.automaticFy = leaf.centerY;
            leaf.fx = leaf.centerX;
            leaf.fy = leaf.centerY;
          }
        }
      }
      session.simulation.tick();
      const previous = session.previousPositions;
      if (session.fixedLeaves.size === 0) {
        metricError(session.leafNodes, session.config, session.state.targetError);
      } else {
        session.state.targetError.max = Number.MAX_SAFE_INTEGER;
        session.state.targetError.rms = Number.MAX_SAFE_INTEGER;
      }
      movementMetric(session.nodes, session.leafNodes, previous, session.config, session.state.movement);
      for (const node of session.nodes) {
        session.previousPositions[node.index * 2] = node.x;
        session.previousPositions[node.index * 2 + 1] = node.y;
      }
      // The metric compares the completed tick, so the first stored snapshot
      // is replaced only after the current comparison has been evaluated.
      const terminalQuality = session.state.coolingStep >= session.config.minSteps
        && session.fixedLeaves.size === 0
        && session.assignmentFrozen
        && session.automaticLock
        && session.leafNodes.every((leaf) => {
          return leaf.x === leaf.centerX && leaf.y === leaf.centerY;
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

export function calculateForceLayout(request) {
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
