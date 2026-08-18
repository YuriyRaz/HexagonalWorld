---

description: "Task list for fixing tower-to-cell alignment"
---

# Tasks: Fix Tower-to-Cell Alignment

**Input**: Design documents from `/specs/007-fix-tower-cell-alignment/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/alignment-frame-contract.md`, `quickstart.md`

**Readiness**: The requirement is Approved under the explicit remediation authorization, and the implementation plan's constitution gates are PASS.

**Validation**: Automated tests are required because this is a deterministic layout regression and changes reusable worker/renderer contracts. Browser scenarios are required for visible motion, responsive camera behavior, keyboard interaction, reduced motion, and every profile in the support matrix. Performance tests MUST fail when either the 60-update/sec or 1,000 ms budget is exceeded. Every implementation must pass `npm run build`.

**Support matrix coverage**: Validate `flat`, `nested`, `packed`, and `force-anchors`; orbit rotate, pan, zoom/dolly, and Reset view; `desktop-chromium` 1024x720/DPR 1 keyboard-pointer, `phone-chromium` 360x800/DPR 1 touch, `tablet-chromium` 768x1024/DPR 1 touch, `visual-desktop-chromium` 1440x900/DPR 1, and `visual-mobile-chromium` 390x844/DPR 3 touch; bundled Playwright 1.61.1 Chromium with WebGL/module-worker support; and the Windows 11 x64, Intel Core i7-1360P, 32 GB, AC-power, hardware-accelerated-WebGL, no-throttling reference benchmark condition with 500 rendered leaf Towers and approximately 2,000 visible cells.

**Organization**: Tasks are grouped by user story. Shared force-frame transport is a blocking foundation; story phases then remain independently testable in priority order.

## Format: `[ID] [P?] [Story/QR] Description`

- **[P]**: Can run in parallel because it edits a different file and has no dependency on an incomplete task in the same phase.
- **[Story/QR]**: Maps implementation and validation to `US1`, `US2`, or `US3`, or to a quality requirement such as `QR-002`, `QR-003`, or `QR-005` from `spec.md`.
- Every task includes an exact repository-relative file path.

## Phase 1: Setup (Shared Test Infrastructure)

**Purpose**: Establish representative and boundary fixtures used by protocol, renderer, browser, and performance validation.

**Traceability**: T001 covers FR-004, FR-007, FR-012, QR-002, QR-003, and QR-005.

- [X] T001 Add canonical empty, single-rendered-leaf-Tower, conflicting-cell, negative-coordinate, exact `R=256`, invalid `R>256`, non-integer/non-finite, 500-rendered-leaf-Tower, approximately 2,000-cell, and repeatability fixtures for alignment checks in tests/fixtures/hierarchies.js

---

## Phase 2: Foundational (Blocking Frame Contract)

**Purpose**: Carry one validated authoritative cell snapshot through the force session, worker, and runner before any renderer story consumes it.

**Traceability**: T002-T007 cover FR-004, FR-007, FR-010, FR-011, FR-012, QR-002, and QR-005.

**CRITICAL**: Complete this phase before user-story implementation. Write the regression tests first and confirm they fail for the expected missing-contract reason.

### Foundational Validation

- [X] T002 [P] Add failing force-session contract tests for canonical-order Int16Array leafCells, the exact inclusive `R(q,r) <= 256` predicate, uniqueness, assignment hashes, exact terminal-placement equality, and rejection of non-integer/non-finite/out-of-bound assignments in tests/force-session-v2.test.js
- [X] T003 [P] Add failing worker contract tests for dual position/cell buffer transfer, exact painted/suppress receipts, malformed buffer rejection, reusable ownership, and cancellation during active calculation with session, outstanding-buffer, and listener cleanup in tests/layout-worker.test.js
- [X] T004 [P] Add failing runner contract tests for leafCells type/length/bounds/uniqueness/hash validation, rejection before presentation callbacks, and cancellation during active calculation with timer/worker cleanup and no rollback violation in tests/layout-runner.test.js

### Foundational Implementation

- [X] T005 Publish canonical-order reusable leafCells snapshots for rendered leaf Towers from initial, step, trace, and terminal force frames without changing simulation coordinates or assigning cells to Layout Anchors in src/force-layout.js
- [X] T006 Transfer and reclaim exact position and cell buffers for ready, step, suppress, and terminal worker messages with typed cleanup on failure or active-calculation cancellation in src/layout-worker.js
- [X] T007 Validate complete cell snapshots and dual-buffer presentation receipts before callbacks, validate terminal leafCells against result placements, and preserve the prior state when cancellation interrupts validation or construction in src/layout-runner.js

**Checkpoint**: Force frames expose one deterministic assignment authority, malformed snapshots cannot reach rendering, and reusable buffer ownership is explicit.

---

## Phase 3: User Story 1 - Towers Centered on Assigned Cells (Priority: P1) MVP

**Goal**: Make every initial or settled rendered leaf-Tower footprint center, cell metadata, occupied-cell state, and hex orientation agree with its authoritative assignment; internal entities remain non-rendered Layout Anchors.

**Independent Test**: Render static layouts plus initial and stable force states, then assert every rendered leaf-Tower matrix X/Z equals `axialToPlane(q, r)`, every occupied key matches Tower metadata, Layout Anchors have no Tower assignment, geometry orientation matches the grid, and 20 identical runs produce identical complete visible sequences.

### Validation for User Story 1

- [X] T008 [P] [US1] Add failing initial/stable force-island tests for exact rendered leaf-Tower center matrices, q/r/x/z instance metadata, occupied-grid exclusion, shared six-segment orientation, Layout Anchor non-assignment, and invalid-frame no-allocation behavior in tests/island.test.js
- [X] T009 [P] [US1] Add 20-run deterministic assertions that compare the complete ordered visible frame/transition sequence, assignment revisions, cells, and derived centers (not only final assignments) while covering origin, negative, and radius-256 cells in tests/force-layout.test.js
- [X] T010 [P] [US1] Add a settled-layout browser scenario for exact rendered leaf-Tower/cell centers and selection coordinates across `flat`, `nested`, `packed`, and stable `force-anchors` inputs in the desktop, phone, and tablet profiles in tests/app.spec.js

### Implementation for User Story 1

- [X] T011 [US1] Derive initial and stable force rendered leaf-Tower transforms, q/r/x/z metadata, occupied-cell keys, and leaf spring centers from leafCells through axialToPlane in src/island.js
- [X] T012 [US1] Reject duplicate, non-integer, non-finite, out-of-radius (`R(q,r) > 256`), hash-mismatched, and terminal-placement-mismatched force assignments before allocating or mutating stable scene resources in src/island.js
- [X] T013 [US1] Expose selected rendered leaf-Tower cell coordinates and copied settled alignment diagnostics from authoritative force instance metadata, excluding Layout Anchors, in src/main.js

**Checkpoint**: User Story 1 passes independently for static, initial force, and settled force scenes for rendered leaf Towers without relying on free-space position rounding or assigning cells to Layout Anchors.

---

## Phase 4: User Story 2 - Alignment During Visible Motion (Priority: P2)

**Goal**: Keep rendered leaf Towers on unique cell centers through every normal-motion frame and suppress intermediate force presentation for reduced motion.

**Independent Test**: Capture every visible force frame from step zero through convergence and assignment changes; assert unique integer cells, exact rendered leaf-Tower centers, coherent leaf spring endpoints and occupancy, monotonic steps, no partial mutation on invalid input, explicit cleanup/rollback when cancellation interrupts active calculation, and no live intermediate island under reduced motion.

### Validation for User Story 2

- [X] T014 [P] [US2] Add failing applyStep tests for atomic cell-to-cell rendered leaf-Tower updates, leaf/anchor spring endpoints, same-frame occupancy, unchanged-revision reuse, and rollback after an invalid frame in tests/island.test.js
- [X] T015 [P] [US2] Add failing worker lifecycle tests for monotonic all-steps continuation after convergence, final-only suppression followed by one validated terminal settlement, and cancellation during active calculation that disposes the session and returns/releases outstanding buffers exactly once in tests/layout-worker.test.js
- [X] T016 [P] [US2] Add failing runner lifecycle tests for a valid step-zero result, final-only settlement, dual terminal-buffer ownership, stale request rejection, previous-state preservation, and cancellation during active calculation with no later callbacks, no timer/worker leak, and no partial scene commit in tests/layout-runner.test.js
- [X] T017 [P] [US2] Add @tower-cell-alignment browser scenarios for every displayed force frame, atomic assignment changes, spring/occupancy coherence, reduced-motion final-only behavior, and an interrupted active-calculation request that leaves the previous world usable in tests/app.spec.js

### Implementation for User Story 2

- [X] T018 [US2] Separate one-time convergence status from continuous frame numbering, reuse returned frame storage, and avoid repeated same-step terminal results in src/force-layout.js
- [X] T019 [US2] Preserve continuous all-steps delivery while implementing true ready/intermediate suppression, one terminal settlement for final-only presentation, and active-calculation cancellation cleanup in src/layout-worker.js
- [X] T020 [US2] Replace fabricated all-origin ready results with step-zero assignments and complete final-only settlement/cleanup without accepting stale frames or committing after active-calculation cancellation in src/layout-runner.js
- [X] T021 [US2] Validate each next frame before mutation and atomically update rendered leaf-Tower matrices, q/r metadata, leaf spring endpoints, occupied cells, bounds, and interaction state on assignment revisions in src/island.js
- [X] T022 [US2] Replace periodic empty-grid mesh reconstruction with reusable island-owned geometry, material, instance storage, and exact disposal for assignment updates in src/island.js
- [X] T023 [US2] Keep the live island for normal continuous motion, implement previous-world rollback and atomic final-only commit, trace displayed assignments rather than raw leaf positions, and clean up worker/listener/timer/buffer/candidate ownership when cancellation interrupts active calculation in src/main.js
- [X] T024 [US2] Run the focused unit and browser checks for visible-motion alignment and resolve failures in tests/island.test.js, tests/layout-worker.test.js, tests/layout-runner.test.js, and tests/app.spec.js

**Checkpoint**: User Story 2 passes independently; no sampled normal-motion rendered leaf Tower rests between cells, reduced motion presents only the aligned result, and active-calculation cancellation leaves no owned lifecycle residue.

---

## Phase 5: User Story 3 - Consistent Alignment Across Views and Layouts (Priority: P3)

**Goal**: Preserve the same world-space rendered leaf-Tower/cell mapping across all four layout modes, viewport changes, rotate/pan/zoom/reset camera operations, responsive profiles, edge states, and representative scale.

**Independent Test**: Exercise `flat`, `nested`, `packed`, and `force-anchors` on desktop, phone, and tablet; rotate/pan/zoom/reset and resize; switch modes rapidly; and test empty, single, invalid, negative, boundary, and 500-rendered-leaf-Tower/approximately-2,000-cell states while asserting zero world-space shifts, newest-request ownership, stable resource counts, and responsive interaction.

### Validation for User Story 3

- [X] T025 [P] [US3] Add viewport-radius, empty/single, negative/exact-boundary-coordinate, invalid-data rollback, grid-capacity, Layout Anchor non-assignment, and exact resource-disposal tests in tests/island.test.js
- [X] T026 [P] [US3] Add @tower-cell-alignment `desktop-chromium`/`phone-chromium`/`tablet-chromium` plus `visual-desktop-chromium`/`visual-mobile-chromium` scenarios for all four layout modes, camera rotation, pan, zoom/dolly, Reset view, resize, rapid layout switching, keyboard selection, touch operation, and newest-request alignment in tests/app.spec.js
- [X] T027 [P] [US3] Add repeated assignment, viewport, mode-switch, rebuild, and teardown assertions for stable geometry/material/mesh counts in tests/resource-profile.spec.js
- [X] T028 [P] [US3] Add a 500-rendered-leaf-Tower and approximately 2,000-cell alignment benchmark in tests/layout.benchmark.spec.js using the reference hardware condition and two warm-ups plus ten measured five-second windows; calculate complete visible updates per second and result-to-first-aligned-scene latency, and use hard assertions that every measured window is `>= 60` updates/sec and every measured latency is `<= 1,000 ms`

### Implementation for User Story 3

- [X] T029 [US3] Update reusable grid viewport coverage and capacity growth without changing tower world coordinates, and dispose replaced capacity exactly once in src/island.js
- [X] T030 [US3] Guard scheduled viewport updates, mode switches, diagnostics, selection restoration, and scene commits by current request identity in src/main.js
- [X] T031 [US3] Run the focused responsive, resource, and benchmark checks and resolve feature failures; the benchmark run MUST fail on any `< 60` visible-updates/sec window or any `> 1,000 ms` result-to-aligned-presentation latency in tests/app.spec.js, tests/resource-profile.spec.js, and tests/layout.benchmark.spec.js

**Checkpoint**: All three stories pass independently at every matrix profile and representative scale, with no stale scene replacement, resource growth, or Tower/Anchor model violation.

---

## Phase 6: Polish & Cross-Cutting Validation

**Purpose**: Reconcile documentation and execute all quality gates after the desired story scope is complete.

**Traceability**: T032 covers FR-001-FR-012 and QR-001-QR-005; T033 covers QR-002 and QR-005; T034 covers QR-004 and QR-005; T035 covers QR-003; T036 covers QR-004, QR-005, and the constitution build gate.

- [X] T032 [P] Reconcile implemented field names, ownership rules, lifecycle behavior, and validation commands with specs/007-fix-tower-cell-alignment/contracts/alignment-frame-contract.md and specs/007-fix-tower-cell-alignment/quickstart.md
- [X] T033 Run the complete deterministic and protocol suite with npm test and resolve feature regressions in tests/force-session-v2.test.js, tests/force-layout.test.js, tests/layout-worker.test.js, tests/layout-runner.test.js, and tests/island.test.js
- [X] T034 Run complete acceptance coverage with `npm run test:e2e` in the `desktop-chromium`, `phone-chromium`, `tablet-chromium`, `visual-desktop-chromium`, and `visual-mobile-chromium` profiles, covering camera rotation, pan, zoom/dolly, Reset view, resize, keyboard, touch, reduced motion, and resolve feature regressions in tests/app.spec.js
- [X] T035 Run `npm run benchmark:layout` plus the resource-profile Playwright scenario on the documented reference condition, record exact machine/browser/WebGL metadata and measured results in specs/007-fix-tower-cell-alignment/quickstart.md, and retain a failing result whenever any five-second window is below 60 visible updates/sec or any result-to-first-aligned-scene latency exceeds 1,000 ms
- [X] T036 Execute the manual desktop/mobile/reduced-motion scenarios and npm run build from specs/007-fix-tower-cell-alignment/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Phase 1 Setup
  -> Phase 2 Frame Contract
    -> Phase 3 US1 Centered Initial/Settled Towers
      -> Phase 4 US2 Aligned Visible Motion
        -> Phase 5 US3 View/Layout Consistency
          -> Phase 6 Cross-Cutting Validation
```

- **Setup (Phase 1)**: No dependencies; starts immediately.
- **Foundational (Phase 2)**: Depends on T001 and blocks all renderer stories.
- **US1 (Phase 3)**: Depends on the validated frame contract; this is the rendered leaf-Tower MVP.
- **US2 (Phase 4)**: Contract tests can be drafted after Phase 2, but renderer implementation depends on US1's authoritative initial/stable mapping.
- **US3 (Phase 5)**: Validation can be drafted after Phase 2, but viewport/resource implementation depends on the reusable renderer state completed by US1 and US2.
- **Polish (Phase 6)**: Depends on every user story selected for delivery.

### User Story Dependencies

| Story | Starts After | Completion Dependency | Independent Acceptance |
|-------|--------------|-----------------------|------------------------|
| US1 | Phase 2 | None | Static plus initial/stable force centers and deterministic repeats |
| US2 | Phase 2 tests; US1 implementation | US1 renderer authority | Every visible force frame and reduced-motion final-only result |
| US3 | Phase 2 tests; US1/US2 implementation | Reusable aligned renderer state | Camera, viewport, mode, edge-state, resource, and scale checks |

### Within Each User Story

1. Add the story's regression and contract tests and confirm expected failures.
2. Implement calculation/transport changes before their consumers.
3. Validate complete input before any renderer or scene mutation.
4. Complete unit tests before browser and performance checkpoints.
5. Stop at the story checkpoint and verify its independent acceptance criteria.

## Parallel Opportunities

- T002, T003, and T004 can run together after T001 because they edit separate contract-test files.
- T008, T009, and T010 can run together after Phase 2 because they edit separate US1 test files.
- T014, T015, T016, and T017 can run together before US2 implementation because they edit separate test files; the worker, runner, and browser cancellation cases are complementary and all must cover interruption during active calculation.
- T025, T026, T027, and T028 can run together before US3 implementation because they edit separate test and benchmark files.
- T032 can run alongside final test execution because it edits only feature documentation.
- Source tasks sharing `src/force-layout.js`, `src/layout-worker.js`, `src/layout-runner.js`, `src/island.js`, or `src/main.js` remain sequential to protect shared protocol and resource ownership.

## Parallel Example: User Story 1

```text
Task T008: Add initial/stable rendered leaf-Tower alignment tests in tests/island.test.js
Task T009: Add complete-sequence deterministic repeat tests in tests/force-layout.test.js
Task T010: Add settled-layout browser acceptance in tests/app.spec.js
```

## Parallel Example: User Story 2

```text
Task T014: Add atomic live rendered leaf-Tower tests in tests/island.test.js
Task T015: Add continuous/final-only and active-cancellation worker tests in tests/layout-worker.test.js
Task T016: Add lifecycle, stale-result, and active-cancellation runner tests in tests/layout-runner.test.js
Task T017: Add visible-frame, reduced-motion, and interrupted-request browser tests in tests/app.spec.js
```

## Parallel Example: User Story 3

```text
Task T025: Add viewport, edge-state, and leaf-Tower/Anchor renderer tests in tests/island.test.js
Task T026: Add responsive camera, profile, and mode-switch tests in tests/app.spec.js
Task T027: Add GPU resource stability tests in tests/resource-profile.spec.js
Task T028: Add representative alignment benchmark in tests/layout.benchmark.spec.js
```

## Implementation Strategy

### MVP First: User Story 1

1. Complete T001-T007 to establish the trusted assignment frame contract.
2. Complete T008-T013 to center initial and settled towers from the same assignment authority.
3. Stop and run the US1 independent test before expanding scope.
4. Note that the reported moving-force screenshot is fully addressed when US2 is also completed.

### Incremental Delivery

1. Setup + Foundation establishes deterministic assignment transport.
2. US1 establishes exact initial/settled tower, metadata, spring, and occupancy centers.
3. US2 extends the invariant to every visible frame and reduced-motion lifecycle.
4. US3 proves the invariant across camera, viewport, layout, stale-request, resource, and scale boundaries.
5. Polish runs the complete quickstart and mandatory build gate.

### Parallel Team Strategy

1. Complete T001 and the shared protocol implementation sequentially.
2. Parallelize only the marked test tasks across separate files.
3. Keep changes to worker/runner protocol and island resource ownership under one sequential integration owner.
4. Merge each story only after its checkpoint passes independently.

## Notes

- `[P]` means safe parallel work in a different file, not merely work that could be conceptually simultaneous.
- Every user-story task carries its story label; setup, foundation, and polish tasks use the explicit phase traceability statements above to map each task to functional or quality requirements.
- Do not infer cells from rendered free-space positions or add a second rounding authority.
- Do not interpolate towers horizontally between cells.
- Do not recreate geometry or material during normal frame updates.
- Preserve unrelated worktree changes and avoid editing generated `dist/` output.

## Phase 7: Convergence

- [X] T037 [CRITICAL] Replace per-frame `Float32Array`/assignment-map creation in `src/force-layout.js` and repeated live grid reconstruction in `src/island.js` with reusable frame buffers and island-owned grid capacity, disposing replaced GPU resources exactly once per Constitution III and QR-003 (contradicts)
- [X] T038 [HIGH] Transport canonical-order `Int16Array` leaf-cell snapshots with the position buffers through `src/force-layout.js` and `src/layout-worker.js`, reclaim both buffers through receipts, and validate complete type, length, uniqueness, hash, terminal, and exact-radius constraints in `src/layout-runner.js` per FR-004, FR-007, FR-011, FR-012, and plan: authoritative frame data (partial)
- [X] T039 [HIGH] Make `src/island.js` require one complete validated assignment snapshot and atomically derive every live and settled Tower transform, occupancy key, q/r metadata, orientation, and leaf spring endpoint from it without raw-position fallback or partial mutation per FR-001, FR-005, FR-008, and US1/AC1 (contradicts)
- [X] T040 [HIGH] Implement the all-steps and final-only terminal lifecycle in `src/layout-worker.js` and `src/layout-runner.js`, including step-zero assignments, intermediate suppression, monotonic frames, one validated terminal settlement, stale-frame rejection, active-calculation cancellation, and exact buffer release per FR-005, FR-006, QR-004, and QR-005 (missing)
- [X] T041 [HIGH] Commit validated initial and terminal force scenes through the retained-session protocol in `src/main.js`, preserving the prior world until atomic success and releasing candidate, worker, listener, timer, and buffer ownership on cancellation or failure per FR-010, QR-005, and plan: resource ownership (partial)
- [X] T042 [MEDIUM] Schedule request-guarded viewport coverage after resize and camera changes in `src/main.js` and `src/island.js` without changing world-space Tower coordinates per FR-009 and US3/AC2 (partial)
- [X] T043 [HIGH] Extend alignment diagnostics in `src/main.js` and add unit/browser assertions in `tests/force-session-v2.test.js`, `tests/layout-worker.test.js`, `tests/layout-runner.test.js`, `tests/island.test.js`, and `tests/app.spec.js` for complete assignment, center, occupancy, revision, spring, 20-run visible-sequence, layout-mode, camera, responsive, reduced-motion, and edge-state coverage per QR-002 and SC-003 (missing)
- [X] T044 [HIGH] Replace the cadence-only benchmark in `tests/layout.benchmark.spec.js` with the 500-rendered-leaf-Tower/approximately-2,000-cell reference benchmark, two warm-ups, ten measured five-second windows, exact metadata capture, and hard assertions of at least 60 complete visible updates/sec and at most 1,000 ms result-to-first-aligned-scene latency per QR-003 and SC-005 (missing)

## Phase 8: Convergence

- [X] T045 [CRITICAL] Require a complete validated canonical `Int16Array` assignment snapshot in `src/island.js` and atomically derive Tower matrices, q/r/x/z metadata, occupied cells, empty-cell visibility, and leaf spring endpoints from it without raw-position rounding or stale-cell fallback per Constitution II, FR-001, FR-002, FR-007, FR-008, and US1/AC1 (contradicts)
- [X] T046 [CRITICAL] Reuse position and cell frame buffers across `src/force-layout.js`, `src/layout-worker.js`, and `src/layout-runner.js`, and replace repeated live grid reconstruction in `src/island.js` with island-owned mutable capacity that disposes replaced GPU resources exactly once per Constitution III, QR-003, and plan: grid ownership (contradicts)
- [X] T047 [CRITICAL] Implement true `all-steps` and `final-only` presentation in `src/layout-worker.js`, `src/layout-runner.js`, and `src/main.js`, suppressing ready/intermediate callbacks for reduced motion and emitting one validated terminal settlement per Constitution IV, FR-005, FR-006, and US2/AC3 (contradicts)
- [ ] T048 [CRITICAL] Replace `tests/layout.benchmark.spec.js` with the 500-Tower/approximately-2,000-cell benchmark using two warm-ups, ten independent five-second measured windows, hard per-window `>= 60` complete-visible-update/sec and `<= 1,000 ms` validated-result-to-first-aligned-scene assertions, and record exact reference metadata/results in `specs/007-fix-tower-cell-alignment/quickstart.md` per Constitution V, QR-003, and SC-005 (missing)
- [X] T049 [HIGH] Validate mandatory canonical leaf cells, exact length/order, uniqueness, assignment hash, inclusive radius, terminal placement equality, and both transferable receipt buffers before callbacks in `src/layout-runner.js` and `src/layout-worker.js`, adding malformed-frame coverage in `tests/layout-runner.test.js` and `tests/layout-worker.test.js` per FR-004, FR-007, FR-011, FR-012, and plan: authoritative frame data (partial)
- [X] T050 [HIGH] Remove fabricated duplicate-origin ready results and commit only validated initial or terminal force candidates in `src/layout-runner.js` and `src/main.js`, retaining the prior valid world until atomic success and releasing workers, listeners, timers, buffers, and candidate scenes on failure, cancellation, or supersession per FR-010, FR-011, QR-005, and plan: presentation lifecycle (contradicts)
- [X] T051 [HIGH] Extend assignment/center/occupancy/revision/spring diagnostics in `src/main.js` and add exact atomic renderer, 20-run complete visible-sequence, all-layout, camera rotate/pan/zoom/reset, resize, portable/visual profile, reduced-motion, edge-state, and resource-stability assertions in `tests/force-layout.test.js`, `tests/island.test.js`, `tests/app.spec.js`, and `tests/resource-profile.spec.js` per QR-002, QR-004, SC-003, SC-004, and SC-006 (partial)

## Phase 9: Convergence

- [X] T052 [HIGH] Add normal `all-steps` presentation assertions in `tests/island.test.js` and `tests/app.spec.js` for every displayed frame's unique integer assignments, exact axial Tower centers, matching occupancy, revision/hash identity, leaf/anchor spring endpoints, and atomic rollback after malformed input per FR-005, FR-008, and US2/AC1 (partial)
- [X] T053 [HIGH] Compare 20 normalized complete displayed sequences through the runner/renderer diagnostics in `tests/app.spec.js`, including every assignment revision, cell, derived center, occupied-cell snapshot, and spring endpoint rather than only direct calculation frames per QR-002 and SC-003 (partial)
- [X] T054 [HIGH] Consume the canonical empty/prior-empty, single-Tower, negative-coordinate, exact `R=256`, invalid `R>256`, rapid-change, and 500-Tower fixtures in `tests/island.test.js` and `tests/app.spec.js`, asserting aligned presentation or prior-world rollback as applicable per SC-006 and US3/AC3 (partial)
- [X] T055 [MEDIUM] Exercise actual OrbitControls pointer rotation, pointer pan, wheel zoom/dolly, Reset view, resize, and configured touch camera gestures in the portable and visual projects in `tests/app.spec.js`, asserting unchanged world-space Tower/cell centers after each operation per QR-004, SC-004, and US3/AC2 (partial)
- [X] T056 [MEDIUM] Add repeated assignment-revision, viewport-capacity-growth, mode-switch, rebuild, and teardown checks with resource identity/count stability and exact replacement disposal in `tests/island.test.js` and `tests/resource-profile.spec.js` per QR-003, QR-005, and plan: grid ownership (partial)
- [X] T057 [MEDIUM] Include `visual-desktop-chromium` and `visual-mobile-chromium` in the complete `npm run test:e2e` gate in `package.json` and reconcile the command description in `specs/007-fix-tower-cell-alignment/quickstart.md` per QR-004 and plan: support matrix (partial)

## Phase 10: Convergence

- [X] T058 Stabilize the complete five-profile `npm run test:e2e` gate against software-WebGL host saturation without weakening assertions, extending hang guards, or dropping portable or visual projects per QR-004 and plan: validation strategy (partial)
- [X] T059 Correct the focused alignment command or its stated project coverage in `specs/007-fix-tower-cell-alignment/quickstart.md` so the documented desktop, phone, tablet, and visual profile scope is accurate per QR-004 and plan: support matrix (partial)

## Phase 11: Convergence

- [X] T060 Validate non-regressing epochs and assignment revisions, and reject changed assignment hashes or cells under an unchanged revision before presentation callbacks in `src/layout-runner.js`, with malformed-sequence coverage in `tests/layout-runner.test.js`, per plan: authoritative frame data and QR-002 (partial)
