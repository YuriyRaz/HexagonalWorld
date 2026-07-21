const REPRESENTATIVE_ROOTS = 5;
const REPRESENTATIVE_INTERNALS_PER_ROOT = 4;
const CURRENT_MAXIMUM_ROOTS = 10;
const CURRENT_MAXIMUM_INTERNALS_PER_ROOT = 8;
const LEAVES_PER_DEPTH_ONE_INTERNAL = 60;

export const REPRESENTATIVE_COUNTS = Object.freeze({
  entityCount: 1225,
  leafCount: 1200,
  internalCount: 25,
  rootCount: 5,
  maxDepth: 2,
  leafAncestorMembershipCount: 2400,
  activeLinkCount: 1220,
});

export const CURRENT_MAXIMUM_COUNTS = Object.freeze({
  entityCount: 4890,
  leafCount: 4800,
  internalCount: 90,
  rootCount: 10,
  maxDepth: 2,
  leafAncestorMembershipCount: 9600,
  activeLinkCount: 4880,
});

export const STRUCTURAL_MAXIMUM_COUNTS = Object.freeze({
  entityCount: 6000,
  leafCount: 4800,
  internalCount: 1200,
  rootCount: 1,
  maxDepth: 16,
  leafAncestorMembershipCount: 76800,
  activeLinkCount: 5999,
});

export const SIX_THOUSAND_LINK_COUNTS = Object.freeze({
  entityCount: 6001,
  leafCount: 4800,
  internalCount: 1201,
  rootCount: 1,
  maxDepth: 2,
  leafAncestorMembershipCount: 9600,
  activeLinkCount: 6000,
});

function padded(value, width) {
  return String(value).padStart(width, '0');
}

function buildDepthTwoForest(prefix, rootCount, internalsPerRoot, leavesPerInternal) {
  const internalCount = rootCount * internalsPerRoot;
  const entities = new Array(rootCount + internalCount + internalCount * leavesPerInternal);
  let entityIndex = 0;
  let internalIndex = 0;
  let leafIndex = 0;

  for (let rootIndex = 0; rootIndex < rootCount; rootIndex += 1) {
    const rootId = `${prefix}-root-${padded(rootIndex, 2)}`;
    entities[entityIndex] = { id: rootId, parentId: null, order: entityIndex };
    entityIndex += 1;

    for (let childIndex = 0; childIndex < internalsPerRoot; childIndex += 1) {
      const internalId = `${prefix}-internal-${padded(internalIndex, 3)}`;
      entities[entityIndex] = { id: internalId, parentId: rootId, order: entityIndex };
      entityIndex += 1;
      internalIndex += 1;

      for (let localLeafIndex = 0; localLeafIndex < leavesPerInternal; localLeafIndex += 1) {
        entities[entityIndex] = {
          id: `${prefix}-leaf-${padded(leafIndex, 4)}`,
          parentId: internalId,
          order: entityIndex,
        };
        entityIndex += 1;
        leafIndex += 1;
      }
    }
  }

  return entities;
}

export function buildSmallValidHierarchy() {
  return [
    { id: 'small-root-a', parentId: null, order: 0 },
    { id: 'small-group-a', parentId: 'small-root-a', order: 1 },
    { id: 'small-leaf-a', parentId: 'small-group-a', order: 2 },
    { id: 'small-leaf-b', parentId: 'small-group-a', order: 3 },
    { id: 'small-root-b', parentId: null, order: 4 },
    { id: 'small-leaf-c', parentId: 'small-root-b', order: 5 },
  ];
}

export function buildArbitraryDepthHierarchy() {
  return [
    { id: 'depth-root', parentId: null, order: 0 },
    { id: 'depth-short-group', parentId: 'depth-root', order: 1 },
    { id: 'depth-short-leaf', parentId: 'depth-short-group', order: 2 },
    { id: 'depth-deep-1', parentId: 'depth-root', order: 3 },
    { id: 'depth-deep-2', parentId: 'depth-deep-1', order: 4 },
    { id: 'depth-deep-3', parentId: 'depth-deep-2', order: 5 },
    { id: 'depth-deep-leaf-a', parentId: 'depth-deep-3', order: 6 },
    { id: 'depth-deep-leaf-b', parentId: 'depth-deep-3', order: 7 },
  ];
}

export function buildGroupingHierarchy() {
  return buildDepthTwoForest('grouping', 2, 2, 4);
}

export function buildSingleRootLeafHierarchy() {
  return [{ id: 'single-root-leaf', parentId: null, order: 0 }];
}

export function buildZeroSpringHierarchy() {
  return [{ id: 'zero-spring-leaf', parentId: null, order: 0 }];
}

export function buildDuplicateIdHierarchy() {
  return [
    { id: 'duplicate', parentId: null, order: 0 },
    { id: 'duplicate', parentId: null, order: 1 },
  ];
}

export function buildMissingParentHierarchy() {
  return [{ id: 'missing-parent-leaf', parentId: 'does-not-exist', order: 0 }];
}

export function buildSelfParentHierarchy() {
  return [{ id: 'self-parent', parentId: 'self-parent', order: 0 }];
}

export function buildCycleHierarchy() {
  return [
    { id: 'cycle-valid-root', parentId: null, order: 0 },
    { id: 'cycle-a', parentId: 'cycle-b', order: 1 },
    { id: 'cycle-b', parentId: 'cycle-a', order: 2 },
  ];
}

export function buildEmptyHierarchy() {
  return [];
}

export function buildRepresentativeHierarchy() {
  return buildDepthTwoForest(
    'representative',
    REPRESENTATIVE_ROOTS,
    REPRESENTATIVE_INTERNALS_PER_ROOT,
    LEAVES_PER_DEPTH_ONE_INTERNAL,
  );
}

export function buildCurrentMaximumHierarchy() {
  return buildDepthTwoForest(
    'current-maximum',
    CURRENT_MAXIMUM_ROOTS,
    CURRENT_MAXIMUM_INTERNALS_PER_ROOT,
    LEAVES_PER_DEPTH_ONE_INTERNAL,
  );
}

export function buildStructuralMaximumHierarchy() {
  const entities = new Array(STRUCTURAL_MAXIMUM_COUNTS.entityCount);
  const rootId = 'structural-internal-00-000';
  entities[0] = { id: rootId, parentId: null, order: 0 };

  let entityIndex = 1;
  let parentIds = [rootId];

  // Counts [1, 79, 80 x 14] keep every internal on a path to a depth-16 leaf.
  for (let depth = 1; depth <= 15; depth += 1) {
    const depthCount = depth === 1 ? 79 : 80;
    const nextParentIds = new Array(depthCount);

    for (let depthIndex = 0; depthIndex < depthCount; depthIndex += 1) {
      const id = `structural-internal-${padded(depth, 2)}-${padded(depthIndex, 3)}`;
      entities[entityIndex] = {
        id,
        parentId: parentIds[depthIndex % parentIds.length],
        order: entityIndex,
      };
      nextParentIds[depthIndex] = id;
      entityIndex += 1;
    }

    parentIds = nextParentIds;
  }

  let leafIndex = 0;
  for (let parentIndex = 0; parentIndex < parentIds.length; parentIndex += 1) {
    for (let localLeafIndex = 0; localLeafIndex < 60; localLeafIndex += 1) {
      entities[entityIndex] = {
        id: `structural-leaf-${padded(leafIndex, 4)}`,
        parentId: parentIds[parentIndex],
        order: entityIndex,
      };
      entityIndex += 1;
      leafIndex += 1;
    }
  }

  return entities;
}

export function buildSixThousandLinkHierarchy() {
  const entities = new Array(SIX_THOUSAND_LINK_COUNTS.entityCount);
  const rootId = 'link-rejection-root';
  entities[0] = { id: rootId, parentId: null, order: 0 };

  let entityIndex = 1;
  let leafIndex = 0;
  for (let internalIndex = 0; internalIndex < 1200; internalIndex += 1) {
    const internalId = `link-rejection-internal-${padded(internalIndex, 4)}`;
    entities[entityIndex] = { id: internalId, parentId: rootId, order: entityIndex };
    entityIndex += 1;

    for (let localLeafIndex = 0; localLeafIndex < 4; localLeafIndex += 1) {
      entities[entityIndex] = {
        id: `link-rejection-leaf-${padded(leafIndex, 4)}`,
        parentId: internalId,
        order: entityIndex,
      };
      entityIndex += 1;
      leafIndex += 1;
    }
  }

  return entities;
}

function buildRadiusLayoutResult(gridRadius, requestId) {
  return {
    requestId,
    mode: 'force-anchors',
    placements: [{ entityId: `radius-${gridRadius}-leaf`, q: gridRadius, r: 0 }],
    springs: [],
    gridRadius,
    stats: { occupiedCount: 1, boundaryGaps: [] },
    diagnostics: {
      kind: 'force',
      iterations: 256,
      assignmentEpochs: 40,
      proposalCount: 1,
      converged: true,
      maxTargetError: 0,
      rmsTargetError: 0,
      maxAnchorVelocity: 0,
    },
  };
}

export function buildRadius256LayoutResult(requestId = 1) {
  return buildRadiusLayoutResult(256, requestId);
}

export function buildRadius257LayoutResult(requestId = 1) {
  return buildRadiusLayoutResult(257, requestId);
}

function buildProbeRegions(deviceWidth, deviceHeight) {
  const centerX = Math.floor(deviceWidth / 2);
  const centerY = Math.floor(deviceHeight / 2);
  const rect = (x, y) => ({ x, y, width: 5, height: 5 });

  return {
    visibleSpringRegions: [rect(centerX - 2, centerY - 2)],
    adjacentBackgroundRegions: [rect(centerX + 10, centerY - 2)],
    opaqueOcclusionRegions: [rect(centerX - 38, centerY + 22)],
    hoverRegions: [rect(centerX - 98, centerY - 34)],
    selectionRegions: [rect(centerX + 94, centerY - 34)],
  };
}

function buildVisibilityCamera(name, width, height, devicePixelRatio, distance) {
  return {
    name,
    viewport: { width, height },
    devicePixelRatio,
    screenshotDevicePixels: {
      width: width * devicePixelRatio,
      height: height * devicePixelRatio,
    },
    verticalFovDegrees: 34,
    target: { type: 'control-spring-midpoint', q: 0, r: 0, y: 0 },
    azimuthDegrees: 32,
    elevationDegrees: 30,
    distance,
  };
}

export function buildVisibilityFixture() {
  const entities = [
    { id: 'visibility-root', parentId: null, order: 0 },
    { id: 'visibility-group', parentId: 'visibility-root', order: 1 },
    { id: 'visibility-leaf-control', parentId: 'visibility-group', order: 2 },
    { id: 'visibility-leaf-occluder', parentId: 'visibility-group', order: 3 },
    { id: 'visibility-leaf-state', parentId: 'visibility-group', order: 4 },
  ];
  const springs = [
    {
      source: { kind: 'anchor', entityId: 'visibility-group', q: 2, r: 0 },
      target: { kind: 'anchor', entityId: 'visibility-root', q: 3, r: -1 },
    },
    {
      source: { kind: 'leaf', entityId: 'visibility-leaf-control', q: -2, r: 0 },
      target: { kind: 'anchor', entityId: 'visibility-group', q: 2, r: 0 },
    },
    {
      source: { kind: 'leaf', entityId: 'visibility-leaf-occluder', q: 0, r: 0 },
      target: { kind: 'anchor', entityId: 'visibility-group', q: 2, r: 0 },
    },
    {
      source: { kind: 'leaf', entityId: 'visibility-leaf-state', q: 1, r: -2 },
      target: { kind: 'anchor', entityId: 'visibility-group', q: 2, r: 0 },
    },
  ];
  const desktopCamera = buildVisibilityCamera('desktop', 1440, 900, 1, 43);
  const mobileCamera = buildVisibilityCamera('mobile', 390, 844, 3, 72);

  return {
    entities,
    layoutResult: {
      requestId: 1,
      mode: 'force-anchors',
      placements: [
        { entityId: 'visibility-leaf-control', q: -2, r: 0 },
        { entityId: 'visibility-leaf-occluder', q: 0, r: 0 },
        { entityId: 'visibility-leaf-state', q: 1, r: -2 },
      ],
      springs,
      gridRadius: 2,
      stats: {
        occupiedCount: 3,
        boundaryGaps: [
          { depth: 0, averageNearestGap: null },
          { depth: 1, averageNearestGap: null },
        ],
      },
      diagnostics: {
        kind: 'force',
        iterations: 256,
        assignmentEpochs: 40,
        proposalCount: 3,
        converged: true,
        maxTargetError: 0,
        rmsTargetError: 0,
        maxAnchorVelocity: 0,
      },
    },
    controlSpringIndex: 1,
    controlSpring: springs[1],
    controlSpringMidpoint: { q: 0, r: 0, y: 0 },
    probeEntityIds: {
      translucentOccluder: 'visibility-leaf-occluder',
      hover: 'visibility-leaf-state',
      selection: 'visibility-leaf-control',
    },
    cameras: {
      desktop: desktopCamera,
      mobile: mobileCamera,
    },
    probeRegions: {
      desktop: buildProbeRegions(
        desktopCamera.screenshotDevicePixels.width,
        desktopCamera.screenshotDevicePixels.height,
      ),
      mobile: buildProbeRegions(
        mobileCamera.screenshotDevicePixels.width,
        mobileCamera.screenshotDevicePixels.height,
      ),
    },
  };
}

export function summarizeHierarchy(entities) {
  if (!Array.isArray(entities)) {
    throw new TypeError('Hierarchy fixture must be an array');
  }

  const entityCount = entities.length;
  if (entityCount === 0) {
    return {
      entityCount: 0,
      leafCount: 0,
      internalCount: 0,
      rootCount: 0,
      maxDepth: 0,
      leafAncestorMembershipCount: 0,
      activeLinkCount: 0,
    };
  }

  const indexById = new Map();
  const parentIndexes = new Int32Array(entityCount);
  const childCounts = new Uint32Array(entityCount);
  parentIndexes.fill(-1);

  for (let index = 0; index < entityCount; index += 1) {
    const entity = entities[index];
    if (
      entity === null
      || typeof entity !== 'object'
      || typeof entity.id !== 'string'
      || entity.id.length === 0
      || !Number.isInteger(entity.order)
      || (entity.parentId !== null && (typeof entity.parentId !== 'string' || entity.parentId.length === 0))
    ) {
      throw new TypeError(`Invalid normalized entity at index ${index}`);
    }
    if (indexById.has(entity.id)) {
      throw new TypeError(`Duplicate entity ID: ${entity.id}`);
    }
    indexById.set(entity.id, index);
  }

  let rootCount = 0;
  for (let index = 0; index < entityCount; index += 1) {
    const entity = entities[index];
    if (entity.parentId === null) {
      rootCount += 1;
      continue;
    }
    if (entity.parentId === entity.id) {
      throw new TypeError(`Self-parent entity: ${entity.id}`);
    }

    const parentIndex = indexById.get(entity.parentId);
    if (parentIndex === undefined) {
      throw new TypeError(`Missing parent ${entity.parentId} for ${entity.id}`);
    }
    parentIndexes[index] = parentIndex;
    childCounts[parentIndex] += 1;
  }

  const depths = new Int32Array(entityCount);
  const states = new Uint8Array(entityCount);
  const path = new Int32Array(entityCount);
  depths.fill(-1);
  let maxDepth = 0;

  for (let index = 0; index < entityCount; index += 1) {
    if (depths[index] !== -1) {
      continue;
    }

    let cursor = index;
    let pathLength = 0;
    while (cursor !== -1 && depths[cursor] === -1 && states[cursor] === 0) {
      states[cursor] = 1;
      path[pathLength] = cursor;
      pathLength += 1;
      cursor = parentIndexes[cursor];
    }
    if (cursor !== -1 && states[cursor] === 1) {
      throw new TypeError(`Hierarchy cycle includes ${entities[cursor].id}`);
    }

    let depth = cursor === -1 ? -1 : depths[cursor];
    while (pathLength > 0) {
      pathLength -= 1;
      const pathIndex = path[pathLength];
      depth += 1;
      depths[pathIndex] = depth;
      states[pathIndex] = 2;
      if (depth > maxDepth) {
        maxDepth = depth;
      }
    }
  }

  let leafCount = 0;
  let leafAncestorMembershipCount = 0;
  for (let index = 0; index < entityCount; index += 1) {
    if (childCounts[index] === 0) {
      leafCount += 1;
      leafAncestorMembershipCount += depths[index];
    }
  }

  return {
    entityCount,
    leafCount,
    internalCount: entityCount - leafCount,
    rootCount,
    maxDepth,
    leafAncestorMembershipCount,
    activeLinkCount: entityCount - rootCount,
  };
}

export function assertHierarchyCounts(entities, expected) {
  const actual = summarizeHierarchy(entities);
  for (const [name, expectedValue] of Object.entries(expected)) {
    if (actual[name] !== expectedValue) {
      throw new Error(`Expected ${name}=${expectedValue}, received ${actual[name]}`);
    }
  }
  return actual;
}
