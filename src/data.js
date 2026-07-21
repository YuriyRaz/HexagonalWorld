const classNames = [
  '10A Math',
  '10B Physics',
  '11A Chemistry',
  '11B Biology',
  '12A Literature',
  '12B History',
];

const schoolNames = [
  'North Academy',
  'River School',
  'Orion Lyceum',
  'Forest Gymnasium',
  'Harbor School',
  'Summit Academy',
];

const HIERARCHY_LIMITS = Object.freeze({
  entityCount: 6000,
  leafCount: 4800,
  internalCount: 1200,
  maxDepth: 16,
  leafAncestorMembershipCount: 76800,
  activeLinkCount: 5999,
});

export class HierarchyError extends Error {
  constructor(code, details, message = code) {
    super(message);
    this.name = 'HierarchyError';
    this.code = code;
    this.details = details;
  }
}

function invalidHierarchy(reason, details = {}) {
  throw new HierarchyError('INVALID_HIERARCHY', { reason, ...details });
}

function compareEntities(first, second) {
  if (first.order < second.order) return -1;
  if (first.order > second.order) return 1;
  if (first.id < second.id) return -1;
  if (first.id > second.id) return 1;
  return 0;
}

export function normalizeHierarchy(sourceEntities) {
  if (!Array.isArray(sourceEntities)) {
    invalidHierarchy('INVALID_ENTITY_LIST', { receivedType: typeof sourceEntities });
  }
  if (sourceEntities.length === 0) {
    throw new HierarchyError('EMPTY_HIERARCHY', { entityCount: 0 });
  }

  const entityCount = sourceEntities.length;
  const entities = new Array(entityCount);
  const seenIds = new Set();

  for (let index = 0; index < entityCount; index += 1) {
    const source = sourceEntities[index];
    if (source === null || typeof source !== 'object') {
      invalidHierarchy('INVALID_ENTITY', { index });
    }
    if (typeof source.id !== 'string' || source.id.length === 0) {
      invalidHierarchy('INVALID_ID', { index });
    }
    if (seenIds.has(source.id)) {
      invalidHierarchy('DUPLICATE_ID', { id: source.id, index });
    }
    if (
      source.parentId !== null
      && (typeof source.parentId !== 'string' || source.parentId.length === 0)
    ) {
      invalidHierarchy('INVALID_PARENT_ID', { id: source.id, index });
    }
    if (!Number.isInteger(source.order)) {
      invalidHierarchy('INVALID_ORDER', { id: source.id, index });
    }

    seenIds.add(source.id);
    entities[index] = { id: source.id, parentId: source.parentId, order: source.order };
  }

  entities.sort(compareEntities);

  const indexById = new Map();
  for (let index = 0; index < entityCount; index += 1) {
    indexById.set(entities[index].id, index);
  }

  const parentIndexes = new Int32Array(entityCount);
  const childCounts = new Uint32Array(entityCount);
  parentIndexes.fill(-1);
  let rootCount = 0;

  for (let index = 0; index < entityCount; index += 1) {
    const entity = entities[index];
    if (entity.parentId === null) {
      rootCount += 1;
      continue;
    }
    if (entity.parentId === entity.id) {
      invalidHierarchy('SELF_PARENT', { id: entity.id });
    }

    const parentIndex = indexById.get(entity.parentId);
    if (parentIndex === undefined) {
      invalidHierarchy('MISSING_PARENT', { id: entity.id, parentId: entity.parentId });
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
    if (depths[index] !== -1) continue;

    let cursor = index;
    let pathLength = 0;
    while (cursor !== -1 && depths[cursor] === -1 && states[cursor] === 0) {
      states[cursor] = 1;
      path[pathLength] = cursor;
      pathLength += 1;
      cursor = parentIndexes[cursor];
    }
    if (cursor !== -1 && states[cursor] === 1) {
      invalidHierarchy('CYCLE', { id: entities[cursor].id });
    }

    let depth = cursor === -1 ? -1 : depths[cursor];
    while (pathLength > 0) {
      pathLength -= 1;
      const pathIndex = path[pathLength];
      depth += 1;
      depths[pathIndex] = depth;
      states[pathIndex] = 2;
      if (depth > maxDepth) maxDepth = depth;
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
  if (leafCount === 0) {
    throw new HierarchyError('EMPTY_HIERARCHY', { entityCount, leafCount });
  }

  const counts = {
    entityCount,
    leafCount,
    internalCount: entityCount - leafCount,
    rootCount,
    maxDepth,
    leafAncestorMembershipCount,
    activeLinkCount: entityCount - rootCount,
  };
  const violations = [];
  for (const measure of Object.keys(HIERARCHY_LIMITS)) {
    const maximum = HIERARCHY_LIMITS[measure];
    if (counts[measure] > maximum) {
      violations.push({ measure, actual: counts[measure], maximum });
    }
  }
  if (violations.length > 0) {
    throw new HierarchyError('UNSUPPORTED_SCALE', { violations });
  }

  const leafIds = new Array(leafCount);
  const internalIds = new Array(counts.internalCount);
  const depthByEntityId = new Map();
  const ancestorIdsByEntityId = new Map();
  let leafIndex = 0;
  let internalIndex = 0;

  for (let index = 0; index < entityCount; index += 1) {
    const { id } = entities[index];
    if (childCounts[index] === 0) {
      leafIds[leafIndex] = id;
      leafIndex += 1;
    } else {
      internalIds[internalIndex] = id;
      internalIndex += 1;
    }

    const depth = depths[index];
    const ancestorIds = new Array(depth);
    let parentIndex = parentIndexes[index];
    for (let ancestorIndex = 0; ancestorIndex < depth; ancestorIndex += 1) {
      ancestorIds[ancestorIndex] = entities[parentIndex].id;
      parentIndex = parentIndexes[parentIndex];
    }
    depthByEntityId.set(id, depth);
    ancestorIdsByEntityId.set(id, ancestorIds);
  }

  return {
    entities,
    analysis: {
      leafIds,
      internalIds,
      depthByEntityId,
      ancestorIdsByEntityId,
      counts,
    },
  };
}

export function generateSchoolData({
  schoolCount = 3,
  classCount = 12,
  minStudents = 11,
  maxStudents = 18,
} = {}) {
  const schools = Array.from({ length: schoolCount }, (_, index) => ({
    id: `school-${index + 1}`,
    name: schoolNames[index] ?? `School ${index + 1}`,
    index,
    classIds: [],
  }));
  const classes = [];
  const students = [];
  let studentNumber = 1;

  for (let classIndex = 0; classIndex < classCount; classIndex += 1) {
    const school = schools[classIndex % schools.length];
    const indexInSchool = school.classIds.length;
    const id = `class-${classIndex + 1}`;
    const name = classNames[classIndex] ?? `Class ${classIndex + 1}`;
    const studentCount = Math.floor(Math.random() * (maxStudents - minStudents + 1)) + minStudents;
    const classEntity = {
      id,
      parentId: school.id,
      name,
      index: classIndex,
      indexInSchool,
      studentCount,
      studentIds: [],
    };

    school.classIds.push(id);
    classes.push(classEntity);

    for (let studentIndex = 0; studentIndex < studentCount; studentIndex += 1) {
      const student = {
        id: `student-${studentNumber}`,
        parentId: id,
        name: `Student ${studentIndex + 1}`,
        classId: id,
        className: name,
        classIndex,
        schoolId: school.id,
        schoolName: school.name,
        schoolIndex: school.index,
        mark: 40 + ((studentNumber * 37 + classIndex * 17) % 61),
      };
      studentNumber += 1;
      classEntity.studentIds.push(student.id);
      students.push(student);
    }
  }

  return { schools, classes, students };
}

export function adaptSchoolData(sourceData) {
  const sourceEntities = new Array(
    sourceData.schools.length + sourceData.classes.length + sourceData.students.length,
  );
  let order = 0;

  for (const school of sourceData.schools) {
    sourceEntities[order] = { id: school.id, parentId: null, order };
    order += 1;
  }
  for (const classEntity of sourceData.classes) {
    sourceEntities[order] = { id: classEntity.id, parentId: classEntity.parentId, order };
    order += 1;
  }
  for (const student of sourceData.students) {
    sourceEntities[order] = { id: student.id, parentId: student.parentId, order };
    order += 1;
  }

  const { entities, analysis } = normalizeHierarchy(sourceEntities);
  const studentById = new Map(sourceData.students.map((student) => [student.id, student]));
  const classById = new Map(sourceData.classes.map((classEntity) => [classEntity.id, classEntity]));
  const visualPayloadByEntityId = new Map();

  for (const entityId of analysis.leafIds) {
    const student = studentById.get(entityId);
    if (!student) {
      invalidHierarchy('MISSING_VISUAL_PAYLOAD', { id: entityId });
    }
    const classEntity = classById.get(student.classId);
    if (!classEntity) {
      invalidHierarchy('MISSING_CLASS_PAYLOAD', { id: entityId, classId: student.classId });
    }
    visualPayloadByEntityId.set(entityId, {
      entityId,
      title: student.name,
      metadataText: `${student.schoolName} \u00b7 ${student.className} \u00b7 \u041e\u0446\u0435\u043d\u043a\u0430: ${student.mark}`,
      heightValue: student.mark,
      colorGroupId: student.schoolId,
      colorGroupOrder: student.schoolIndex,
      colorVariantOrder: classEntity.indexInSchool,
    });
  }

  return { entities, visualPayloadByEntityId };
}
