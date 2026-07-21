import { normalizeHierarchy } from './data.js';
import {
  HEX_DIRECTIONS,
  addAxial,
  axialDistance,
  axialKey,
  getCompactCells,
  getHexRing,
  getHexSpiral,
  roundAxial,
  scaleAxial,
  subtractAxial,
} from './hex.js';

export const layoutAlgorithms = {
  flat: {
    label: 'Плоские кольца',
    note: 'Группы листьев распределены равномерно без учета корневых разделов.',
    isAsync: false,
    showSprings: false,
    occupiedOpacity: 1,
  },
  nested: {
    label: 'Вложенные кольца',
    note: 'Группы листьев собраны по корневым разделам с единым шагом.',
    isAsync: false,
    showSprings: false,
    occupiedOpacity: 1,
  },
  packed: {
    label: 'Иерархическая упаковка',
    note: 'Один свободный гекс разделяет группы листьев, два — корневые разделы.',
    isAsync: false,
    showSprings: false,
    occupiedOpacity: 1,
  },
  'force-anchors': {
    label: 'Силовая раскладка',
    note: 'Использует виртуальные якоря и пружины для группировки. Башни полупрозрачные (50%), пружины отображаются.',
    isAsync: true,
    showSprings: true,
    occupiedOpacity: 0.5,
  }
};

function compareEntities(first, second) {
  if (first.order < second.order) return -1;
  if (first.order > second.order) return 1;
  const firstId = first.id ?? first.entityId;
  const secondId = second.id ?? second.entityId;
  if (firstId < secondId) return -1;
  if (firstId > secondId) return 1;
  return 0;
}

function getDistributedCenters(count, spacing) {
  if (count === 0) return [];
  const cells = [{ q: 0, r: 0 }];
  let remaining = count - 1;

  for (let radius = 1; remaining > 0; radius += 1) {
    const ring = getHexRing(radius);
    const cellsOnRing = Math.min(remaining, ring.length);
    for (let index = 0; index < cellsOnRing; index += 1) {
      cells.push(scaleAxial(ring[Math.floor(index * ring.length / cellsOnRing)], spacing));
    }
    remaining -= cellsOnRing;
  }

  return cells;
}

function getRadius(cells) {
  return cells.reduce((largest, cell) => Math.max(largest, axialDistance(cell)), 0);
}

function getRange(center, radius) {
  const cells = [];
  for (let dq = -radius; dq <= radius; dq += 1) {
    const minR = Math.max(-radius, -dq - radius);
    const maxR = Math.min(radius, -dq + radius);
    for (let dr = minR; dr <= maxR; dr += 1) {
      cells.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return cells;
}

function packItems(items, gap) {
  const sorted = [...items].sort((first, second) => (
    second.cells.length - first.cells.length || compareEntities(first, second)
  ));
  const blocked = new Set();
  const packed = [];

  sorted.forEach((item, itemIndex) => {
    const candidates = getHexSpiral();
    let origin = { q: 0, r: 0 };
    let attempts = 0;

    if (itemIndex > 0) {
      do {
        origin = candidates.next().value;
        attempts += 1;
        if (attempts > 100000) throw new Error('Unable to place hierarchy group on the grid.');
      } while (item.cells.some((cell) => blocked.has(axialKey(addAxial(cell, origin)))));
    }

    const cells = item.cells.map((cell) => addAxial(cell, origin));
    for (const cell of cells) {
      for (const blockedCell of getRange(cell, gap)) blocked.add(axialKey(blockedCell));
    }
    packed.push({ ...item, origin, cells });
  });

  return packed.sort(compareEntities);
}

function centerCells(cells) {
  let q = 0;
  let r = 0;
  for (const cell of cells) {
    q += cell.q;
    r += cell.r;
  }
  return roundAxial(q / cells.length, r / cells.length);
}

function createLeafGroup(entity, leaves) {
  const cells = getCompactCells(leaves.length);
  return {
    id: entity.id,
    order: entity.order,
    leaves,
    cells,
    radius: getRadius(cells),
  };
}

function createHierarchyGroups(entities, analysis) {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const leavesByGroupId = new Map();
  const rootIdByGroupId = new Map();

  for (const leafId of analysis.leafIds) {
    const leaf = entityById.get(leafId);
    const groupId = leaf.parentId ?? leaf.id;
    if (!leavesByGroupId.has(groupId)) leavesByGroupId.set(groupId, []);
    leavesByGroupId.get(groupId).push(leaf);

    const ancestors = analysis.ancestorIdsByEntityId.get(leafId);
    rootIdByGroupId.set(groupId, ancestors.at(-1) ?? leafId);
  }

  const groups = [...leavesByGroupId].map(([groupId, leaves]) => (
    createLeafGroup(entityById.get(groupId), leaves)
  )).sort(compareEntities);
  const partitionsByRootId = new Map();

  for (const group of groups) {
    const rootId = rootIdByGroupId.get(group.id);
    if (!partitionsByRootId.has(rootId)) {
      const root = entityById.get(rootId);
      partitionsByRootId.set(rootId, { id: root.id, order: root.order, groups: [] });
    }
    partitionsByRootId.get(rootId).groups.push(group);
  }

  return {
    groups,
    partitions: [...partitionsByRootId.values()].sort(compareEntities),
  };
}

function createPlacements(group, cells, offset = { q: 0, r: 0 }) {
  return group.leaves.map((leaf, index) => ({
    entityId: leaf.id,
    q: cells[index].q + offset.q,
    r: cells[index].r + offset.r,
    order: leaf.order,
  }));
}

function layoutFlat(groups) {
  const largestRadius = Math.max(...groups.map((group) => group.radius));
  const centers = getDistributedCenters(groups.length, Math.max(6, largestRadius * 2 + 2));
  return groups.flatMap((group, index) => {
    const cells = group.cells.map((cell) => addAxial(cell, centers[index]));
    return createPlacements(group, cells);
  });
}

function buildNestedPartitions(partitions, packed) {
  return partitions.map((partition) => {
    let placedGroups;

    if (packed) {
      placedGroups = packItems(partition.groups, 1);
    } else {
      const largestRadius = Math.max(...partition.groups.map((group) => group.radius));
      const centers = getDistributedCenters(
        partition.groups.length,
        Math.max(6, largestRadius * 2 + 2),
      );
      placedGroups = partition.groups.map((group, index) => ({
        ...group,
        origin: centers[index],
        cells: group.cells.map((cell) => addAxial(cell, centers[index])),
      }));
    }

    const center = centerCells(placedGroups.flatMap((group) => group.cells));
    const normalizedGroups = placedGroups.map((group) => ({
      ...group,
      origin: subtractAxial(group.origin, center),
      cells: group.cells.map((cell) => subtractAxial(cell, center)),
    }));

    return {
      ...partition,
      groups: normalizedGroups,
      cells: normalizedGroups.flatMap((group) => group.cells),
    };
  });
}

function layoutNested(partitions, packed) {
  const nestedPartitions = buildNestedPartitions(partitions, packed);
  let placedPartitions;

  if (packed) {
    placedPartitions = packItems(nestedPartitions, 2);
  } else {
    const largestRadius = Math.max(...nestedPartitions.map((partition) => (
      getRadius(partition.cells)
    )));
    const centers = getDistributedCenters(
      nestedPartitions.length,
      largestRadius * 2 + 4,
    );
    placedPartitions = nestedPartitions.map((partition, index) => ({
      ...partition,
      origin: centers[index],
    }));
  }

  return placedPartitions.flatMap((partition) => partition.groups.flatMap((group) => {
    const cells = group.cells.map((cell) => addAxial(cell, partition.origin));
    return createPlacements(group, cells);
  }));
}

function nearestGroupDistances(groups) {
  const groupCount = groups.length;
  const nearest = new Float64Array(groupCount);
  nearest.fill(Infinity);

  // Encoded ownership keeps the wavefront compact while retaining exact source distance.
  const owners = new Map();
  let frontier = [];
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    for (const cell of groups[groupIndex].cells) {
      owners.set(axialKey(cell), groupIndex);
      frontier.push(cell);
    }
  }

  for (let layer = 0; frontier.length > 0; layer += 1) {
    const next = [];
    for (const cell of frontier) {
      const encodedOwner = owners.get(axialKey(cell));
      const groupIndex = encodedOwner % groupCount;

      for (const direction of HEX_DIRECTIONS) {
        const neighbor = { q: cell.q + direction.q, r: cell.r + direction.r };
        const neighborKey = axialKey(neighbor);
        const encodedNeighbor = owners.get(neighborKey);

        if (encodedNeighbor === undefined) {
          owners.set(neighborKey, (layer + 1) * groupCount + groupIndex);
          next.push(neighbor);
          continue;
        }

        const otherGroupIndex = encodedNeighbor % groupCount;
        if (otherGroupIndex === groupIndex) continue;
        const otherDistance = Math.floor(encodedNeighbor / groupCount);
        const candidate = layer + otherDistance + 1;
        if (candidate < nearest[groupIndex]) nearest[groupIndex] = candidate;
        if (candidate < nearest[otherGroupIndex]) nearest[otherGroupIndex] = candidate;
      }
    }

    const provenDistance = layer * 2 + 1;
    if ([...nearest].every((value) => value <= provenDistance)) return nearest;
    frontier = next;
  }

  return nearest;
}

function getBoundaryGaps(entities, analysis, placements) {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const cellsByInternalId = new Map(analysis.internalIds.map((id) => [id, []]));

  for (const placement of placements) {
    const cell = { q: placement.q, r: placement.r };
    for (const ancestorId of analysis.ancestorIdsByEntityId.get(placement.entityId)) {
      cellsByInternalId.get(ancestorId).push(cell);
    }
  }

  const groupsByDepth = new Map();
  for (const internalId of analysis.internalIds) {
    const entity = entityById.get(internalId);
    const depth = analysis.depthByEntityId.get(internalId);
    if (!groupsByDepth.has(depth)) groupsByDepth.set(depth, []);
    groupsByDepth.get(depth).push({ ...entity, cells: cellsByInternalId.get(internalId) });
  }

  return [...groupsByDepth]
    .sort(([firstDepth], [secondDepth]) => firstDepth - secondDepth)
    .map(([depth, groups]) => {
      const partitions = new Map();
      for (const group of groups) {
        const partitionId = depth === 0 ? null : group.parentId;
        if (!partitions.has(partitionId)) partitions.set(partitionId, []);
        partitions.get(partitionId).push(group);
      }

      const nearestGaps = [];
      for (const partitionGroups of partitions.values()) {
        if (partitionGroups.length < 2) continue;
        for (const nearestDistance of nearestGroupDistances(partitionGroups)) {
          nearestGaps.push(nearestDistance - 1);
        }
      }

      return {
        depth,
        averageNearestGap: nearestGaps.length < 2
          ? null
          : nearestGaps.reduce((sum, gap) => sum + gap, 0) / nearestGaps.length,
      };
    });
}

function unknownMode(mode) {
  const error = new Error(`Unknown layout mode: ${String(mode)}`);
  error.code = 'UNKNOWN_MODE';
  error.details = { mode };
  return error;
}

export function calculateLayout(request) {
  const { requestId, mode, entities: sourceEntities } = request;
  if (!Object.hasOwn(layoutAlgorithms, mode)) throw unknownMode(mode);

  const { entities, analysis } = normalizeHierarchy(sourceEntities);
  const { groups, partitions } = createHierarchyGroups(entities, analysis);
  let placements;

  if (mode === 'flat') placements = layoutFlat(groups);
  else placements = layoutNested(partitions, mode === 'packed');

  placements.sort(compareEntities);
  const publishedPlacements = placements.map(({ entityId, q, r }) => ({ entityId, q, r }));
  const gridRadius = Math.max(
    11,
    publishedPlacements.reduce((largest, cell) => (
      Math.max(largest, axialDistance(cell))
    ), 0) + 3,
  );

  return {
    requestId,
    mode,
    placements: publishedPlacements,
    springs: [],
    gridRadius,
    stats: {
      occupiedCount: publishedPlacements.length,
      boundaryGaps: getBoundaryGaps(entities, analysis, publishedPlacements),
    },
    diagnostics: { kind: 'legacy', iterations: 0, converged: true },
  };
}
