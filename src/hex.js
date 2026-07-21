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

  const magnitude = Math.floor(Math.abs(value) / step + 0.5) * step;
  const result = value < 0 ? -magnitude : magnitude;
  if (!Number.isFinite(result)) throw new RangeError('quantized value must be finite.');
  return normalizeZero(result);
}

export function axialToPlane(q, r) {
  assertFinite(q, 'q');
  assertFinite(r, 'r');
  return {
    x: normalizeZero(HEX_SIZE * SQRT_3 * (q + r / 2)),
    z: normalizeZero(HEX_SIZE * 1.5 * r),
  };
}
