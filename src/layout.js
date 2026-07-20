const DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const layoutAlgorithms = {
  flat: {
    label: 'Плоские кольца',
    note: 'Классы распределены равномерно, принадлежность к школе не влияет на позиции.',
  },
  nested: {
    label: 'Вложенные кольца',
    note: 'Классы собраны вокруг школ, но расстояния рассчитаны по крупнейшей группе.',
  },
  packed: {
    label: 'Иерархическая упаковка',
    note: 'Размеры учитываются явно: один свободный гекс между классами и два между школами.',
  },
};

function key({ q, r }) {
  return `${q},${r}`;
}

function add(a, b) {
  return { q: a.q + b.q, r: a.r + b.r };
}

function subtract(a, b) {
  return { q: a.q - b.q, r: a.r - b.r };
}

function scale(cell, amount) {
  return { q: cell.q * amount, r: cell.r * amount };
}

function distance(a, b = { q: 0, r: 0 }) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function getHexRing(radius) {
  if (radius === 0) return [{ q: 0, r: 0 }];
  const cells = [];
  const cell = { q: -radius, r: radius };

  for (const direction of DIRECTIONS) {
    for (let step = 0; step < radius; step += 1) {
      cells.push({ q: cell.q, r: cell.r });
      cell.q += direction.q;
      cell.r += direction.r;
    }
  }

  return cells;
}

function* getHexSpiral() {
  yield { q: 0, r: 0 };
  for (let radius = 1; ; radius += 1) yield* getHexRing(radius);
}

function getCompactCells(count) {
  const spiral = getHexSpiral();
  return Array.from({ length: count }, () => spiral.next().value);
}

function getDistributedCenters(count, spacing) {
  if (count === 0) return [];
  const cells = [{ q: 0, r: 0 }];
  let remaining = count - 1;

  for (let radius = 1; remaining > 0; radius += 1) {
    const ring = getHexRing(radius);
    const cellsOnRing = Math.min(remaining, ring.length);
    for (let index = 0; index < cellsOnRing; index += 1) {
      cells.push(scale(ring[Math.floor(index * ring.length / cellsOnRing)], spacing));
    }
    remaining -= cellsOnRing;
  }

  return cells;
}

function groupStudents(data) {
  const byClass = new Map(data.classes.map((classEntity) => [classEntity.id, []]));
  data.students.forEach((student) => byClass.get(student.classId).push(student));
  return byClass;
}

function getRadius(cells) {
  return cells.reduce((largest, cell) => Math.max(largest, distance(cell)), 0);
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
  const sorted = [...items].sort((a, b) => b.cells.length - a.cells.length || a.order - b.order);
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
        if (attempts > 100000) throw new Error('Не удалось разместить группу на сетке.');
      } while (item.cells.some((cell) => blocked.has(key(add(cell, origin)))));
    }

    const cells = item.cells.map((cell) => add(cell, origin));
    cells.forEach((cell) => {
      getRange(cell, gap).forEach((blockedCell) => blocked.add(key(blockedCell)));
    });
    packed.push({ ...item, origin, cells });
  });

  return packed.sort((a, b) => a.order - b.order);
}

function roundAxial(q, r) {
  const s = -q - r;
  let roundedQ = Math.round(q);
  let roundedR = Math.round(r);
  let roundedS = Math.round(s);
  const qError = Math.abs(roundedQ - q);
  const rError = Math.abs(roundedR - r);
  const sError = Math.abs(roundedS - s);

  if (qError > rError && qError > sError) roundedQ = -roundedR - roundedS;
  else if (rError > sError) roundedR = -roundedQ - roundedS;
  else roundedS = -roundedQ - roundedR;
  return { q: roundedQ, r: roundedR };
}

function centerCells(cells) {
  const average = cells.reduce((sum, cell) => ({ q: sum.q + cell.q, r: sum.r + cell.r }), { q: 0, r: 0 });
  return roundAxial(average.q / cells.length, average.r / cells.length);
}

function createClassItem(classEntity, students) {
  const cells = getCompactCells(students.length);
  return {
    id: classEntity.id,
    order: classEntity.index,
    classEntity,
    students,
    cells,
    radius: getRadius(cells),
  };
}

function createPlacements(classItem, cells, offset = { q: 0, r: 0 }) {
  return classItem.students.map((student, index) => ({
    student,
    q: cells[index].q + offset.q,
    r: cells[index].r + offset.r,
  }));
}

function layoutFlat(data, studentsByClass) {
  const items = data.classes.map((classEntity) => createClassItem(classEntity, studentsByClass.get(classEntity.id)));
  const largestRadius = Math.max(...items.map((item) => item.radius));
  const centers = getDistributedCenters(items.length, Math.max(6, largestRadius * 2 + 2));
  return items.flatMap((item, index) => {
    const cells = item.cells.map((cell) => add(cell, centers[index]));
    return createPlacements(item, cells);
  });
}

function buildNestedSchools(data, studentsByClass, packed) {
  const classById = new Map(data.classes.map((classEntity) => [classEntity.id, classEntity]));

  return data.schools.map((school) => {
    const classItems = school.classIds.map((classId) => {
      const classEntity = classById.get(classId);
      return createClassItem(classEntity, studentsByClass.get(classId));
    });
    let placedClasses;

    if (packed) {
      placedClasses = packItems(classItems, 1);
    } else {
      const largestRadius = Math.max(...classItems.map((item) => item.radius));
      const centers = getDistributedCenters(classItems.length, Math.max(6, largestRadius * 2 + 2));
      placedClasses = classItems.map((item, index) => ({
        ...item,
        origin: centers[index],
        cells: item.cells.map((cell) => add(cell, centers[index])),
      }));
    }

    const allCells = placedClasses.flatMap((item) => item.cells);
    const center = centerCells(allCells);
    const normalizedClasses = placedClasses.map((item) => ({
      ...item,
      origin: subtract(item.origin, center),
      cells: item.cells.map((cell) => subtract(cell, center)),
    }));

    return {
      id: school.id,
      order: school.index,
      school,
      classes: normalizedClasses,
      cells: normalizedClasses.flatMap((item) => item.cells),
    };
  });
}

function layoutNested(data, studentsByClass, packed) {
  const schools = buildNestedSchools(data, studentsByClass, packed);
  let placedSchools;

  if (packed) {
    placedSchools = packItems(schools, 2);
  } else {
    const largestRadius = Math.max(...schools.map((school) => getRadius(school.cells)));
    const centers = getDistributedCenters(schools.length, largestRadius * 2 + 4);
    placedSchools = schools.map((school, index) => ({ ...school, origin: centers[index] }));
  }

  return placedSchools.flatMap((school) => school.classes.flatMap((classItem) => {
    const cells = classItem.cells.map((cell) => add(cell, school.origin));
    return createPlacements(classItem, cells);
  }));
}

function getBoundaryStats(data, placements) {
  const classGroups = new Map(data.classes.map((entity) => [entity.id, { entity, cells: [] }]));
  const schoolGroups = new Map(data.schools.map((entity) => [entity.id, { entity, cells: [] }]));
  placements.forEach((placement) => {
    const cell = { q: placement.q, r: placement.r };
    classGroups.get(placement.student.classId).cells.push(cell);
    schoolGroups.get(placement.student.schoolId).cells.push(cell);
  });

  function averageNearestGap(groups, sameParentOnly) {
    if (groups.length < 2) return null;
    const nearest = groups.map((group, index) => {
      let minimum = Infinity;
      groups.forEach((other, otherIndex) => {
        if (index === otherIndex) return;
        if (sameParentOnly && group.entity.parentId !== other.entity.parentId) return;
        for (const first of group.cells) {
          for (const second of other.cells) minimum = Math.min(minimum, distance(first, second) - 1);
        }
      });
      return minimum;
    }).filter(Number.isFinite);
    if (nearest.length === 0) return null;
    return nearest.reduce((sum, value) => sum + value, 0) / nearest.length;
  }

  return {
    classGap: averageNearestGap([...classGroups.values()], true),
    schoolGap: averageNearestGap([...schoolGroups.values()], false),
  };
}

export function calculateLayout(data, algorithm = 'packed') {
  const studentsByClass = groupStudents(data);
  let placements;

  if (algorithm === 'flat') placements = layoutFlat(data, studentsByClass);
  else placements = layoutNested(data, studentsByClass, algorithm === 'packed');

  const gridRadius = Math.max(11, placements.reduce((largest, cell) => (
    Math.max(largest, distance(cell))
  ), 0) + 3);

  return {
    placements,
    gridRadius,
    stats: getBoundaryStats(data, placements),
  };
}
