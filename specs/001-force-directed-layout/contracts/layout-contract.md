# Layout Module Contract

## Purpose

Define the pure boundary between normalized hierarchy and deterministic spatial output. The module has no DOM, Three.js, locale, or source-domain dependency.

## Operation

```js
calculateLayout(request) -> LayoutResult
```

The orchestration layer assigns `requestId` for every mode. Existing modes execute directly; the force-directed mode executes the same pure calculation boundary in a worker. All modes return one normalized result shape.

## Supported Input

- At most 6,000 entities: 4,800 leaves and 1,200 internal entities.
- Hierarchy depth at most 16.
- Leaf-to-ancestor memberships at most 76,800.
- Active parent edges at most 5,999.
- Final axial grid radius at most 256.

Entity, depth, membership, or active-edge input outside its bound returns `UNSUPPORTED_SCALE` before simulation; empty input returns `EMPTY_HIERARCHY`. Final radius is a calculated output bound: radius above 256 returns `UNSUPPORTED_SCALE` before result publication, never a partial or clamped result.

## Force Request Example

```js
{
  requestId: 17,
  mode: 'force-anchors',
  entities: [
    { id: 'root-1', parentId: null, order: 0 },
    { id: 'internal-1', parentId: 'root-1', order: 1 },
    { id: 'leaf-1', parentId: 'internal-1', order: 2 }
  ],
  config: {
    version: 1,
    seed: 0x9e3779b9,
    totalTicks: 256,
    mutableEndTick: 159,
    settleEndTick: 223,
    assignmentInterval: 4,
    candidateRadius: 3,
    predictionLookahead: 0.75,
    movePenalty: 0.05,
    alphaSchedule: [
      { fromTick: 0, toTick: 159, from: 1, to: 0.12 },
      { fromTick: 160, toTick: 223, from: 0.12, to: 0.02 },
      { fromTick: 224, toTick: 255, from: 0.02, to: 0.005 }
    ],
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
      maxAnchorVelocity: 0.02
    }
  }
}
```

This is the selected version-1 deterministic configuration. The implementation freezes every output-affecting value; any later change increments `version` and updates deterministic fixtures.

## Success Example

```js
{
  requestId: 17,
  mode: 'force-anchors',
  placements: [
    { entityId: 'leaf-1', q: 0, r: 0 }
  ],
  springs: [
    {
      source: { kind: 'leaf', entityId: 'leaf-1', q: 0, r: 0 },
      target: { kind: 'anchor', entityId: 'internal-1', q: 0.25, r: -0.125 }
    },
    {
      source: { kind: 'anchor', entityId: 'internal-1', q: 0.25, r: -0.125 },
      target: { kind: 'anchor', entityId: 'root-1', q: 0.5, r: -0.25 }
    }
  ],
  gridRadius: 11,
  stats: {
    occupiedCount: 1,
    boundaryGaps: [
      { depth: 0, averageNearestGap: null },
      { depth: 1, averageNearestGap: null }
    ]
  },
  diagnostics: {
    kind: 'force',
    iterations: 256,
    assignmentEpochs: 40,
    proposalCount: 73,
    converged: true,
    maxTargetError: 0.1,
    rmsTargetError: 0.04,
    maxAnchorVelocity: 0.01
  }
}
```

Structured endpoint fields form the spring key. Implementations must not concatenate arbitrary entity IDs with delimiters.

## Legacy Result

Existing algorithms return the same top-level fields:

```js
{
  requestId,
  mode: 'packed',
  placements,
  springs: [],
  gridRadius,
  stats: { occupiedCount, boundaryGaps },
  diagnostics: {
    kind: 'legacy',
    iterations: 0,
    converged: true
  }
}
```

Legacy positions, gap meaning, and visual payload remain unchanged; only their transport is normalized to `entityId`, axial coordinates, generic depth-indexed gaps, empty springs, and legacy diagnostics.

For every internal depth, `boundaryGaps` partitions descendant leaf cells by internal entity. A non-root internal entity compares only with siblings sharing a parent; roots compare with other roots. Its value is the minimum `axialDistance(a, b) - 1` to an eligible internal entity, and the reported value is the arithmetic mean of finite per-entity minima. Return `null` when fewer than two internal entities have eligible peers. This preserves the existing nearest-boundary semantics without domain names.

## Deterministic Initialization

1. Use only the pinned standalone `d3-force@3.0.0` package, imported through named ESM exports; no other D3 module participates in layout.
2. Validate hierarchy plus entity, depth, membership, and 5,999-active-edge bounds before creating simulation objects.
3. Sort entities by integer `order`, then exact UTF-16 code-unit ID comparison.
4. Assign leaves canonical compact-spiral cells in sorted order and initialize `x/y` to those centers with `vx/vy = 0`.
5. Initialize every internal anchor to the centroid of descendant leaf initial positions, quantized to `0.000001` axial units, with zero velocity.
6. Create copied simulation records and copied links in canonical child/parent order; never pass normalized entities to d3-force mutation.
7. Build one virtual anchor per applicable internal entity and one link for each leaf-to-immediate-parent or nested-anchor-to-immediate-parent relation.
8. Use Mulberry32 with state `seed >>> 0` as `simulation.randomSource`.
9. Register forces in fixed order: immediate-parent links, many-body separation, weak centering, then the custom hex-cell force last. Set every accessor and iteration explicitly.
10. Call `simulation.stop()`, set `alphaDecay(0)`, `alphaTarget(0)`, and configured `velocityDecay`; timer-driven simulation is forbidden.
11. Execute the custom hex-cell force every tick. Before each of exactly 256 manual ticks, set alpha by linear interpolation within the configured phase.

Quantization uses nearest multiple of `quantizationStep`, with exact half values rounded away from zero. Desired positions are quantized before axial conversion; squared candidate costs and published anchor endpoints use the same rule. Non-finite results fail; computed radius 256 is accepted and radius 257 or greater returns `UNSUPPORTED_SCALE` rather than clamping.

## Required Invariants

- Input entities and config are not mutated.
- Every input leaf appears exactly once in placements; internal entities never do.
- Every placement has integer axial coordinates and a unique cell key.
- Result records use deterministic ordering.
- Reordering equivalent input arrays does not change output.
- Ten runs with identical normalized input/config version produce identical placements, springs, radius, generic stats, and quantized endpoints in the portable browser projects and the current/previous stable Google Chrome/Blink, Mozilla Firefox/Gecko, and Apple Safari/WebKit release/device-class matrix.
- The force mode creates one anchor per applicable internal entity and one spring per active immediate-parent hierarchy relation, up to 5,999; 6,000 or more returns `UNSUPPORTED_SCALE`. It creates no direct all-ancestor links and no separate grouping force.
- Existing modes return no anchors, links, or springs.
- Automatic alpha decay remains disabled; configured alpha is applied every tick.
- Custom hex force executes every tick; assignment changes only at mutable epochs.
- No successful result contains non-finite values, incomplete assignment, duplicate cell, more than 5,999 springs, radius above 256, failed convergence, or mismatched mode diagnostics.

## Hex Assignment Contract

For candidate radius `R`, the local neighborhood has `1 + 3R(R + 1)` cells and the optional previous-cell fallback yields at most one additional candidate. Radius three therefore permits at most 38 proposals per leaf per assignment epoch.

At every mutable epoch:

1. Predict desired position from current position plus configured velocity lookahead.
2. Quantize prediction and convert it to nearest axial cell.
3. Enumerate radius-`R` cells in canonical center-and-ring order.
4. Add previous cell if absent.
5. Rank by quantized squared distance, move penalty, canonical `(q, r)`, then exact stable entity ID.
6. Resolve proposals by deterministic deferred acceptance; previous owner cannot lose its protected fallback after exhausting preferred moves.
7. Commit the complete assignment atomically.

Every tick applies velocity toward the current assigned center. No assignments change after `mutableEndTick`. During final ticks the custom force sets leaf `fx/fy` to exact assigned centers; there is no later rounding or matching stage.

`diagnostics.proposalCount` is cumulative across all assignment epochs and cannot exceed `leafCount * (1 + 3R(R + 1) + 1) * assignmentEpochs`.

## Grouping Quality Contract

For deterministic acceptance fixtures:

- At each tested ancestor depth, classify a leaf by its internal ancestor whose `depth` equals that value. Exclude leaves without an ancestor at that depth and skip depths without at least two eligible ancestor sets of at least two leaves.
- Calculate for every included leaf the nearest axial distance to a leaf with the same tested-depth ancestor and to a leaf with a different tested-depth ancestor.
- Mean same-ancestor nearest distance must be no more than 80% of mean different-ancestor nearest distance.
- Apply the assertion to the single force-directed mode.

This fixture metric verifies grouping behavior without introducing domain names into production output.

## Failure Contract

Pure calculation produces one complete `LayoutResult` or throws an internal error carrying a non-localized code/details pair, including `UNKNOWN_MODE` for an unregistered mode and `UNSUPPORTED_SCALE` for more than 5,999 active links or computed radius above 256. It never returns partial placements. Worker serialization and runner behavior follow [worker-protocol.md](./worker-protocol.md).
