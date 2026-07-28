---

description: "Implementation tasks for realtime force simulation visualization"
---

# Tasks: Realtime Force Simulation Visualization

**Input**: Design documents from `/specs/003-realtime-force-simulation/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/force-session-contract.md`, `contracts/worker-protocol.md`, `contracts/render-contract.md`, `quickstart.md`, `.specify/memory/constitution.md`

**Validation**: Use `npm test`, the existing local Playwright Chromium desktop/phone/tablet projects through `npm run test:e2e`, measured local-host benchmarks through `npm run benchmark:layout`, automated semantic-clarity evidence, and `npm run build`. Native-device validation, external participant studies, and external browser certification are outside scope.

**Organization**: Setup and foundational work establish the shared deterministic retained session. User-story phases then deliver independently testable P1, P2, and P3 increments before cross-cutting release validation.

## Format: `[ID] [P?] [Story?] Description (Covers/Gate)`

- **[P]**: Safe to execute in parallel after stated dependencies because the task changes different files and does not depend on incomplete work in that group
- **[Story]**: Required only in a user-story phase and maps the task to US1, US2, or US3
- **Traceability**: Every task ends with `(Covers: ...)`; release-only command gates may instead use `(Gate: Constitution V / plan validation)`
- **Paths**: Every task names exact repository-relative paths

## Non-Negotiable Design Constraints

- One D3 tick is one globally numbered force step. In normal motion, step 0 and every completed step are presented exactly once, in order, and acknowledged as painted before the next visible step is calculated.
- Batching, frame coalescing, frame dropping, interpolation, accepting sequence gaps, catch-up playback, and coalescing of accepted force-control commands are prohibited.
- Every leaf owns one unique assignment throughout force evolution. Assignments evolve at deterministic epochs and affect subsequent force ticks; they are neither static initial choices nor post-processing output.
- Successful convergence occurs inside numbered simulation ticks with authoritative leaf coordinates already equal to assigned centers. Finalization, serialization, transport, live rendering, and stable reconstruction must not project, snap, or independently replace those positions.
- The successful worker and full-precision force/control epoch state remain retained and inert after scene commit. No current pointer, touch, keyboard, camera, selection, or accessibility gesture submits a force-control command.

## Phase 1: Setup (Shared Validation Infrastructure)

**Purpose**: Establish deterministic fixtures, local Playwright profile validation, and the documented command surface without adding dependencies.

- [ ] T001 [P] Add stable-ID domain-neutral fixtures at multiple depths through 16 for moving conflicts, single/no-relation input, cyclic input with a known cycle, empty/invalid/unsupported input, immediate convergence, and stalled convergence; add seed-`0x5eed003` fixtures asserting the exact representative 1,200-leaf/300-anchor/19,200-membership/1,499-spring/depth-16 composition and exact maximum 4,800-leaf/1,200-anchor/76,800-membership/5,999-spring/depth-16 composition in `tests/fixtures/hierarchies.js` (Covers: FR-011, QR-001, QR-003, QR-005, SC-001, SC-002)
- [ ] T002 [P] Add Playwright Chromium profile assertions for detected browser/Playwright versions, desktop 1024x720, phone 360x800 with touch, tablet 768x1024 with touch, device scale factor, mobile-context setting, `innerWidth`, `visualViewport.width`, and explicit non-native-evidence labeling in `tests/app.spec.js` (Covers: QR-004a, SC-005, SC-007)
- [ ] T003 [P] Update the existing projects in `playwright.config.js` and scripts in `package.json` so `npm run test:e2e` covers isolated desktop/phone/tablet Chromium contexts and `npm run benchmark:layout` covers desktop/phone/tablet local-profile benchmark projects with separate output paths, without adding dependencies or external browser/device requirements (Covers: QR-003, QR-004a, SC-001, SC-002, SC-005, SC-007)

---

## Phase 2: Foundational (Blocking Deterministic Retained Session)

**Purpose**: Build the domain-neutral version-2 force session, evolving assignments, exact convergence, control seam, and retained worker/runner lifecycle required by every story.

**CRITICAL**: No user-story implementation starts until T004-T016 pass. These tasks define one authoritative simulation rather than separate animated and final calculations.

- [ ] T004 Add fail-first tests for complete version-2 config including alpha-schedule shape/ranges/derived decay/reset behavior, deterministic cyclic-hierarchy rejection before session mutation, root-first preorder with numeric-order/stable-ID sibling ties, radius/`q`/`r` initial cells, multiple domain-neutral depths through 16 without a hard-coded depth branch, all-descendant anchor-centroid initialization, successful single-leaf/no-relation output with zero springs, seeded random source, finite topology, all-node many-body force, and synchronous-wrapper compatibility in `tests/force-layout.test.js` (Covers: FR-007, FR-011, QR-001, QR-002, QR-005)
- [ ] T005 Implement `createForceLayoutSession()` with acyclic-boundary validation, complete version-2 configuration, canonical generic stable-ID topology, all-descendant anchor-centroid initialization, seeded d3-force setup in fixed link/many-body/center/hex order, reusable numeric state, and compatible `calculateForceLayout()` exhaustion in `src/force-layout.js` (Covers: FR-001, FR-007, FR-011, QR-001, QR-002, QR-005)
- [ ] T006 Add fail-first tests for exact lookahead prediction, centralized inverse-hex conversion, fractional-component/distance/total-cost quantization, move penalty, unique step-0 ownership, deterministic radius-three leaf ranking, canonical proposal queue, cell-side quantized-cost/previous-owner/canonical-leaf arbitration, protected previous cells, bounded deferred-acceptance conflict chains, atomic evolving assignment changes every four cooling steps, reusable proposal storage, exact alpha-scaled mutable/stable hex-force velocity deltas and transition boundary, controlled assignment retention/no target delta, and post-release target resumption in `tests/force-layout.test.js` (Covers: FR-006a, QR-002, QR-003, SC-004)
- [ ] T007 Implement encoded-cell ownership, reusable candidate/owner/holder/queue arrays, deterministic bounded deferred acceptance, assignment revisions/hash/stability, and the stateful hex-target force in `src/force-layout.js` (Covers: FR-006a, QR-002, QR-003, SC-004)
- [ ] T008 Add fail-first tests for minimum step 32, three unchanged real assignment epochs, exact all-node consecutive-tick movement after leaf-centroid translation removal, leaf-only normalized target-error formula, component/metric quantization, max/RMS denominators and inclusive gates, controlled convergence exclusion, numbered center locking, eight consecutive terminal-quality steps, exact center equality, convergence when the eighth passing step is step 256, `NOT_CONVERGED` when step 256 does not pass, and non-mutating repeatable final serialization in `tests/force-layout.test.js` (Covers: FR-006, FR-006b, FR-011, QR-002, SC-013)
- [ ] T009 Implement deterministic convergence and in-tick automatic center locks so successful full-precision leaf coordinates equal assigned centers before serialization, evaluate step-256 terminal success before `NOT_CONVERGED`, and ensure `finish()` never assigns, projects, snaps, rounds, or moves nodes in `src/force-layout.js` (Covers: FR-006, FR-006b, FR-011, QR-002, SC-013)
- [ ] T010 Add fail-first force-session contract tests for ordered fix/release validation, stable leaf IDs, finite coordinate canonicalization, inverse-transform fractional `q/r/s` radius with inclusive 256 boundary, separate processed/accepted sequence watermarks, continued sequencing after semantic rejection, duplicate/gap/wrong-request non-consumption, session-state/non-leaf/failed/disposed rejection without force mutation, retained full-precision resume, epoch reheat, held convergence blocking, neighbor repulsion, cooling-to-newer-held epoch transition, final-release fresh budget, no-command compatibility, and transcript replay in `tests/force-layout.test.js`; test pre-commit rejection only at worker/runner layers (Covers: FR-014, FR-015, QR-006, SC-010, SC-012)
- [ ] T011 Implement the request-scoped FIFO `set-fixed-position`/`release-fixed-position` seam, accepted transcript, interaction epochs, alpha/streak/assignment reset, held command-boundary ticks, cooling-budget rules, and idempotent disposal in `src/force-layout.js` without accepting DOM, pointer, camera, or Three.js objects (Covers: FR-014, FR-015, QR-006, SC-010, SC-012)
- [ ] T012 [P] Add fail-first worker state tests using injected synthetic messages for validated topology/success/failure/control schemas, worker/runner pre-commit rejection, `session-result-committed` terminal-buffer return, operation-versus-session settlement, settled-awaiting-commit, retained-settled, held, interaction-cooling, FIFO control receipts with apply/tick/frame/ack/receipt backpressure and watermarks, epoch settlement, zero retained idle ticks/messages/timers, failure/disposal, and exactly-once release; defer real calculation pacing, terminal publication, and final-only execution to story tasks in `tests/layout-worker.test.js` (Covers: FR-014, FR-015, QR-005, QR-006, SC-010, SC-011, SC-012)
- [ ] T013 Implement topology/success/failure/control message schemas, synthetic state transitions, `session-result-committed` return ownership, operation-versus-session settlement, retained session/control ownership, inert retained idle, and idempotent teardown without implementing the real paint-gated or final-only calculation loops yet in `src/layout-worker.js` (Covers: FR-014, FR-015, QR-005, QR-006, SC-010, SC-011, SC-012)
- [ ] T014 Add fail-first runner contract tests for preserved `runLayout()` Promise behavior, synchronous-before-resolution `onInitialSettled`, strict read-only `PresentationReceipt`/`EpochSettlement` validation, topology retention, `onEpochReady`/`onEpochSettled` dispatch, one-owner initial/epoch terminal-frame views through exact-buffer commit return, caller-without-sequence command input, runner-local non-consuming rejection, worker-semantic consuming rejection, fatal structural sequence rejection, pending-commit rejection, epoch waiters, exact 60-second visible-active-time initial/post-release/command-receipt expiration with hidden intervals excluded, captured-session callbacks, post-success worker failure, and disposal in `tests/layout-runner.test.js` (Covers: FR-014, FR-015, QR-003, QR-005, QR-006, SC-010, SC-011, SC-012)
- [ ] T015 Implement synchronous-before-resolution `onInitialSettled`, strict read-only receipt/settlement validation, topology retention, `onEpochReady`/`onEpochSettled` dispatch, `confirmSessionResultCommitted()` with exact terminal-buffer transfer, canonical failure envelopes, non-convergence settlement, runner-owned command sequencing, 60-second visible-active-time receipt guards and typed cleanup, `submitForceControl()`, `waitForEpochSettlement()`, retained worker/listener/deferred ownership, exact initial/epoch guards, and exactly-once captured-session destruction in `src/layout-runner.js` (Covers: FR-003a, FR-006, FR-011, FR-014, FR-015, QR-003, QR-005, QR-006, SC-009, SC-010, SC-011, SC-012)
- [ ] T016 Run `npm test -- tests/force-layout.test.js tests/layout-worker.test.js tests/layout-runner.test.js` and resolve all foundational contract failures without weakening assignment, convergence, command, determinism, or retention invariants in `src/force-layout.js`, `src/layout-worker.js`, and `src/layout-runner.js` (Covers: FR-006, FR-006a, FR-006b, FR-007, FR-014, FR-015, QR-001, QR-002, QR-005, QR-006, SC-004, SC-010, SC-011, SC-012, SC-013)

**Checkpoint**: The same version-2 kernel deterministically produces an exact-center result with or without presentation, can retain and resume full-precision state through the contract-only control seam, and owns no UI or rendering objects.

---

## Phase 3: User Story 1 - Watch Forces Move the Layout (Priority: P1) MVP

**Goal**: Display step 0 and every evolving force state with coherent towers, springs, assignments, and progress, then commit the already-centered terminal frame without a hidden final movement.

**Independent Test**: In the local Playwright Chromium desktop project with normal motion, select force-directed mode on the moving-conflict fixture; verify step 0, calculating status, contiguous one-paint-per-step movement, changing assignments that influence later movement, coherent springs, visible progress, and identical terminal live/stable positions.

### Validation for User Story 1

> Write each fail-first test before its matching implementation and confirm failure is caused by the missing contract behavior.

- [ ] T017 [P] [US1] Add fail-first worker tests for real topology plus step 0, exactly one outstanding Float32 frame, exact buffer-return paint acknowledgement, one D3 tick per global step, contiguous global numbering across initial/control epochs, initial/epoch success terminal snapshots, exact commit-buffer return, painted step-256 `NOT_CONVERGED`, and explicit rejection of batching, dropping, replacement, interpolation, or accepted-command coalescing in `tests/layout-worker.test.js` (Covers: FR-001, FR-003, FR-003a, FR-006, FR-011, FR-015, QR-002, QR-005, SC-009, SC-010)
- [ ] T018 [P] [US1] Add fail-first runner tests for `onReady`/`onStep` logical paint receipts, no next-step request before the exact outstanding receipt, duplicate/gapped/wrong-request/malformed frame rejection, hidden active-time accounting hooks, unchanged final Promise settlement, and the `calculateForceLayout()` compatibility plus force `runLayout()` path preserving authoritative assignments/topology/terminal Float32 centers without legacy placement or projection in `tests/layout-runner.test.js` (Covers: FR-003, FR-006a, FR-006b, FR-009, QR-002, QR-005, SC-006, SC-009, SC-013)
- [ ] T019 [P] [US1] Add fail-first live-island tests for step-0 construction, exact-next-step acceptance, unique assignments, same-frame tower and spring endpoints, single-leaf/no-relation zero-spring rendering, one spring per active relationship at `y = 0`, force styling/depth flags, current bounds/metadata, no per-step scene/backing-array allocation, required force `terminalFrame` stable input, terminal Float32 center identity, and no stable reconstruction movement in `tests/island.test.js` (Covers: FR-004, FR-005, FR-006a, FR-006b, FR-012, QR-003, QR-005, SC-003, SC-013)
- [ ] T020 [P] [US1] Add fail-first local Playwright Chromium journeys tagged `@US1-realtime-force` and loaded with `?testDiagnostics=1` for step-0/status latency, visible copy identifying moving lines as force relationships influencing layout, explicit settled-at-final-step status, at least two distinct moving states, lossless `forceSession.trace()` relationship-oracle validation across ten representative-fixture traces, every-step contiguous paint timestamps/counts, evolving assignments without teleportation, one displayed root, no terminal snap, copied settlement summaries, typed seam rejection, and an interaction epoch that commits or rolls back through the exact seam in `tests/app.spec.js` (Covers: FR-001, FR-002, FR-003, FR-003a, FR-004, FR-005, FR-006b, FR-014, FR-015, SC-001, SC-003, SC-008, SC-009, SC-010, SC-013)

### Implementation for User Story 1

- [ ] T021 [P] [US1] Implement `ready` step 0 followed by an exact `painted`-receipt/one-tick loop, one outstanding returned position buffer, contiguous global/epoch/cooling metadata, assignment/convergence metrics, initial/epoch success terminal snapshots with commit-buffer return, and painted step-256 non-convergence publication in `src/layout-worker.js` (Covers: FR-001, FR-003, FR-003a, FR-006, FR-011, FR-015, QR-002, QR-005, SC-009, SC-010)
- [ ] T022 [P] [US1] Implement validated all-steps presentation callbacks, exact outstanding-buffer receipts, strict next-global-step enforcement, logical paint completion, and result validation in `src/layout-runner.js` without any gap-tolerant or latest-frame path (Covers: FR-003, FR-009, QR-005, SC-006, SC-009)
- [ ] T023 [P] [US1] Implement `createLiveIsland()`/`applyStep()` and force-mode `createIsland({ layoutResult, topology, terminalFrame })` with detached validation, canonical node-index mapping, one occupied `InstancedMesh`, one dynamic `LineSegments` buffer, reusable math/resources, atomic same-frame tower/spring updates, direct terminal-frame Float32 stable transforms, exact order checks, force visual semantics, current bounds, and idempotent disposal in `src/island.js` (Covers: FR-004, FR-005, FR-006a, FR-006b, FR-012, QR-003, SC-003, SC-013)
- [ ] T024 [US1] Implement initial and test-seam interaction-epoch stable/live scene transactions, the exact `window.__hexWorldTest.forceSession` submit/wait/commit-outcome/diagnostics API from `contracts/render-contract.md`, `onEpochReady`/`onEpochSettled` provisional presentation, RAF-backed paint receipts, exact terminal equality validation, force topology/`terminalFrame` handoff to stable construction, epoch-specific commit confirmation, rollback on construction/commit failure, and opt-in frame/paint/worker/listener/timer lifecycle diagnostics in `src/main.js` (Covers: FR-001, FR-003, FR-004, FR-006b, FR-011, FR-012, FR-014, FR-015, QR-005, SC-003, SC-009, SC-010, SC-011, SC-013)
- [ ] T025 [P] [US1] Add semantic visible calculation progress at `#layout-progress` with separate polite start/terminal status and `aria-live="off"` fields for current global step, epoch, cooling step, assignment stability, convergence streak, maximum step, and terminal reason in `index.html` (Covers: FR-002, FR-003a, FR-008, QR-004, SC-001, SC-009)
- [ ] T026 [US1] After T025, style `#layout-progress` and its `[data-force-progress]` fields for clear calculating/terminal reading on desktop and at 360 pixels without obscuring the canvas, relying on text rather than motion or color alone in `src/style.css` (Covers: FR-003a, FR-008, QR-004, SC-009)
- [ ] T027 [US1] Wire visible non-live progress updates, explanatory force-relationship text, explicit settled-at-final-step status, start/terminal-only announcements, current/final step counts, maximum-step failure reason, and assignment/convergence diagnostics to worker frames without per-step live announcements in `src/main.js` (Covers: FR-002, FR-003a, FR-006, FR-008, FR-011, QR-004, SC-001, SC-008, SC-009)
- [ ] T028 [US1] Implement force terminal-result revalidation and authoritative assignment/topology/Float32 handoff for the fail-first T018 assertions in `src/layout-runner.js` without legacy placement, post-convergence assignment, projection, or snap (Covers: FR-006a, FR-006b, QR-002, SC-013)
- [ ] T029 [US1] Run `npm test -- tests/force-layout.test.js tests/layout-worker.test.js tests/layout-runner.test.js tests/island.test.js tests/layout.test.js` and fix the US1 contract slice in `src/force-layout.js`, `src/layout-worker.js`, `src/layout-runner.js`, `src/island.js`, and `src/main.js` (Covers: FR-001, FR-003, FR-004, FR-005, FR-006, FR-006a, FR-006b, QR-002, QR-005, SC-003, SC-009, SC-013)
- [ ] T030 [US1] Run the US1 local Chromium scenarios with `npm run test:e2e -- --grep "@US1-realtime-force"`, require zero failures, and record all-frame step/paint/assignment/relationship-oracle traces, epoch transaction results, and terminal identity in `specs/003-realtime-force-simulation/validation/us1.md`; leave the task incomplete on any failed or missing scenario (Covers: FR-001, FR-002, FR-003, FR-003a, FR-004, FR-005, FR-006b, FR-014, FR-015, QR-004a, SC-001, SC-003, SC-009, SC-010, SC-013)

**Checkpoint**: US1 is an independently demoable MVP: users watch every authoritative force step and its relationships, and the terminal frame commits without any independent final placement.

---

## Phase 4: User Story 2 - Keep the Application Usable During Calculation (Priority: P2)

**Goal**: Keep controls, focus, status, and progress usable while ensuring cancellation, hidden tabs, rapid replacement, failures, and retained-session teardown cannot corrupt the authoritative world.

**Independent Test**: In the Playwright desktop and 360x800 phone touch-emulation projects, use keyboard, pointer, and touch controls during normal-motion calculation; hide/restore the tab with a frame outstanding; switch/rebuild rapidly; and verify exact resume, responsive controls, rollback, no stale updates, current gesture semantics, and exactly-once cleanup.

### Validation for User Story 2

- [ ] T031 [P] [US2] Add fail-first runner tests for force-to-force and force-to-legacy supersession, cancellation with an outstanding frame/control, stale and malformed callbacks, timeout/failure, request identity capture, late command rejection, and exactly-once worker/listener/buffer/deferred/guard cleanup in `tests/layout-runner.test.js` (Covers: FR-009, FR-011, FR-012, FR-014, QR-005, SC-006, SC-011)
- [ ] T032 [P] [US2] Implement active-session invalidation before worker termination, stale callback/receipt isolation, supersession and failure settlement, and idempotent release of worker/listener/buffer/deferred/guard ownership in `src/layout-runner.js` (Covers: FR-009, FR-011, FR-012, FR-014, QR-005, SC-006, SC-011)
- [ ] T033 [P] [US2] Add fail-first island tests for selected/hovered moving towers, stationary-pointer hover reevaluation data, atomic invalid-frame rejection, stale/post-retire/post-disposal rejection, semantic IDs, current raycast bounds, partial-allocation disposal, and shared-resource ownership in `tests/island.test.js` (Covers: FR-008, FR-009, FR-012, QR-005, SC-003, SC-006, SC-011)
- [ ] T034 [P] [US2] Implement interaction-aware matrix composition, current bounds/metadata, semantic selection continuity, atomic validation-before-mutation, retired-handle rejection, and owned-versus-shared GPU disposal in `src/island.js` (Covers: FR-008, FR-009, FR-012, QR-005, SC-003, SC-006, SC-011)
- [ ] T035 [P] [US2] Add local Playwright Chromium scenarios tagged `@US2-usable-lifecycle` for desktop keyboard/pointer and 360x800/768x1024 touch-emulation operation; prove the essential layout-selector, every generator field, submit, status/progress/relationship meaning, and reset-camera journey is keyboard complete with visible focus, then separately verify non-essential canvas selection and camera pointer/touch controls remain enabled, responsive, and recoverable through reset; also cover category-specific failure status, selection continuity, responsive layout, and action-to-next-painted-frame observability in `tests/app.spec.js` (Covers: FR-008, FR-011, QR-003, QR-004, QR-004a, SC-005)
- [ ] T036 [US2] Add hidden-tab and `pagehide` scenarios tagged `@US2-usable-lifecycle` that hide with one exact frame outstanding, verify no catch-up/dropped/duplicate step or false active-time timeout, restore and paint that same frame before calculation resumes, then dispatch `pagehide` and assert runner termination, listener/resource cleanup, and late-message isolation in `tests/app.spec.js` (Covers: FR-003, FR-008, FR-014, QR-003, QR-005, SC-009, SC-011)
- [ ] T037 [US2] Add negative scenarios tagged `@US2-usable-lifecycle` proving click remains tower selection, pointer drag/wheel and one-touch remain camera controls, and no pointer/touch/keyboard/accessibility action, drag affordance, pointer capture, or simulation-mutating control is introduced in `tests/app.spec.js` (Covers: FR-013, QR-004, QR-006)
- [ ] T038 [US2] Implement responsive enabled controls, semantic selection restoration, stationary-pointer reevaluation before raycast, provisional rollback, rapid switch/rebuild ordering, understandable failure status, stale-request exclusion, and one-authoritative-root replacement in `src/main.js` (Covers: FR-008, FR-009, FR-011, FR-012, QR-004, QR-005, SC-006)
- [ ] T039 [US2] Implement Page Visibility pause/resume of presentation and active-time guards with the exact outstanding frame retained, no hidden catch-up, and listener cleanup on replacement/teardown in `src/main.js` (Covers: FR-003, FR-008, FR-014, QR-003, QR-005, SC-009, SC-011)
- [ ] T040 [P] [US2] Extend repeated live/settled/cancel/rebuild/switch profiling to assert one scene root, one authoritative force worker, zero retained idle ticks/messages/timers, stable renderer/GPU/listener counts, and no duplicate towers/springs in `tests/resource-profile.spec.js` (Covers: FR-012, FR-014, QR-003, QR-005, SC-011)
- [ ] T041 [P] [US2] Add worker tests for teardown protocol messages caused by mode switch, rebuild, newer request, supersession, commit failure, worker failure, page teardown, and disposal releasing retained force/control epoch state exactly once while late frames and commands cannot mutate replacement state in `tests/layout-worker.test.js` (Covers: FR-009, FR-014, FR-015, QR-005, SC-006, SC-011)
- [ ] T042 [US2] Wire mode switch, rebuild, supersession, stable commit failure, worker error, `pagehide`, and app disposal to the captured runner/session and live/stable island owners exactly once while preserving the committed world after post-success worker failure in `src/main.js` (Covers: FR-009, FR-011, FR-012, FR-014, FR-015, QR-005, SC-006, SC-011)
- [ ] T043 [US2] Run `npm test -- tests/layout-worker.test.js tests/layout-runner.test.js tests/island.test.js` plus `npm run test:e2e -- --grep "@US2-usable-lifecycle"`, require zero failures including both 60-second guard contracts, every FR-008 control, and `pagehide`, and record desktop/emulated-mobile focus and touch, hidden-tab, gesture-negative, rollback, stale-update, and resource results in `specs/003-realtime-force-simulation/validation/us2.md`; leave the task incomplete on any failed or missing scenario (Covers: FR-003, FR-008, FR-009, FR-011, FR-012, FR-013, FR-014, QR-003, QR-004, QR-005, SC-005, SC-006, SC-009, SC-011)

**Checkpoint**: US2 is independently repeatable at the required local desktop and emulated-mobile viewport sizes; controls remain usable, hidden playback resumes exactly, current gestures are unchanged, and every replacement owns and releases resources correctly.

---

## Phase 5: User Story 3 - Preserve Trustworthy Results and Motion Preferences (Priority: P3)

**Goal**: Preserve deterministic traces and final diagnostics while reduced motion suppresses intermediate presentation and all invalid, unsupported, stalled, or failed journeys preserve the previous valid world.

**Independent Test**: Repeat identical input ten times with and without motion suppression, compare assignment/step/convergence/result/spring traces, verify accessible start and terminal status with no intermediate motion, and inject each failure class while the previous valid world remains visible.

### Validation for User Story 3

- [ ] T044 [P] [US3] Add ten-run tests comparing no-command and accepted-transcript assignment revisions/hashes, convergence steps, occupied cells, placements, springs, epoch traces, exact terminal centers, and observed-versus-final-only results in `tests/force-layout.test.js` (Covers: FR-007, FR-010, QR-002, SC-004, SC-007, SC-010, SC-012, SC-013)
- [ ] T045 [P] [US3] Add worker tests proving final-only mode runs the identical kernel with no intermediate frame presentation, publishes success or step-256 `NOT_CONVERGED` terminal snapshots without rendering them, retains settlement inertly after success, returns the exact outstanding buffer on mid-epoch suppression, and resamples presentation mode for later epochs in `tests/layout-worker.test.js` (Covers: FR-003, FR-003a, FR-006, FR-010, FR-011, FR-014, QR-002, QR-004, SC-007, SC-009)
- [ ] T046 [P] [US3] Add runner tests for initial final-only callbacks, mid-epoch suppression, rollback-facing epoch observers, unchanged validation/result settlement, hidden-versus-suppressed distinction, and dropped/malformed/superseded/failure resilience in `tests/layout-runner.test.js` (Covers: FR-009, FR-010, FR-011, QR-004, QR-005, SC-006, SC-007)
- [ ] T047 [P] [US3] Add Playwright Chromium desktop/emulated-phone/emulated-tablet scenarios tagged `@US3-deterministic-reduced-motion` for initial and mid-epoch reduced motion, no intermediate visual state, `aria-live="off"` progress, polite start/terminal announcements, browser semantic/accessibility-tree checks, one visible final spring per relationship, deterministic final equality, and every FR-011 failure category; assert each message names its category and preservation statement, cyclic input identifies the cycle, and unsupported input identifies the missing capability in `tests/app.spec.js` without claiming native mobile accessibility evidence (Covers: FR-002, FR-003a, FR-010, FR-011, QR-004, QR-004a, QR-005, SC-001, SC-007)

### Implementation for User Story 3

- [ ] T048 [P] [US3] Implement final-only and latched suppression paths that execute the same force session, return any outstanding transferable buffer exactly once, publish only terminal calculation output, and retain zero-idle-work session semantics in `src/layout-worker.js` (Covers: FR-010, FR-014, QR-002, QR-004, QR-005, SC-007)
- [ ] T049 [P] [US3] Implement runner presentation suppression, exact outstanding-frame retirement, final-only result validation, current-preference sampling per interaction epoch, and failure/stale-message isolation without changing deterministic calculation state in `src/layout-runner.js` (Covers: FR-009, FR-010, FR-011, QR-002, QR-004, QR-005, SC-006, SC-007)
- [ ] T050 [US3] Implement `prefers-reduced-motion` request/epoch sampling, no initial live island in final-only mode, mid-epoch provisional retirement with stable rollback display, final spring commit, start/terminal status preservation, and media-listener cleanup in `src/main.js` (Covers: FR-010, FR-012, FR-014, QR-004, QR-005, SC-007, SC-011)
- [ ] T051 [US3] Implement understandable empty/invalid/unsupported/not-converged/stalled/protocol/worker/render failure mapping that leaves the previous committed island authoritative and disposes failed provisional/session resources in `src/main.js` (Covers: FR-006, FR-011, FR-012, QR-005, SC-006, SC-011)
- [ ] T052 [US3] Add local-profile assertions in `tests/app.spec.js` and timing scenarios in `tests/layout.benchmark.spec.js` for detected Chromium/Playwright versions and exact desktop/phone/tablet project settings; for every required profile/fixture/motion cohort apply two excluded warmups plus ten browser-clock measured runs and the aggregation/boundaries from `spec.md`, including normal/reduced startup, normal full completion/cadence/post-commit metrics, representative emulated-phone touch p95 at most 100 ms, and 360-pixel `innerWidth`/`visualViewport.width`; label all mobile-profile evidence as local emulation (Covers: FR-002, FR-003, FR-008, QR-003, QR-004a, SC-001, SC-002, SC-005, SC-007)
- [ ] T053 [US3] Run `npm test -- tests/force-layout.test.js tests/layout-worker.test.js tests/layout-runner.test.js` plus `npm run test:e2e -- --grep "@US3-deterministic-reduced-motion"`, require zero failures, and record ten-run equality, browser-semantic status, final springs, and category-specific failure preservation in `specs/003-realtime-force-simulation/validation/us3.md`; leave the task incomplete on any failed or missing scenario (Covers: FR-007, FR-010, FR-011, QR-002, QR-004, QR-005, SC-004, SC-007, SC-013)

**Checkpoint**: US3 is independently repeatable; normal and reduced presentation produce the same deterministic terminal state, reduced motion exposes no intermediate movement, and every failure preserves the last valid world.

---

## Phase 6: Final Cross-Cutting Validation

**Purpose**: Produce blocking scale, latency, local Chromium profile, resource, automated semantic-clarity, documentation, full-suite, and build evidence after behavior is frozen.

- [ ] T054 Implement the exact browser-clock protocol from `spec.md`: two excluded warmups plus ten runs for the representative and maximum fixtures; normal startup limits of 1,000/2,000 ms; reduced startup limits of 1,000/2,000 ms with zero intermediate frames; terminal stable-commit p95 limits of 2,000/8,000 ms; every-step representative cadence of at least 5 Hz and 95% of gaps at most 200 ms; 300-interval maximum-fixture post-commit median at most 33.3 ms; and representative ten-run reset-camera keyboard/pointer nearest-rank p95 at most 100 ms in `tests/layout.benchmark.spec.js` (Covers: FR-002, FR-003, FR-008, QR-003, SC-001, SC-002, SC-005, SC-009)
- [ ] T055 Record the verification date, local host hardware, detected Chromium/Playwright versions, and desktop/phone/tablet project settings in `specs/003-realtime-force-simulation/validation/chromium-environment.json`; run `npm run benchmark:layout`, record local-profile raw samples and nearest-rank calculations in `specs/003-realtime-force-simulation/validation/benchmark.md`, profile and remediate any failed force tick/assignment/transport/render/input phase only in `src/force-layout.js`, `src/layout-worker.js`, `src/layout-runner.js`, `src/island.js`, or `src/main.js`, then rerun until every T054 assertion passes before freezing behavior; never skip steps, freeze assignments, weaken exact equality, or coalesce accepted controls (Covers: FR-002, FR-003, FR-006a, FR-006b, FR-008, QR-003, QR-004a, SC-001, SC-002, SC-005, SC-009, SC-013)
- [ ] T056 [P] Run `npm run test:e2e -- --project=desktop-chromium`, require zero failures, and record detected browser/Playwright versions, keyboard, pointer, responsive, reduced-motion, gesture-negative, and browser-semantic accessibility outcomes in `specs/003-realtime-force-simulation/validation/chromium-desktop.md` (Covers: FR-008, FR-010, FR-013, QR-004, QR-004a, SC-005, SC-007)
- [ ] T057 [P] Run `npm run test:e2e -- --project=phone-chromium --project=tablet-chromium`, require zero failures, and record profile settings, touch capability, viewport evidence, reduced-motion/browser-semantic results, and explicit non-native-evidence labeling in `specs/003-realtime-force-simulation/validation/chromium-mobile-emulation.md` (Covers: FR-002, FR-003, FR-008, FR-010, FR-013, QR-003, QR-004, QR-004a, SC-001, SC-002, SC-005, SC-007)
- [ ] T058 Run `npm test -- tests/layout-worker.test.js tests/layout-runner.test.js` plus `npm run test:e2e -- tests/resource-profile.spec.js`; use opt-in browser lifecycle counters to verify repeated settle/rebuild/switch cycles, one idle retained worker, zero autonomous ticks/messages/timers, stable root/worker/GPU/listener counts, and no externally observable resource growth, then record evidence in `specs/003-realtime-force-simulation/validation/resources.md` (Covers: FR-012, FR-014, FR-015, QR-003, QR-005, SC-011)
- [ ] T059 [P] Run `npm run test:e2e -- --grep "@US1-realtime-force"` across desktop/phone/tablet projects, require visible force-relationship explanation and explicit settled-at-final-step status in every profile, and record automated semantic/browser evidence plus the non-user-study limitation in `specs/003-realtime-force-simulation/validation/semantic-clarity.md` (Covers: FR-004, FR-003a, QR-004, SC-008)
- [ ] T060 [P] Document the deterministic evolving-assignment force session, every-step paint contract, exact-center terminal identity, retained worker/control epochs, no-current-drag boundary, progress/accessibility, hidden tabs, lifecycle ownership, local Playwright Chromium validation-profile matrix, native Android exclusion, and every command from `specs/003-realtime-force-simulation/quickstart.md` in `README.md` (Covers: FR-003, FR-006a, FR-006b, FR-013, FR-014, FR-015, QR-004, QR-004a, QR-006)
- [ ] T061 Run `npm test`, require a zero exit code and zero failing tests, and append the complete Node test outcome to `specs/003-realtime-force-simulation/validation/final.md`; leave this task incomplete on failure (Gate: Constitution V / plan validation)
- [ ] T062 Run `npm run test:e2e` and `npm run benchmark:layout`; require zero exits, zero failing local-profile scenarios/metrics, complete Chromium/Playwright/profile evidence, and explicit non-native labeling, then append complete results to `specs/003-realtime-force-simulation/validation/final.md`; leave this task incomplete on failure (Gate: Constitution V / plan validation)
- [ ] T063 After T055 freezes source behavior, run `npm run build`, require a zero exit code, and append the production build outcome plus separately identified non-blocking Vite warnings to `specs/003-realtime-force-simulation/validation/final.md`; rerun after any later source change and leave this task incomplete on failure (Gate: Constitution V / plan validation)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001-T003)**: Starts immediately; T003 establishes the commands used by browser-profile and benchmark tasks.
- **Foundational (T004-T016)**: Depends on all Setup tasks T001-T003 and blocks all user stories. Implement in test/implementation pairs T004-T005, T006-T007, T008-T009, T010-T011, then worker T012-T013 and runner T014-T015 before T016.
- **US1 (T017-T030)**: Depends on T016. Its protocol/render/browser tests T017-T020 precede implementation T021-T028; T029-T030 close the MVP checkpoint.
- **US2 (T031-T043)**: Depends on US1's exact paint and live/stable transaction. Tests precede matching implementation; `src/main.js` ownership tasks T038, T039, and T042 remain sequential.
- **US3 (T044-T053)**: Depends on US1 presentation modes and US2 rollback/ownership. Tests T044-T047 precede implementation T048-T052 and checkpoint T053.
- **Final validation (T054-T063)**: Depends on all three story checkpoints. T054 runs first and T055 completes measured remediation and freezes behavior. T063 then runs independently. T056, T057, T059, and T060 may run in parallel after T055; T058 follows T056 to avoid concurrent duplicate Playwright/resource output. T061-T062 run after all local evidence is complete.

### User Story Dependency Graph

```text
Setup T001-T003
  -> Foundation T004-T016
      -> US1 T017-T030 (MVP: every authoritative step is painted)
          -> US2 T031-T043 (usable controls, exact cancellation and ownership)
              -> US3 T044-T053 (deterministic reduced-motion and failure behavior)
                  -> Final validation T054-T063
```

Stories have independent acceptance paths at their checkpoints, but implementation proceeds in priority order because they intentionally share `src/layout-worker.js`, `src/layout-runner.js`, `src/island.js`, and `src/main.js` state ownership.

### Within Each Story

- Write and run the listed fail-first tests before implementing matching behavior.
- Validate complete request/frame/control data before mutating session, scene, or resource state.
- Apply accepted controls only after the exact outstanding frame receipt and before the next tick.
- Invalidate captured request/session identity before terminating a worker or disposing provisional resources.
- Keep all `src/main.js` scene transaction, listener, and lifecycle ownership changes sequential.
- Complete the story checkpoint before starting the next priority.

### Parallel Opportunities

- Setup T001 and T002 can run in parallel; T003 is independent of their file edits.
- After T011, foundational worker tests/implementation T012-T013 and runner tests/implementation T014-T015 use separate files, but T015 consumes T013's protocol and therefore follows it for integration.
- In US1, T017-T020 can run in parallel; after those fail as expected, T021-T023 can run in parallel before T024/T027 integrate them. T026 follows T025's selector contract.
- In US2, T031/T033/T035/T040/T041 target separate test files and can run in parallel; T032 and T034 can run in parallel before sequential main integration T038/T039/T042.
- In US3, T044-T047 can run in parallel; T048 and T049 can run in parallel before T050/T051 integrate suppression and failures.
- In final validation, T054 precedes T055. After T055 freezes benchmark-passing behavior, T056/T057/T059/T060/T063 can run in parallel; T058 follows T056, and T061-T062 close the fully evidenced release gate.
- Never parallelize tasks that edit the same file or concurrently alter the same worker/session/island ownership transition.

## Parallel Examples

### User Story 1

```text
T017 tests/layout-worker.test.js  |  T018 tests/layout-runner.test.js
T019 tests/island.test.js         |  T020 tests/app.spec.js

then

T021 src/layout-worker.js         |  T022 src/layout-runner.js
T023 src/island.js                |  T025 index.html
then T026 src/style.css
```

### User Story 2

```text
T031 tests/layout-runner.test.js  |  T033 tests/island.test.js
T035 tests/app.spec.js            |  T040 tests/resource-profile.spec.js
T041 tests/layout-worker.test.js

then

T032 src/layout-runner.js         |  T034 src/island.js
```

### User Story 3

```text
T044 tests/force-layout.test.js   |  T045 tests/layout-worker.test.js
T046 tests/layout-runner.test.js  |  T047 tests/app.spec.js

then

T048 src/layout-worker.js         |  T049 src/layout-runner.js
```

## Task Summary

| Phase | IDs | Count |
|---|---|---:|
| Setup | T001-T003 | 3 |
| Foundational | T004-T016 | 13 |
| US1 | T017-T030 | 14 |
| US2 | T031-T043 | 13 |
| US3 | T044-T053 | 10 |
| Final validation | T054-T063 | 10 |
| **Total** | **T001-T063** | **63** |

## Requirement Traceability

Inline `(Covers: ...)` tags on task checklist lines are the authoritative requirement-to-task mapping. Every FR, QR, and SC identifier appears on at least one implementation or validation task; T061-T063 are explicit constitution and plan gates.

## Implementation Strategy

### MVP First

1. Complete Setup T001-T003.
2. Complete Foundational T004-T016 and preserve fail-first evidence.
3. Complete US1 T017-T030.
4. Stop and validate the US1 checkpoint before cancellation, reduced-motion, or release work.

### Incremental Delivery

1. Foundation: one deterministic retained version-2 session with evolving assignments and tested control epochs.
2. US1: every authoritative normal-motion step paints with coherent geometry and no terminal snap.
3. US2: controls, progress, hidden tabs, cancellation, gestures, rollback, and resources remain trustworthy.
4. US3: deterministic reduced-motion and failure journeys preserve status, diagnostics, and the previous valid world.
5. Final validation: freeze behavior, then gather local Chromium performance/profile, automated semantic-clarity, resource, documentation, full-suite, and build evidence.

## Notes

- Do not add a runtime dependency, second simulation, main-thread force loop, global persistent worker, interpolation layer, replay store, per-step scene rebuild, or current tower-drag UI.
- Production frames retain diagnostics but not full assignment/frame history; opt-in tests may capture traces.
- Do not optimize by omitting visible steps, accepting sequence gaps, freezing initial assignments, weakening exact-center convergence, or coalescing an accepted command.
- Native Android hardware/browser/OS acceptance is outside scope. Playwright phone/tablet viewport and touch emulation provides local responsive, input-path, reduced-motion, and browser-semantic evidence only and MUST NOT be reported as native-device evidence.
- Record the existing Vite chunk warning separately; it does not waive `npm run build`.
