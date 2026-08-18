# Data Model: Fix Tower-to-Cell Alignment

This feature adds no persisted business data. The model describes request-scoped calculation and presentation state.

## Canonical Topology

Represents deterministic entity and relation order for one layout request.

### Fields

- `requestId`: Positive request identity used to reject stale messages.
- `nodeIds`: Ordered, unique stable entity IDs.
- `nodeKinds`: Parallel values of `leaf` or `anchor`.
- `relations`: Ordered source/target node indexes and stable relationship IDs.
- `leafOrder`: Derived indexes where `nodeKinds[index]` is `leaf`; not transported separately.

### Validation

- Node arrays have equal length and unique, nonempty IDs.
- Every relation index is an integer in range and every relationship ID is unique.
- Leaf order is derived once and remains unchanged for the request.

## Force Frame

Represents one numbered calculation state and its complete visible assignment authority.

### Fields

- `requestId`: Must equal the active topology request.
- `globalStep`: Contiguous nonnegative frame number.
- `epoch`, `epochStep`, `coolingStep`: Deterministic session progress counters.
- `positions`: `Float32Array` containing X/Z simulation positions for every topology node.
- `leafCells`: `Int16Array` containing `(q, r)` pairs in canonical leaf order.
- `assignmentRevision`: Nonnegative integer incremented only when at least one leaf assignment changes.
- `assignmentHash`: Deterministic hash of ordered entity-to-cell assignments.
- Convergence metrics and control watermark: Existing deterministic session diagnostics.
- `terminal`: Existing terminal state for final-only completion or failure; normal continuous presentation treats convergence as status rather than a repeated numbered terminal frame.
- `result`: Present only when required by terminal settlement.

### Validation

- `positions.length` equals `nodeIds.length * 2`; all values are finite.
- `leafCells.length` equals `leafOrder.length * 2`.
- Every `q` and `r` is finite, whole-number, and satisfies the exact inclusive fixed-radius predicate `R(q, r) = max(abs(q), abs(r), abs(-q-r)) <= 256`; each `(q, r)` key is unique.
- `assignmentHash` equals the hash recalculated from canonical leaf IDs and `leafCells`.
- The request, epoch, and global step follow the active session without gaps or stale replacement.
- A terminal result contains one placement per leaf, in canonical identity order, and each placement equals the corresponding `leafCells` pair.

## Hex Cell Assignment

Associates one leaf tower with one authoritative visible cell for a frame.

### Fields

- `entityId`: Stable leaf entity ID.
- `q`, `r`: Whole-number axial coordinates.
- `x`, `z`: Derived world center from the centralized axial-to-plane mapping.
- `revision`: Assignment revision at which this association became current.

### Relationships

- Exactly one assignment belongs to each leaf in a valid force frame.
- Exactly one leaf occupies each cell in a valid force frame.
- A tower presentation record derives from one assignment.
- Grid occupancy contains exactly the set of assignment cell keys.

## Tower Presentation Record

Represents the renderer metadata for one visible tower instance.

### Fields

- `entityId`: Stable identity matching topology and visual payload.
- `q`, `r`: Current authoritative cell.
- `x`, `z`: Current cell center.
- `y`, `depth`, `height`: Existing vertical visual values.
- `payload`: Existing selection and detail payload.

### Validation

- `x/z` equal the centralized conversion of `q/r` within the established floating-point representation.
- Entity identity and instance order remain stable for the life of the island.
- Horizontal fields update together only after a full frame passes validation.

## Visible Layout State

Represents one coherent scene state after a frame has been applied.

### Fields

- Request, epoch, global step, assignment revision, and assignment hash.
- Ordered tower presentation records.
- Occupied-cell key set.
- Spring vertex data.
- Grid viewport radius and reusable resource capacity.

### Invariants

- Every tower is centered on the cell stored in its metadata.
- Occupied-cell keys equal tower cell keys with no duplicates.
- Every leaf spring endpoint equals its displayed tower center.
- Camera and viewport changes do not alter tower world coordinates or assignments.
- Invalid or stale frames cause no partial mutation.

## State Transitions

### Normal Motion

```text
starting
  -> ready with valid step-zero assignments
  -> continuous aligned frames
  -> assignment revision: atomically move affected towers cell-to-cell
  -> convergence status: retain live island and monotonic frame sequence
  -> cancelled, superseded, rebuilt, or disposed
```

### Reduced Motion

```text
starting with prior valid world retained
  -> calculation with ready/intermediate presentation suppressed
  -> validated terminal assignment and result
  -> build detached aligned candidate
  -> atomic commit and dispose replaced world
```

Any validation, calculation, or construction failure transitions to cleanup while preserving the prior valid or empty usable world.
