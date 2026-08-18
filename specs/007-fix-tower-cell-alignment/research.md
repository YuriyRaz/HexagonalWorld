# Research: Fix Tower-to-Cell Alignment

## Decision 1: Make Assigned Cells the Presentation Authority

**Decision**: Render each force-layout leaf tower from its current unique integer axial assignment, while keeping continuous simulation positions internal to force behavior and available for anchor presentation.

**Rationale**: The force session already maintains deterministic `assignedQ` and `assignedR` values and updates assignments atomically. Live frames currently publish only continuous node positions, and the renderer copies those positions directly into tower matrices. Exact center equality is enforced only after terminal center lock, which explains why the screenshot shows towers between cells during motion.

**Alternatives considered**:

- Independently round each rendered position to a nearest cell. Rejected because multiple towers can round to one cell and the renderer can disagree with the worker's assignment.
- Force simulation nodes onto cell centers after every tick. Rejected because it changes force dynamics, velocity, collision behavior, and convergence rather than fixing presentation authority.
- Hide all normal force motion. Rejected because continuous force feedback remains an established normal-motion behavior.

## Decision 2: Add Explicit Leaf Assignments to the Frame Protocol

**Decision**: Add `leafCells: Int16Array` to ready, step, and terminal force frames. It stores `(q, r)` pairs in canonical topology leaf order.

**Rationale**: Explicit coordinates let runner validation and rendering use the same authority without inverse conversion. The existing maximum grid radius is 256, safely within signed 16-bit range. A 500-tower frame adds only 2,000 bytes, and exact transfer receipts allow storage reuse rather than per-frame allocation.

**Alternatives considered**:

- Replace leaf entries in the position buffer with cell centers. Rejected because it conflates simulation and presentation coordinates and omits explicit cell identity.
- Send assignments only when the revision changes. Rejected for the initial implementation because stateful omission complicates stale-frame validation and atomic recovery more than the small full snapshot costs.
- Send arrays of objects. Rejected because they allocate heavily and are less suitable for transfer and exact-size validation.

## Decision 3: Update All Visible Cell State Atomically

**Decision**: A validated assignment snapshot drives tower matrices, tower `q/r/x/z` metadata, leaf spring endpoints, occupied-cell keys, and empty-grid visibility in one presentation update.

**Rationale**: Current force rendering uses raw positions for towers and springs, then independently converts tower positions back to axial space with separate `Math.round` operations every fifth step. That conversion is not the canonical cube-corrected rounding operation, can produce duplicate occupancy, and allows grid state to lag tower motion. One snapshot removes those inconsistencies.

**Alternatives considered**:

- Update towers every frame but retain periodic occupancy rebuilding. Rejected because a visible tower and hidden cell could disagree for four frames.
- Animate between old and new cell centers. Rejected because every intermediate horizontal position violates the every-visible-frame invariant.

## Decision 4: Preserve Continuous Normal Motion and Use Final-Only Reduced Motion

**Decision**: In normal mode, assignment revisions appear as deterministic discrete center-to-center changes while force frames continue with monotonically increasing global steps. In reduced-motion mode, suppress ready and intermediate presentation and commit only one validated aligned terminal state.

**Rationale**: This preserves the established continuous force visualization for normal motion while satisfying the current specification and constitution requirement to avoid unnecessary motion. The present worker replays the same terminal global step after convergence, which violates runner contiguity, and it ignores its `final-only` presentation option. The lifecycle must distinguish continuous presentation from final-only completion.

**Alternatives considered**:

- Stop and replace the live island at normal convergence. Rejected because it reintroduces transition risk and conflicts with continuous force presentation.
- Continue reduced-motion animation because an earlier feature requested it. Rejected because the active specification and project constitution explicitly require reduced-motion suppression.
- Resolve normal mode with fabricated all-origin placements at ready. Rejected because duplicate cells violate the layout contract and cannot be authoritative state.

## Decision 5: Reuse Grid and Frame Resources

**Decision**: Reuse one island-owned grid geometry/material and mutable instance storage; update occupancy only when assignment revision or viewport coverage changes. Reuse both transferred frame buffers through exact receipts.

**Rationale**: The current force path rebuilds empty-grid geometry, material, mesh, and metadata every fifth frame and on viewport updates. Removed resources remain registered in the ownership ledger until island disposal. Long-running force mode therefore risks allocation spikes and resource growth. Reuse is required by the 60-update target and ownership rules.

**Alternatives considered**:

- Keep rebuilding and explicitly unregister every resource. Rejected because it still performs unnecessary GPU/resource allocation during live use.
- Render occupied grid cells underneath towers to avoid occupancy updates. Rejected because it changes the established visual contract that towers replace occupied tiles.

## Decision 6: Validate at Calculation, Transport, Rendering, and Browser Boundaries

**Decision**: Add deterministic frame tests, worker/runner protocol tests, renderer coherence/resource tests, browser acceptance scenarios, and an alignment-aware performance check.

**Rationale**: The defect crosses module boundaries. Unit tests can prove integer uniqueness and exact coordinate mapping; protocol tests can prove stale or malformed snapshots never reach rendering; renderer tests can prove atomic matrix/spring/grid state; browser tests can cover camera, viewport, reduced motion, and rapid switching.

**Alternatives considered**:

- Screenshot-only testing. Rejected because it is fragile and cannot identify whether calculation, transport, metadata, or rendering diverged.
- Reuse only broad layout benchmarks. Rejected because existing benchmarks do not assert every-frame alignment or the 500-tower/2,000-cell 60-update target.

## Resolved Technical Findings

- Static layouts already use integer placements and the shared `axialToPlane` mapping; they need regression coverage, not redesign.
- Occupied and empty cells already use the same six-sided geometry orientation; geometry rotation is not the cause.
- Force terminal validation already compares final leaf positions with assigned centers; the missing invariant is live-frame assignment transport and presentation.
- Selection expects cell coordinates, but force instance metadata currently omits `q/r`; the authoritative snapshot supplies them.
- No new dependency or persisted data is required.
