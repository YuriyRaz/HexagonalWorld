import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HEX_DIRECTIONS,
  HEX_SIZE,
  addAxial,
  axialDistance,
  axialKey,
  axialToPlane,
  getCompactCells,
  getHexRing,
  getHexSpiral,
  quantize,
  roundAxial,
  scaleAxial,
  subtractAxial,
} from '../src/hex.js';

const ORIGIN = { q: 0, r: 0 };

test('exports the shared hex size and canonical axial directions', () => {
  assert.equal(HEX_SIZE, 1.3);
  assert.deepEqual(HEX_DIRECTIONS, [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ]);
});

test('provides axial key and arithmetic helpers without mutating operands', () => {
  const first = { q: 2, r: -3 };
  const second = { q: -4, r: 5 };

  assert.equal(axialKey(first), '2,-3');
  assert.deepEqual(addAxial(first, second), { q: -2, r: 2 });
  assert.deepEqual(subtractAxial(first, second), { q: 6, r: -8 });
  assert.deepEqual(scaleAxial(first, 3), { q: 6, r: -9 });
  assert.deepEqual(first, { q: 2, r: -3 });
  assert.deepEqual(second, { q: -4, r: 5 });
});

test('calculates axial distance symmetrically, with the origin as the default', () => {
  assert.equal(axialDistance({ q: 3, r: -1 }), 3);
  assert.equal(axialDistance({ q: 3, r: -1 }, { q: -1, r: 2 }), 4);
  assert.equal(axialDistance({ q: -1, r: 2 }, { q: 3, r: -1 }), 4);
  assert.equal(axialDistance(ORIGIN, ORIGIN), 0);
});

test('returns rings in canonical deterministic order', () => {
  assert.deepEqual(getHexRing(0), [ORIGIN]);
  assert.deepEqual(getHexRing(1), [
    { q: -1, r: 1 },
    { q: 0, r: 1 },
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
  ]);
  assert.deepEqual(getHexRing(2), [
    { q: -2, r: 2 },
    { q: -1, r: 2 },
    { q: 0, r: 2 },
    { q: 1, r: 1 },
    { q: 2, r: 0 },
    { q: 2, r: -1 },
    { q: 2, r: -2 },
    { q: 1, r: -2 },
    { q: 0, r: -2 },
    { q: -1, r: -1 },
    { q: -2, r: 0 },
    { q: -2, r: 1 },
  ]);
});

test('generates a spiral as the center followed by canonical rings', () => {
  const spiral = getHexSpiral();
  const firstEight = Array.from({ length: 8 }, () => spiral.next().value);

  assert.deepEqual(firstEight, [
    ORIGIN,
    ...getHexRing(1),
    { q: -2, r: 2 },
  ]);
});

test('returns exactly the requested compact prefix of the canonical spiral', () => {
  assert.deepEqual(getCompactCells(0), []);
  assert.deepEqual(getCompactCells(8), [
    ORIGIN,
    ...getHexRing(1),
    { q: -2, r: 2 },
  ]);
  assert.equal(getCompactCells(37).length, 37);
});

test('rounds fractional axial coordinates through cube-coordinate correction', () => {
  assert.deepEqual(roundAxial(0, 0), ORIGIN);
  assert.deepEqual(roundAxial(0.49, 0.2), { q: 1, r: 0 });
  assert.deepEqual(roundAxial(0.2, 0.49), { q: 0, r: 1 });
  assert.deepEqual(roundAxial(0.8, -0.3), { q: 1, r: 0 });
  assert.deepEqual(roundAxial(-0.8, 0.3), { q: -1, r: 0 });
});

test('quantizes to the nearest step with exact halves away from zero', () => {
  assert.equal(quantize(1.24, 0.5), 1);
  assert.equal(quantize(-1.24, 0.5), -1);
  assert.equal(quantize(1.25, 0.5), 1.5);
  assert.equal(quantize(-1.25, 0.5), -1.5);
  assert.equal(quantize(0.0000005), 0.000001);
  assert.equal(quantize(-0.0000005), -0.000001);
});

test('converts axial coordinates to the existing pointy-top x/z plane', () => {
  assert.deepEqual(axialToPlane(0, 0), { x: 0, z: 0 });
  assert.deepEqual(axialToPlane(2, -1), {
    x: HEX_SIZE * Math.sqrt(3) * 1.5,
    z: HEX_SIZE * -1.5,
  });
  assert.deepEqual(axialToPlane(-1, 2), {
    x: 0,
    z: HEX_SIZE * 3,
  });
});

test('rejects invalid ring radii and compact cell counts', () => {
  for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => getHexRing(invalid));
    assert.throws(() => getCompactCells(invalid));
  }
});

test('rejects non-finite axial coordinates and scale factors', () => {
  const invalidCell = { q: Number.NaN, r: 0 };

  assert.throws(() => axialKey(invalidCell));
  assert.throws(() => addAxial(ORIGIN, invalidCell));
  assert.throws(() => subtractAxial(ORIGIN, invalidCell));
  assert.throws(() => scaleAxial(ORIGIN, Number.POSITIVE_INFINITY));
  assert.throws(() => axialDistance(ORIGIN, invalidCell));
  assert.throws(() => roundAxial(Number.NEGATIVE_INFINITY, 0));
  assert.throws(() => axialToPlane(0, Number.NaN));
});

test('rejects non-finite values and invalid quantization steps', () => {
  assert.throws(() => quantize(Number.NaN));
  assert.throws(() => quantize(Number.POSITIVE_INFINITY));

  for (const invalidStep of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => quantize(1, invalidStep));
  }
});
