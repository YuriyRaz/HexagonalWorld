---

description: "Implementation tasks for force-directed hex layouts"
---

# Tasks: Force-Directed Layout

**Input**: Design documents from `/specs/001-force-directed-layout/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Validation**: Automated tests are required by the specification and constitution for deterministic layout, regressions, reusable contracts, rendering, interaction, accessibility, resource cleanup, and performance. Write the specified regression/contract scenario before its implementation and confirm it fails for the intended reason.

**Organization**: Tasks are grouped by user story. US2 and US3 have independently testable fixture-level increments; their final application integration intentionally reuses US1 orchestration. Shared files and resource ownership changes are explicitly serialized.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its stated prerequisites because it changes different files
- **[Story]**: Maps implementation and validation to US1, US2, or US3
- Every task includes the exact file path or paths it changes

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the selected dependency and establish repeatable Node, browser, mobile, and benchmark commands.

- [ ] T001 Install exact `d3-force@3.0.0` and add `test`, `test:e2e`, and `benchmark:layout` scripts in `package.json` and `package-lock.json`
- [ ] T002 [P] Configure desktop, 360px touch/reduced-motion, and benchmark projects with the Vite web server in `playwright.config.js`
- [ ] T003 [P] Create deterministic valid, malformed, representative, current-maximum, and structural-maximum hierarchy fixture builders in `tests/fixtures/hierarchies.js`

**Checkpoint**: Dependencies and test entry points are ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish domain-neutral data, shared axial geometry, normalized legacy output, and exception-safe rendering ownership before adding force modes.

**Critical**: No user story implementation starts until this phase passes its tests.

- [ ] T004 [P] Write failing tests for axial distance, canonical ring/spiral order, half-away-from-zero quantization, rounding, and axial/plane conversion in `tests/hex.test.js`
- [ ] T005 Implement allocation-conscious shared axial helpers and constants required by T004 in `src/hex.js`
- [ ] T006 [P] Write failing tests for stable hierarchy normalization, input immutability, generic visual payload, exact ID ordering, empty/duplicate/missing-parent/self-parent/cycle validation, and scale limits in `tests/data.test.js`
- [ ] T007 Refactor the current generator adapter to emit `NormalizedEntity[]` and `VisualEntityPayload` lookup without changing generated user-visible data in `src/data.js`
- [ ] T008 Write failing regression tests for flat/nested/packed coordinates, unified `LayoutResult`, unknown modes, generic depth-indexed boundary gaps, and the multi-source gap wavefront in `tests/layout.test.js`
- [ ] T009 Refactor all existing spatial algorithms to consume normalized IDs/parent relationships/order, reuse `src/hex.js`, return unified legacy diagnostics and generic gap stats, and preserve existing placements in `src/layout.js`
- [ ] T010 Write failing object-level tests for pre-allocation payload/cell/spring validation, generic visual-payload joins, detached island creation, opaque legacy presentation, partial-allocation cleanup, and idempotent handle disposal in `tests/island.test.js`
- [ ] T011 Refactor rendering to consume a completed `LayoutResult`, transfer all allocations to an `IslandHandle`, and preserve current opaque world behavior in `src/island.js`

**Checkpoint**: `npm test` passes for generic data, legacy layouts, shared hex mapping, and baseline island ownership.

---

## Phase 3: User Story 1 - Select Force-Directed Layouts (Priority: P1) MVP

**Goal**: Users can select either virtual-anchor or no-link grouping mode and receive a deterministic static layout with one leaf tower per unique hex center and no parent towers.

**Independent Test**: On fixed generic hierarchy fixtures, select both modes and verify one unique placement per leaf, no internal placements, exact repeatability across ten runs and reordered input, measurable grouping cohesion, keyboard selection, latest-request commit, and retained-world failures.

### Validation for User Story 1

- [ ] T012 [P] [US1] Write failing force-layout tests for request/config immutability, collision-safe structured IDs, fixed alpha/tick phases, Mulberry32 initialization, anchor/group outputs, bounded assignment, exact pinning, grouping ratio, spring cardinality, typed failures, input-order independence, and ten-run determinism in `tests/force-layout.test.js`
- [ ] T013 [P] [US1] Write failing one-request worker tests for success/failure serialization and production-safe `INTERNAL_ERROR` in `tests/layout-worker.test.js`, plus runner tests for result validation, unsupported/startup/message/timeout failures, silent cancellation, stale responses, and worker/listener/timer cleanup in `tests/layout-runner.test.js`
- [ ] T014 [P] [US1] Write failing Playwright scenarios for both modes within five keyboard actions, touch emulation, visible focus, 360px/short viewports, reduced motion, static results, live busy/success status, latest request wins, ten-run equality of placements/springs/radius/stats/endpoints in every configured browser project, and a localized retained-world matrix covering `UNKNOWN_MODE`, empty/invalid/overscale/non-finite/assignment/non-converged, unsupported/startup/message/timeout/WEBGL/render/internal failures in `tests/app.spec.js`

### Implementation for User Story 1

- [ ] T015 [US1] Implement versioned constants, request/hierarchy validation, exact ordering, Mulberry32, deterministic initial leaf/anchor state, d3-force DTO isolation, manual alpha phases, and result validation in `src/force-layout.js`
- [ ] T016 [US1] Implement the stateful hex-assignment force with radius-derived candidates, protected previous cells, deterministic deferred acceptance, cumulative proposal diagnostics, per-tick attraction, and final in-simulation `fx/fy` pinning in `src/force-layout.js`
- [ ] T017 [US1] Implement virtual-anchor link forces, no-link reusable ancestor-centroid forces, convergence checks, quantized structured springs, generic stats, and complete force `LayoutResult` output in `src/force-layout.js`
- [ ] T018 [P] [US1] Implement one-request module-worker success/failure serialization with production-safe `INTERNAL_ERROR` handling in `src/layout-worker.js` after T017
- [ ] T019 [P] [US1] Implement promise-based legacy/worker dispatch, dependency-injected Worker creation, timeout, result revalidation, silent cancellation, stale-response rejection, and `dispose()` in `src/layout-runner.js` after T017
- [ ] T020 [US1] Add `force-anchors` and `force-groups` mode IDs, localized labels/notes, async flags, spring flags, and opacity metadata in `src/layout.js`
- [ ] T021 [P] [US1] Add both algorithm options, associated description/status elements, `aria-describedby`, `aria-live`, and busy semantics in `index.html`
- [ ] T022 [US1] Integrate normalized data, `layout-runner`, request generations, detached candidate islands, and add-before-remove transactional commits while retaining the active world during calculation in `src/main.js`
- [ ] T023 [US1] Add localized typed-error mapping, silent cancellation behavior, busy/completed announcements, source-payload joins, generic gap-label mapping, and teardown cleanup in `src/main.js`
- [ ] T024 [P] [US1] Add non-animated busy/error treatment and make the control panel reachable on 360px and short mobile viewports while preserving focus and reduced-motion rules in `src/style.css`
- [ ] T025 [US1] Run the US1 Node and Playwright scenarios and record commands, build ID, Node and per-browser ten-run deterministic fixture comparisons, and every controlled failure outcome in `specs/001-force-directed-layout/validation/us1.md`

**Checkpoint**: Both force modes are selectable and independently satisfy US1 without requiring debug spring rendering.

---

## Phase 4: User Story 2 - Inspect Debug Springs (Priority: P2)

**Goal**: Anchor mode displays every active spring at world level zero through 50%-opaque towers and water; no-link mode explicitly displays no springs.

**Independent Test**: Use a hierarchy with known edge count, verify one zero-level line segment per edge in anchor mode, no spring object in grouping mode, line visibility through towers/water, preserved hover/selection encoding, and understandable mode/status text.

### Validation for User Story 2

- [ ] T026 [P] [US2] Extend failing object tests for non-finite endpoint rejection before allocation, 50% force-mode opacity, disabled tower depth writes, one batched `LineSegments`, two vertices per validated spring, literal `y = 0`, disabled line depth test/write, and raycast exclusion in `tests/island.test.js`
- [ ] T027 [P] [US2] After T014, extend failing browser tests for anchor spring count/status, no-link zero-spring status, transparent-tower hover/selection, camera-angle visibility, mobile presentation, and focused visual snapshots in `tests/app.spec.js`

### Implementation for User Story 2

- [ ] T028 [P] [US2] Render validated springs as one owned `THREE.LineSegments` buffer at `y = 0`, apply force-mode opacity/depth settings, preserve color/scale interaction, and omit spring resources for no-link mode in `src/island.js`
- [ ] T029 [P] [US2] After T023 and T027, announce active grouping method, spring count or absence, and tower transparency in algorithm/status/canvas accessibility text in `src/main.js`
- [ ] T030 [US2] After T024 and T028, tune line color/render order and transparent tower presentation against desktop/mobile visual scenarios without changing semantic mappings in `src/island.js` and `src/style.css`
- [ ] T031 [US2] Execute the fixed ten-participant spring-comprehension protocol and record anonymous aggregate evidence and build ID in `specs/001-force-directed-layout/validation/usability.md`

**Checkpoint**: US2 rendering is independently validated with fixture `LayoutResult` data; its browser integration is complete after the stated US1 dependency.

---

## Phase 5: User Story 3 - Restore Existing Layout Presentation (Priority: P3)

**Goal**: Switching from either force mode to any existing layout removes all force diagnostics, restores opaque towers, commits only the final selection, and disposes replaced resources once.

**Independent Test**: Repeatedly switch from both force modes through flat/nested/packed and verify zero springs, opacity 1, unchanged legacy positions/encodings, no stale commits, retained world on failure, and exactly-once cleanup.

### Validation for User Story 3

- [ ] T032 [P] [US3] After T026, extend failing island tests for opaque legacy materials after force candidates, zero legacy spring resources, factory-exception cleanup, and exactly-once disposal across repeated replacement in `tests/island.test.js`
- [ ] T033 [P] [US3] After T027, extend failing browser tests for force-to-flat/nested/packed switching, rapid mixed-mode selection, silent worker cancellation, legacy position/style restoration, retained-world errors, and no duplicate scene objects in `tests/app.spec.js`

### Implementation for User Story 3

- [ ] T034 [P] [US3] After T030 and T032, harden candidate ownership transfer, partial-factory cleanup, idempotent disposal, and legacy opaque material restoration in `src/island.js`
- [ ] T035 [P] [US3] After T029 and T033, finalize mixed synchronous/worker cancellation, stale candidate disposal, interaction-reference swaps, selection reset, and legacy summary restoration in `src/main.js`
- [ ] T036 [US3] Run repeated-switch and resource-lifecycle scenarios and record object counts, disposal evidence, and legacy regression results in `specs/001-force-directed-layout/validation/us3.md`

**Checkpoint**: US3 cleanup is independently validated at the island boundary and integrated through US1 orchestration; repeated mode changes leave only the current world's resources active.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Prove scale, accessibility, documentation, CI, and final quality gates across all selected stories.

- [ ] T037 [P] Implement the two-warmup/ten-run Playwright benchmark for all three fixtures with at least 20 input samples per run at 100ms spacing, nearest-rank p95, 2s/8s completion assertions, 100ms input-latency assertion, 250ms long-task limit, and 33.3ms five-second frame-median assertion in `tests/layout.benchmark.spec.js`
- [ ] T038 Run both modes through T037 and record per-mode/per-fixture pass or failure, exact hardware/browser/build metadata, raw samples, and threshold summaries without changing production code in `specs/001-force-directed-layout/validation/benchmark.md`
- [ ] T039 Classify every T038 threshold failure against profiler evidence in `specs/001-force-directed-layout/validation/benchmark.md`; record no optimization required when all pass, otherwise stop implementation and rerun `/speckit.tasks` with a focused failing case and exact source path before any production optimization
- [ ] T040 After T039 passes without production changes, run the named T014/T027 desktop keyboard, five-action, 360px touch, short-viewport, visible-focus, reduced-motion, live-region, failure-matrix, mobile visual, and static-motion scenarios and record evidence in `specs/001-force-directed-layout/validation/accessibility.md`
- [ ] T041 [P] Update architecture, force-mode behavior, controls, and validation commands in `README.md`
- [ ] T042 Add `npm test` immediately before the existing `npm run build` step while preserving every deployment step in `.github/workflows/deploy.yml`
- [ ] T043 Add and run a Chromium resource profile with exposed GC, 20 mixed-mode replacements, worker/island create-dispose counters, CDP allocation sampling across 300 idle animation frames, and three five-second idle windows in `tests/resource-profile.spec.js`; assert zero active workers, one active island, balanced disposal, no sampled allocation stack from feature-owned per-frame paths in `src/main.js`, and post-GC third-window heap no more than 1MB above the first, then record results in `specs/001-force-directed-layout/validation/resources.md`
- [ ] T044 Execute every scenario in `specs/001-force-directed-layout/quickstart.md`, run `npm test`, `npm run test:e2e`, `npm run benchmark:layout`, and `npm run build`, and record the final outcome in `specs/001-force-directed-layout/validation/final.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies; T002 and T003 can run in parallel after T001 is assigned
- **Phase 2 Foundation**: Depends on Setup and blocks all story implementation
- **Phase 3 US1**: Depends on Foundation and delivers the suggested MVP
- **Phase 4 US2**: Fixture rendering can start after Foundation; serialize `tests/app.spec.js` as T014 -> T027, `src/style.css` as T024 -> T030, `src/island.js` as T028 -> T030, and require T023 before T029
- **Phase 5 US3**: Fixture cleanup can start after Foundation; serialize `tests/island.test.js` as T026 -> T032, `tests/app.spec.js` as T027 -> T033, `src/island.js` as T030 -> T034, and `src/main.js` as T029 -> T035
- **Phase 6 Polish**: Depends on every user story selected for release

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 (MVP)
                    -> US2 renderer/tests -> US2 app integration after US1
                    -> US3 cleanup/tests  -> US3 app integration after US1
US1 + US2 + US3 -> Polish and release validation
```

### Within Each User Story

- Write and observe the story's failing contract/regression/browser scenarios first
- Implement pure model/layout behavior before worker, renderer, or UI integration
- Complete shared-file work sequentially; do not parallelize edits to `src/main.js`, `src/island.js`, or shared test files
- Validate the independent test criterion before moving to the next priority

### Parallel Opportunities

- Setup: T002 and T003 use separate files
- Foundation: T004 and T006 test separate pure boundaries
- US1 validation: T012, T013, and T014 use separate test files
- US1 integration: T018 and T019 can run together after T017; T021 and T024 touch independent UI files
- US2 validation: T026 and T027 use object-level and browser-level files
- US2 implementation: T028 and T029 can run together once their stated prerequisites pass
- US3 validation: T032 and T033 use separate test layers
- US3 implementation: T034 and T035 use separate ownership/orchestration files once their prerequisites pass
- Polish: T037 and T041 use independent files; T038 -> T039 -> T040 is the benchmark gate followed by final accessibility evidence

---

## Parallel Example: User Story 1

```text
Task T012: Write pure force-layout contract and determinism tests in tests/force-layout.test.js
Task T013: Write worker-runner lifecycle tests in tests/layout-runner.test.js
Task T014: Write user journey scenarios in tests/app.spec.js

After T017:
Task T018: Implement src/layout-worker.js
Task T019: Implement src/layout-runner.js
```

## Parallel Example: User Story 2

```text
Task T026: Write spring geometry/material tests in tests/island.test.js
Task T027: Write debug presentation browser scenarios in tests/app.spec.js

After validation scenarios exist:
Task T028: Implement spring/tower rendering in src/island.js
Task T029: Implement accessible debug status in src/main.js
```

## Parallel Example: User Story 3

```text
Task T032: Write island cleanup/legacy presentation tests in tests/island.test.js
Task T033: Write repeated switching scenarios in tests/app.spec.js

After validation scenarios exist and US1 integration is available:
Task T034: Harden src/island.js resource ownership
Task T035: Harden src/main.js mixed-mode orchestration
```

---

## Implementation Strategy

### MVP First: User Story 1

1. Complete Setup and Foundation.
2. Implement both force calculations, worker lifecycle, selector integration, and static transactional commits in US1.
3. Run T025 and stop for independent validation.
4. Demo deterministic leaf-only layouts before adding debug presentation.

### Incremental Delivery

1. US1 adds selectable deterministic layouts on unique hex centers.
2. US2 adds visible anchor diagnostics and transparent force presentation without changing layout contracts.
3. US3 proves safe return to existing modes and closes lifecycle/resource risks.
4. Polish validates maximum scale, accessibility, documentation, CI, and all build gates.

### Parallel Team Strategy

1. Complete Setup and Foundation sequentially around shared source files.
2. After Foundation, assign US1 algorithm/worker, US2 renderer fixtures, and US3 cleanup fixtures to separate owners.
3. Merge shared `src/main.js`, `src/island.js`, and browser-test work sequentially in priority order.

## Notes

- `[P]` means different files and no dependency on another incomplete task beyond the stated phase/task prerequisite.
- User-story labels provide traceability to `spec.md` priorities.
- Tests are mandatory here because deterministic layout, regression behavior, reusable contracts, visual interaction, and resource cleanup require evidence.
- Do not add collision force unless benchmark or visual evidence in T038 demonstrates a concrete need and T039 first captures the focused failing case.
- Do not update specification status from Draft without explicit approval.
- `npm run build` is required before completion even when all tests pass.
