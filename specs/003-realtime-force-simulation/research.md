# Research: Realtime Force Simulation Visualization

## Decision 1: Put Unique Cell Ownership Inside The Force Session

**Decision**: Every leaf starts with and retains one unique assigned cell throughout evolution. Assignment may change only at deterministic epochs and influences subsequent movement through a custom hex-target force.

**Rationale**: This makes cell grouping part of the graph physics and ensures the equilibrium state users watch is the state that commits. A post-convergence assignment would create a different final graph and violate the clarified goal.

**Alternatives considered**:

- Post-convergence projection was rejected because it causes a hidden state change/snap.
- Fixed initial assignments were rejected because force evolution would not determine final placement.
- Per-step nearest-cell rounding was rejected because it cannot ensure uniqueness.

## Decision 2: Use Bounded Deferred Acceptance Every Four Steps

**Decision**: At every fourth cooling step, rank a radius-three canonical neighborhood plus the protected previous cell and atomically resolve conflicts with deferred acceptance.

**Rationale**: At most 38 candidates per leaf bounds work, previous-cell fallback guarantees a complete option, and deterministic holder/tie rules preserve uniqueness without stable-ID serial greediness.

**Alternatives considered**:

- Serial nearest-free assignment was rejected for ordering bias.
- Global optimal matching was rejected for unnecessary maximum-scale complexity.
- Assignment every tick was rejected for cost and target jitter.

## Decision 3: Reuse Arrays And Encoded Cells

**Decision**: Precompute canonical offsets, encode bounded cells numerically, and reuse candidate/owner/holder/queue arrays. Keep only revision, counts, and a deterministic assignment hash in production frames.

**Rationale**: A maximum run can evaluate millions of proposals. Per-epoch strings/objects/history would violate allocation and scale goals.

**Alternatives considered**:

- Full production assignment history was rejected; opt-in tests may record it.
- Shared memory was rejected because ordinary reusable worker arrays are sufficient.

## Decision 4: Restore Repulsion For Leaves And Anchors

**Decision**: Apply configured many-body strength to every simulation node, including fixed leaves.

**Rationale**: A zero-strength leaf contributes no repulsive field, so a future dragged/fixed tower cannot push neighbors like D3 demos. Fixed nodes still participate in the many-body quadtree even when their own velocity is discarded.

**Alternatives considered**:

- Anchor-only repulsion was rejected as incompatible with the approved extension goal.
- A new collision force is deferred until measured overlap shows a need.

## Decision 5: Lock Exact Centers Inside Numbered Ticks

**Decision**: After three unchanged assignment epochs and center-error gates pass, freeze assignments and enable automatic leaf center locks for the next numbered D3 tick. Continue numbered ticks until eight terminal-quality steps pass.

**Rationale**: Finite attraction cannot guarantee exact equality. D3's fixed-position integration sets full-precision coordinates exactly during the tick, so terminal worker state, frame, tower, spring source, and placement agree without final mutation.

**Alternatives considered**:

- Serialization-time snapping was rejected as a hidden projection.
- Approximate final equality was rejected by FR-006b/SC-013.
- Unnumbered lock ticks were rejected by contiguous step accounting.

## Decision 6: Combine Assignment, Target, And Movement Convergence

**Decision**: Require minimum step 32, three unchanged real assignment epochs, exact leaf-center equality, no controlled-fixed leaves, maximum/RMS centered movement <=0.06/0.01 cell spacings, and eight consecutive passing steps; fail after the local cooling budget reaches 256.

**Rationale**: Movement-only convergence can terminate while targets churn or towers remain between cells. Combined metrics define the actual equilibrium visible to users.

**Alternatives considered**:

- Alpha/velocity alone were rejected because they do not prove assignment or displayed equilibrium.
- Wall-clock convergence was rejected as nondeterministic.

## Decision 7: Keep One Step Per Logical Paint

**Decision**: Normal motion alternates one exact paint acknowledgement with one D3 tick and permits no sequence gaps. Reduced motion uses the same kernel without intermediate presentation.

**Rationale**: This matches the requested D3-style evolution and preserves control responsiveness through worker calculation.

**Alternatives considered**:

- Worker batching/coalescing was rejected because it hides evolution.
- Main-thread ticking was rejected because large steps can block controls.

## Decision 8: Retain The Successful Request-Scoped Worker

**Decision**: Initial success settles the operation but not its worker session. After final island commit confirmation, the worker becomes retained-settled, idle, and command-eligible.

**Rationale**: Reconstructing from quantized visible cells loses full-precision anchors, assignment internals, alpha, and D3 state. Retention provides exact continuation selected by the user.

**Alternatives considered**:

- Immediate termination was rejected by FR-014.
- An application-global persistent worker was rejected; only the authoritative request is retained and every replacement destroys it.

## Decision 9: Separate Operation Settlement From Session Destruction

**Decision**: `runLayout()` retains its final Promise contract. Success clears the active guard and enters pending commit; commit confirmation enables controls. Failure/cancellation/replacement/commit failure/page teardown destroys worker/listeners/deferreds exactly once.

**Rationale**: Scene commit can still fail after worker convergence. Commands must not mutate a session whose result never became authoritative.

**Alternatives considered**:

- Enabling commands at worker success was rejected because the scene may not match yet.
- Keeping the safety timer armed while retained was rejected because idle is not a hang.

## Decision 10: Add Only Two Domain-Neutral Controls

**Decision**: Accept ordered `set-fixed-position` and `release-fixed-position` commands by stable leaf ID and finite simulation-plane coordinates, applied between ticks. Reject invalid commands without state mutation.

**Rationale**: These map to D3's `fx/fy` mechanism and are sufficient for future drag without admitting pointer, camera, DOM, or rendering concerns.

**Alternatives considered**:

- Drag-specific begin/move/end messages were rejected as UI coupling.
- A general arbitrary force mutation API was rejected as unsafe and unnecessary.

## Decision 11: Use Deterministic Interaction Epochs

**Decision**: The first fixed command starts an epoch and resets alpha/stability; while held, one tick occurs per accepted command boundary and cooling budget does not advance; final release resets alpha/stability and starts a fresh 256-step cooling budget. Global step never resets.

**Rationale**: Neighbor response remains observable/deterministic during a long hold without free-running background work. Release receives a complete convergence opportunity.

**Alternatives considered**:

- Continuing cooled alpha was rejected because neighbors may not respond.
- Free-running while held was rejected because user-held duration would consume budget and resources nondeterministically.
- Restarting the original dataset was rejected because exact retained state was selected.

## Decision 12: Preserve Every Accepted Command Boundary

**Decision**: Runner assigns monotonic command sequences; worker queues accepted controls FIFO and reports `appliedAfterGlobalStep`. Do not coalesce after runner acceptance. Future UI may coalesce pointer samples before submission.

**Rationale**: Fix/release transitions own epochs and budgets. Dropping an accepted transition would alter deterministic semantics.

**Alternatives considered**:

- Worker latest-wins coalescing was rejected because release/set order can change epochs.
- Wall-clock ordering was rejected; replay uses accepted step boundaries.

## Decision 13: Rebuild Stable Resources Without Moving Towers

**Decision**: A normal stable island may replace provisional GPU resources after terminal validation, but every leaf transform and leaf spring source must equal the terminal frame. The retained session already contains those exact center coordinates.

**Rationale**: Static grid/empty-cell resources may differ, but final reconstruction must not alter the equilibrium or create dual worker/display state.

**Alternatives considered**:

- Reusing/resizing every provisional resource was rejected as avoidable complexity.
- Any stable-position projection was rejected.

## Decision 14: Keep Current UI Semantics Unchanged

**Decision**: Implement the command seam and tests only. Left drag/touch remains camera control, click remains selection, and no accessible manipulation action is exposed.

**Rationale**: Pointer arbitration, previews, direct-manipulation latency, reduced-motion dragging, and keyboard equivalence require their own approved feature.

**Alternatives considered**:

- Partial pointer dragging was rejected as inaccessible and scope-expanding.

## Decision 15: Validate Retained Ownership Explicitly

**Decision**: Require exactly one idle retained worker after successful force commit, zero autonomous ticks/messages/timers, and exactly-once release on mode switch, rebuild, supersession, commit failure, worker failure, `pagehide`, or disposal. Repeated cycles must show no resource growth.

**Rationale**: Retention is intentional resource ownership and must not become an unbounded leak.

**Alternatives considered**:

- Idle timeout was rejected because the user explicitly chose retention until mode/request lifecycle ends.

## Sources

- Current implementation and tests under `src/` and `tests/`
- Prior assignment design under `specs/001-force-directed-layout/`
- Latest clarified feature specification in `specs/003-realtime-force-simulation/spec.md`
- [d3-force simulation](https://d3js.org/d3-force/simulation)
- [d3-force many-body](https://d3js.org/d3-force/many-body)
- [MDN Worker termination](https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate)
- [MDN transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
- [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
