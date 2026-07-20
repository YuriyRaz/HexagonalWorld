# Layout Module Contract

## Purpose

Define the pure boundary between normalized hierarchy and deterministic spatial output. The module has no DOM, Three.js, locale, or source-domain dependency.

## Operation

```js
calculateLayout(request) -> LayoutResult
```

The orchestration layer assigns `requestId` for every mode. Existing modes execute directly; force modes execute the same pure calculation in a worker. Both return one normalized result shape.

## Supported Input

- At most 6,000 entities: 4,800 leaves and 1,200 internal entities.
- Hierarchy depth at most 16.
- Leaf-to-ancestor memberships at most 76,800.
- Active parent edges at most 5,999.
- Final axial grid radius at most 256.

Input outside these bounds returns `UNSUPPORTED_SCALE`; empty input returns `EMPTY_HIERARCHY`.

## Force Request Example

```js
{
  requestId: 17,
  mode: 'force-anchors',
  entities: [
    { id: 'root-1', parentId: null, order: 0 },
    { id: 'group-1', parentId: 'root-1', order: 1 },
    { id: 'leaf-1', parentId: 'group-1', order: 2 }
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
    groupStrength: 0.12,
    ancestorDecay: 0.5,
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

Force values are initial benchmark candidates. The accepted implementation must freeze one complete configuration version and update deterministic fixtures whenever that version changes.

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
      target: { kind: 'anchor', entityId: 'group-1', q: 0.25, r: -0.125 }
    },
    {
      source: { kind: 'anchor', entityId: 'group-1', q: 0.25, r: -0.125 },
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

For every internal depth, `boundaryGaps` groups descendant leaf cells by internal entity. Non-root groups compare only with sibling groups sharing a parent; roots compare with other roots. A group's value is the minimum `axialDistance(a, b) - 1` to an eligible group, and the reported value is the arithmetic mean of finite per-group minima. Return `null` when fewer than two groups have eligible peers. This preserves current immediate-group and root-group gap semantics without domain names.

## Deterministic Initialization

1. Validate hierarchy and scale before creating simulation objects.
2. Sort entities by integer `order`, then exact UTF-16 code-unit ID comparison.
3. Assign leaves canonical compact-spiral cells in sorted order and initialize `x/y` to those centers with `vx/vy = 0`.
4. Initialize every internal anchor to the centroid of descendant leaf initial positions, quantized to `0.000001` axial units, with zero velocity.
5. Use Mulberry32 with state `seed >>> 0` as `simulation.randomSource`.
6. Set `alphaDecay(0)`, `alphaTarget(0)`, configured `velocityDecay`, and every force accessor/iteration explicitly.
7. Before each single manual tick, set alpha by linear interpolation within the configured phase.

Quantization uses nearest multiple of `quantizationStep`, with exact half values rounded away from zero. Desired positions are quantized before axial conversion; squared candidate costs and published anchor endpoints use the same rule. Non-finite or out-of-radius results fail rather than clamp.

## Required Invariants

- Input entities and config are not mutated.
- Every input leaf appears exactly once in placements; internal entities never do.
- Every placement has integer axial coordinates and a unique cell key.
- Result records use deterministic ordering.
- Reordering equivalent input arrays does not change output.
- Ten runs with identical normalized input/config version produce identical placements, springs, radius, generic stats, and quantized endpoints in every browser project in the plan's engine/release/device-class matrix.
- Anchor mode creates one anchor per internal entity and one spring per non-root hierarchy entity.
- Group mode creates no anchors, links, or springs.
- Automatic alpha decay remains disabled; configured alpha is applied every tick.
- Custom hex force executes every tick; assignment changes only at mutable epochs.
- No successful result contains non-finite values, incomplete assignment, duplicate cell, excess radius, failed convergence, or mismatched mode diagnostics.

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

- At each tested ancestor depth, group a leaf by its ancestor whose `depth` equals that value. Exclude leaves without an ancestor at that depth and skip depths without at least two eligible groups of at least two leaves.
- Calculate for every included leaf the nearest axial distance to a leaf with the same tested-depth ancestor and to a leaf with a different tested-depth ancestor.
- Mean same-group nearest distance must be no more than 80% of mean different-group nearest distance.
- Apply the assertion independently to anchor and no-link modes.

This fixture metric verifies grouping behavior without introducing domain names into production output.

## Failure Contract

Pure calculation produces one complete `LayoutResult` or throws an internal error carrying a non-localized code/details pair, including `UNKNOWN_MODE` for an unregistered mode. It never returns partial placements. Worker serialization and runner behavior follow [worker-protocol.md](./worker-protocol.md).
