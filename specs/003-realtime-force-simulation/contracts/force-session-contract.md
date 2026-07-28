# Retained Deterministic Force Session Contract

## Public Calculation API

```js
createForceLayoutSession(request) -> ForceLayoutSession
calculateForceLayout(request) -> LayoutResult
```

The synchronous wrapper validates an acyclic normalized hierarchy, exhausts epoch 0 through the same step/assignment/convergence kernel, and serializes without mutating settled state. Cyclic parent-child input is rejected deterministically before session creation and reports the involved cycle through the invalid-input contract.

## Version-2 Configuration

```js
{
  version: 2,
  seed,
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
    decay: 0.02662261909607977,
    resetOnInteractionStart: true,
    resetOnFinalRelease: true
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
  linkIterations: 1
}
```

Validate the complete shape and values. Alpha values must be finite; `initial` is in `(0, 1]`, `target` is in `[0, initial)`, `minimum` is in `(0, initial)`, and `decay` must equal `1 - Math.pow(minimum / initial, 1 / maxCoolingSteps)`. Epoch start and final release reset alpha to `initial`, target to `target`, convergence state, and the applicable cooling budget. Accepted held command ticks may advance alpha deterministically with the command transcript but do not consume cooling steps; final release resets the schedule before cooling step 1. Apply many-body strength to leaves and anchors. Install the seeded d3 random source. No hidden tail ticks exist.

## Session API

```js
{
  topology(),
  initialFrame(),
  advanceOneStep(),
  enqueueControl(command),
  applyQueuedControls(),
  serializeSettledResult(),
  isSettled(),
  dispose()
}
```

Only the worker invokes control methods. Pointer/DOM/camera/render values are forbidden.

## Assignment Epoch

Canonical entity order is root-first preorder. Siblings sort by normalized numeric `order`, then by stable ID using Unicode code-point order; missing `order` sorts after finite values. Leaves and anchors retain their filtered canonical entity order. Initial leaf cells are all axial cells sorted by radius from origin, then `q`, then `r`; leaf `i` owns cell `i`.

Every fourth cooling step before assignment freeze:

1. Predict each uncontrolled leaf from position and velocity.
2. Convert to quantized fractional axial coordinates.
3. Enumerate canonical radius-three candidates inside radius 256 and append previous cell if absent.
4. Each leaf ranks cells by quantized squared plane distance plus move penalty, then `q`, then `r`.
5. Resolve through deferred acceptance with leaves proposing in canonical order. A cell ranks proposers by that same quantized cost for the cell, then prefers its previous owner, then lower canonical leaf index. Rejected leaves continue through their ranked candidates; the protected previous cell remains a final candidate.
6. Commit only a complete unique assignment; assignment changes targets but not positions/velocities.
7. Increment unchanged epochs only on actual unchanged assignment epochs; reset on change.

At most 38 candidates exist per leaf. Proposal work is bounded and uses reusable arrays/encoded cells.

Prediction uses `predictedX = x + vx * predictionLookahead` and `predictedY = y + vy * predictionLookahead` after the preceding completed tick. Convert predicted plane coordinates to fractional axial coordinates with the centralized inverse hex transform and quantize each fractional component as `Math.round(value / decisionQuantizationStep) * decisionQuantizationStep`. For candidate center `(cx, cy)`, compute normalized squared distance `((predictedX - cx)^2 + (predictedY - cy)^2) / adjacentCellSpacing^2`, quantize it with the same rule, add `0` for the current cell or `movePenalty` otherwise, then quantize the total again. This total is the proposal/cell cost used by both ranking rules.

## Hex Target Force And Center Lock

- On ordinary ticks, each uncontrolled leaf applies `vx += (assignedCenterX - x) * strength * alpha` and `vy += (assignedCenterY - y) * strength * alpha` exactly once during the registered hex-target force. Use `hexStrength.mutable` until `unchangedAssignmentEpochs >= stableAssignmentEpochs`; use `hexStrength.stable` from that boundary until center lock or any assignment/control reset. Controlled leaves receive no hex-target velocity update while fixed.
- Controlled-fixed leaves keep command `fx/fy`, remain repulsive, and cannot converge.
- After three unchanged assignment epochs and center-error thresholds pass, freeze assignments and enable automatic `fx/fy` at assigned centers for the next numbered tick.
- D3 integration sets exact `x/y` center values and zero leaf velocity inside that tick.
- Continue numbered ticks while anchors settle; each terminal-quality step must retain exact leaf-center equality.
- Finalization never assigns, rounds, snaps, projects, or moves nodes.

Before center lock, target error includes every leaf and no anchors. For each leaf, subtract its assigned center from current full-precision position, divide both components by adjacent-cell spacing, quantize each component to `decisionQuantizationStep`, and compute Euclidean magnitude. Maximum target error is the largest magnitude; RMS target error is `sqrt(sum(magnitudeSquared) / leafCount)`. Quantize max and RMS to `decisionQuantizationStep` before inclusive threshold comparison. Controlled-fixed leaves prevent convergence, so target gates are evaluated only when none are controlled. Terminal target error is exact zero from authoritative stored center values.

## Convergence

A cooling step passes only when:

- `coolingStep >= 32`;
- no controlled-fixed leaf exists;
- assignments are frozen after at least three unchanged epochs;
- every leaf exactly equals its stored assigned center;
- centered max/RMS node movement are `<=0.06`/`<=0.01` cell spacings.

Movement compares the current completed numbered tick with the immediately preceding numbered tick and includes every leaf and anchor. Compute the leaf-centroid translation delta between those two states, subtract that same delta from each node's displacement, divide residual components by adjacent-cell spacing, and quantize each component to `decisionQuantizationStep`. Maximum movement is the largest residual magnitude. RMS movement is `sqrt(sum(residualMagnitudeSquared) / totalNodeCount)`. Quantize max and RMS to `decisionQuantizationStep` before inclusive threshold comparison; simulation coordinates themselves remain full precision.

Eight consecutive passes settle the epoch. Any failed condition resets the streak. At cooling step 256, evaluate terminal conditions first: a completing eighth pass converges on step 256; otherwise that same step produces `NOT_CONVERGED`. Held command ticks do not consume cooling steps.

## Control Contract

```js
set-fixed-position: { requestId, commandSeq, entityId, x, y }
release-fixed-position: { requestId, commandSeq, entityId }
```

Rules:

- Validate request, force-session state (`settled`, `held`, or `cooling`), strictly increasing sequence, stable leaf identity, action, finite coordinates, and fractional axial distance `<=maxGridRadius` before enqueue. Scene pre-commit gating belongs exclusively to worker/runner because the force session does not own scene-commit state.
- Apply queued commands in sequence order after any outstanding frame acknowledgement and before the next tick.
- For the expected next sequence on the active request, semantic rejection such as invalid coordinates, non-leaf identity, already-released state, or ineligible phase advances only the processed-sequence watermark; it does not mutate force state, accepted transcript/watermark, tick count, or RNG state, so the next runner sequence remains processable. Duplicate, gapped, wrong-request, structurally malformed, failed-session, or disposed-session messages advance no watermark.
- First zero-to-one fixation starts a new epoch, clears automatic locks, resets alpha/streak/assignment stability, and sets epoch step 0.
- A valid zero-to-one fixation during interaction cooling cancels that cooling attempt, increments the epoch, clears automatic locks, resets alpha/streak/assignment stability, and enters held before its command-boundary tick.
- While held, one tick follows each accepted command boundary; global step increments, cooling step does not.
- Final release resets alpha/streak and cooling step to 0; the next automatic tick is cooling step 1.
- No accepted command is coalesced. A future UI may coalesce before submission.

Canonicalize accepted set-position coordinates as `Math.round(value / decisionQuantizationStep) * decisionQuantizationStep` before storage/transcript use. Convert canonical plane coordinates through the centralized inverse hex transform, quantize fractional `q` and `r` with the same rule, derive `s = -q - r`, and define fractional axial radius as `max(abs(q), abs(r), abs(s))`. Accept the inclusive `<= maxGridRadius` boundary and reject larger values without force-state mutation.

## Deterministic Transcript

Record accepted commands as action, sequence, stable leaf ID, normalized coordinates, applied-after global step, and epoch. Identical input/config/transcript reproduces global frames, assignment revisions, alpha/streak trace, epoch settlements, and results. No-command traces/results remain identical to the baseline implementation.

## Settled Retention

Settled state retains full-precision nodes, links, assignments, force internals, alpha schedule state, and command counters. It executes no ticks, RNG reads, timer, or autonomous message. `serializeSettledResult()` is repeatable and non-mutating. `dispose()` is idempotent and makes every later control invalid.

## Required Evidence

- Assignment remains unique at step 0, every epoch, every frame, and terminal state.
- Target changes affect the following tick without changing positions at assignment commit.
- Terminal full-precision leaf and assigned center use the same authoritative value; transport, rendered tower, and leaf spring source use `Math.fround` of that value. `anchorOutputQuantizationStep` applies only to serialized anchor axial endpoints and never alters leaf centers.
- A fixed leaf repels at least one unpinned neighbor.
- Held commands block convergence/budget consumption; final release receives a fresh full budget.
- Ten-run no-command and accepted-transcript replay are deterministic.
