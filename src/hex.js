export const HEX_SIZE = 1.3;

export const HEX_DIRECTIONS = Object.freeze([
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 0, r: -1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: 0, r: 1 }),
]);

const DEFAULT_QUANTIZATION_STEP = 0.000001;
const SQRT_3 = Math.sqrt(3);

export const ADJACENT_CELL_SPACING = HEX_SIZE * SQRT_3;

function assertFinite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite.`);
}

function assertCell(cell, name) {
  if (cell === null || typeof cell !== 'object') {
    throw new TypeError(`${name} must be an axial coordinate.`);
  }
  assertFinite(cell.q, `${name}.q`);
  assertFinite(cell.r, `${name}.r`);
}

function assertCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function normalizeZero(value) {
  return value === 0 ? 0 : value;
}

export function axialKey(cell) {
  assertCell(cell, 'cell');
  return `${normalizeZero(cell.q)},${normalizeZero(cell.r)}`;
}

export function addAxial(first, second) {
  assertCell(first, 'first');
  assertCell(second, 'second');
  return {
    q: normalizeZero(first.q + second.q),
    r: normalizeZero(first.r + second.r),
  };
}

export function subtractAxial(first, second) {
  assertCell(first, 'first');
  assertCell(second, 'second');
  return {
    q: normalizeZero(first.q - second.q),
    r: normalizeZero(first.r - second.r),
  };
}

export function scaleAxial(cell, amount) {
  assertCell(cell, 'cell');
  assertFinite(amount, 'amount');
  return {
    q: normalizeZero(cell.q * amount),
    r: normalizeZero(cell.r * amount),
  };
}

export function axialDistance(first, second) {
  assertCell(first, 'first');
  if (second !== undefined) assertCell(second, 'second');

  const q = first.q - (second?.q ?? 0);
  const r = first.r - (second?.r ?? 0);
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

export function getHexRing(radius) {
  assertCount(radius, 'radius');
  if (radius === 0) return [{ q: 0, r: 0 }];

  const cells = new Array(radius * HEX_DIRECTIONS.length);
  let q = -radius;
  let r = radius;
  let index = 0;

  for (const direction of HEX_DIRECTIONS) {
    for (let step = 0; step < radius; step += 1) {
      cells[index] = { q, r };
      index += 1;
      q += direction.q;
      r += direction.r;
    }
  }

  return cells;
}

export function* getHexSpiral() {
  yield { q: 0, r: 0 };

  for (let radius = 1; ; radius += 1) {
    let q = -radius;
    let r = radius;

    for (const direction of HEX_DIRECTIONS) {
      for (let step = 0; step < radius; step += 1) {
        yield { q, r };
        q += direction.q;
        r += direction.r;
      }
    }
  }
}

export function getCompactCells(count) {
  assertCount(count, 'count');
  if (count === 0) return [];

  const cells = new Array(count);
  cells[0] = { q: 0, r: 0 };
  let index = 1;

  for (let radius = 1; index < count; radius += 1) {
    let q = -radius;
    let r = radius;

    for (const direction of HEX_DIRECTIONS) {
      for (let step = 0; step < radius && index < count; step += 1) {
        cells[index] = { q, r };
        index += 1;
        q += direction.q;
        r += direction.r;
      }
      if (index === count) break;
    }
  }

  return cells;
}

export function roundAxial(q, r) {
  assertFinite(q, 'q');
  assertFinite(r, 'r');

  const s = -q - r;
  let roundedQ = Math.round(q);
  let roundedR = Math.round(r);
  const roundedS = Math.round(s);
  const qError = Math.abs(roundedQ - q);
  const rError = Math.abs(roundedR - r);
  const sError = Math.abs(roundedS - s);

  if (qError > rError && qError > sError) roundedQ = -roundedR - roundedS;
  else if (rError > sError) roundedR = -roundedQ - roundedS;

  return { q: normalizeZero(roundedQ), r: normalizeZero(roundedR) };
}

export function quantize(value, step = DEFAULT_QUANTIZATION_STEP) {
  assertFinite(value, 'value');
  assertFinite(step, 'step');
  if (step <= 0) throw new RangeError('step must be greater than zero.');

  const result = Math.round(value / step) * step;
  if (!Number.isFinite(result)) throw new RangeError('quantized value must be finite.');
  return normalizeZero(result);
}

export function axialToPlane(q, r) {
  return axialToPlaneInto(q, r, {});
}

export function axialToPlaneInto(q, r, target) {
  assertFinite(q, 'q');
  assertFinite(r, 'r');
  if (target === null || typeof target !== 'object') throw new TypeError('target must be an object.');
  target.x = normalizeZero(HEX_SIZE * SQRT_3 * (q + r / 2));
  target.z = normalizeZero(HEX_SIZE * 1.5 * r);
  return target;
}

/** Convert the pointy-top simulation plane back to fractional axial space. */
export function planeToAxial(x, z) {
  return planeToAxialInto(x, z, {});
}

export function planeToAxialInto(x, z, target) {
  assertFinite(x, 'x');
  assertFinite(z, 'z');
  if (target === null || typeof target !== 'object') throw new TypeError('target must be an object.');
  target.q = x / (HEX_SIZE * SQRT_3) - z / (HEX_SIZE * 3);
  target.r = z / (HEX_SIZE * 1.5);
  return target;
}

export function fractionalAxialRadius(q, r) {
  assertFinite(q, 'q');
  assertFinite(r, 'r');
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}
