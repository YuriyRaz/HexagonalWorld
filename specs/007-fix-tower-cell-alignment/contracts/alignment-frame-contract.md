# Tower-to-Cell Alignment Contracts

## Force Frame Contract

Every `ready`, `step`, and terminal frame carries both continuous simulation positions and authoritative leaf cell assignments.

```js
{
  requestId,
  globalStep,
  epoch,
  epochStep,
  coolingStep,
  positions: Float32Array, // [x0, z0, x1, z1, ...] in topology node order
  leafCells: Int16Array,  // [q0, r0, q1, r1, ...] in topology leaf order
  assignmentRevision,
  assignmentHash,
  unchangedAssignmentEpochs,
  stableStreak,
  maxMovement,
  rmsMovement,
  maxTargetError,
  rmsTargetError,
  appliedCommandSeq,
  terminal,
  result
}
```

Topology leaf order is `nodeIds` filtered by matching `nodeKinds[index] === 'leaf'`. No renderer may infer an authoritative cell from `positions`.

### Frame Validation

- Request identity matches the active request.
- Global steps are contiguous; epochs never move backward.
- `positions` is a `Float32Array` of exactly two values per topology node, with finite values.
- `leafCells` is an `Int16Array` of exactly two values per topology leaf.
- Every cell satisfies the exact inclusive fixed-radius predicate `R(q, r) = max(abs(q), abs(r), abs(-q-r)) <= 256`, and no two leaves share a cell.
- Assignment revision is monotonic and the assignment hash matches canonical leaf identity and cell order.
- Terminal placements match `leafCells` by entity identity and coordinates.
- Validation completes before callbacks or scene mutation.

## Transfer Ownership Contract

At most one presentation frame is outstanding. The worker transfers both array buffers; the presentation receipt returns the exact same identities.

```js
{
  requestId,
  globalStep,
  positionBuffer,
  cellBuffer
}
```

`painted` and `suppress` receipts return both buffers. A missing, detached, substituted, incorrectly sized, stale, duplicate, or mismatched buffer fails the request and releases the session. Returned storage is reused for the next frame rather than allocated per step.

Terminal final-only settlement uses a dedicated validated snapshot. If the existing retained-session commit handshake is used, commit confirmation returns both exact terminal buffers. Cancellation or failed construction releases main-side ownership and terminates the request without requiring a return transfer.

## Presentation Mode Contract

### `all-steps`

- Deliver a valid step-zero assignment and continuous monotonically numbered frames.
- Resolve initial orchestration from the valid step-zero assignment, never fabricated duplicate placements.
- Assignment changes appear atomically from old cell center to new cell center without horizontal interpolation.
- Normal convergence updates status but does not recreate the island or replay the same global step.
- Supersession prevents all later callbacks from mutating the replacement scene.

### `final-only`

- Perform the same deterministic calculation and assignment decisions.
- Do not invoke live `onReady` or intermediate `onStep` presentation.
- Deliver one validated terminal settlement for detached stable construction.
- Keep the previous valid world visible until the aligned candidate commits.
- Final assignments must equal those produced by normal calculation for the same inputs.

## Renderer Contract

`createLiveIsland` and `applyStep` consume validated frame assignments as follows:

1. Validate the entire next frame and prepare derived centers without mutating visible objects.
2. For every leaf, derive `x/z` from `q/r` using the centralized axial-to-plane mapping.
3. Update tower matrix and `{ entityId, q, r, x, z }` metadata together.
4. Use the same displayed center for every spring endpoint whose topology node is a leaf; anchor endpoints may use `positions`.
5. Set occupied-cell keys to exactly the assignment keys and update empty-cell visibility in the same commit.
6. Mark changed buffers and bounds once after all records are coherent.

If assignment revision is unchanged, tower transforms and occupancy are retained. Required continuous anchor spring updates may still be applied from `positions`.

Any invalid frame, stale identity, duplicate cell, or derivation failure leaves the previous visible state unchanged.

## Grid Resource Contract

- One island owns the empty-grid geometry, material, mesh capacity, metadata, and interaction registration.
- Assignment changes update occupancy without creating geometry or material.
- Viewport changes are throttled and update reusable instance storage.
- Capacity replacement, when unavoidable, updates interaction references atomically and disposes old GPU resources exactly once.
- Island retirement, rebuild, cancellation, and disposal release every owned resource and listener exactly once.

## Stable and Static Contract

- Flat, nested, and packed layouts continue to map integer placements directly through the same axial-to-plane conversion.
- A stable force result must have terminal placements equal to terminal `leafCells` and displayed centers.
- Occupied and empty hexagons retain the same six-segment orientation; footprint styling is unchanged by this feature.

## Test Observability Contract

When `?testDiagnostics=1` is enabled, expose copied alignment state without transferring or mutating production buffers:

```js
{
  requestId,
  globalStep,
  epoch,
  assignmentRevision,
  assignmentHash,
  towers: [{ entityId, q, r, x, z }],
  occupiedCells: ['q,r'],
  springPositions: [],
  resourceCounts: { geometries, materials, meshes }
}
```

The seam is absent in normal production use. Geometry assertions are authoritative; screenshots supplement orientation and perceived alignment checks.
