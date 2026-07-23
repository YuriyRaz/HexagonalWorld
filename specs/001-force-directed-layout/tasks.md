---

description: "Implementation tasks for the force-directed layout"
---

# Tasks: Force-Directed Layout

**Input**: Design documents from `/specs/001-force-directed-layout/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Validation**: Tests are required by the approved specification and plan. Each contract, regression, object, and browser scenario must be written and observed failing for the intended reason before the corresponding implementation task begins.

**Organization**: Tasks are grouped by user story. Shared files are explicitly serialized; a task marked `[P]` changes a different file and has no dependency on another incomplete task beyond the prerequisite stated in its description.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes a different file and all prerequisites are complete
- **[Story]**: Maps a task to US1, US2, or US3
- Every task names the exact file or files it changes or records evidence in

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the selected dependency and establish repeatable Node, portable-browser, focused-visual, and benchmark entry points.

- [X] T001 Install exact `d3-force@3.0.0` and add `test`, `test:e2e`, and `benchmark:layout` scripts in `package.json` and `package-lock.json`
- [X] T002 [P] Configure 16 Playwright projects - 9 portable projects (`desktop|phone|tablet` x `chromium|firefox|webkit`), 6 focused projects (`visual-desktop|visual-mobile` x `chromium|firefox|webkit`), and `benchmark-chromium` - with the prescribed viewport, DPR, input, and Vite web-server settings in `playwright.config.js`
- [X] T003 [P] Create deterministic valid, malformed, grouping, representative (1,200 leaves/20 depth-1 internals/5 roots/2,400 memberships/1,220 links), current-maximum (4,800 leaves/80 depth-1 internals/10 roots/9,600 memberships/4,880 links), structural-maximum (4,800 leaves/1,200 internals/depth 16/76,800 memberships/5,999 links/radius at most 256), 6,000-link rejection, radius-257 rejection, zero-spring, and camera/probe-region fixtures in `tests/fixtures/hierarchies.js`

**Checkpoint**: Dependencies, fixtures, and test entry points are ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish domain-neutral hierarchy data, shared axial geometry, normalized legacy output, and exception-safe render ownership before implementing the force mode.

**Critical**: No user-story implementation begins until this phase passes its tests.

- [X] T004 [P] Write and observe failing tests for axial distance, canonical ring/spiral order, half-away-from-zero quantization, axial rounding, and axial-to-plane conversion in `tests/hex.test.js`
- [X] T005 Implement allocation-conscious axial helpers and constants that satisfy T004 in `src/hex.js`
- [X] T006 [P] Write and observe failing tests for stable hierarchy normalization, input immutability, generic visual payload, exact code-unit ID ordering, empty/duplicate/missing-parent/self-parent/cycle rejection, and request-computable entity/depth/membership limits in `tests/data.test.js`
- [X] T007 Refactor the source adapter to emit `NormalizedEntity[]` and a `VisualEntityPayload` lookup without changing generated user-visible data, satisfying T006 in `src/data.js`
- [X] T008 Write and observe failing regressions for existing flat/nested/packed placements, unified `LayoutResult`, unknown modes, generic depth-indexed boundary gaps, and deterministic multi-source hex-wavefront gaps after T005 and T007 in `tests/layout.test.js`
- [X] T009 Refactor existing layouts to consume normalized IDs/relationships/order, reuse `src/hex.js`, preserve placement and gap semantics, and return empty springs plus legacy diagnostics after T008 in `src/layout.js`
- [X] T010 Write and observe failing object tests for payload/cell/spring validation before allocation, generic payload joins, detached creation, opaque legacy presentation, partial-allocation cleanup, and idempotent handle disposal in `tests/island.test.js`
- [X] T011 Refactor rendering to consume a completed `LayoutResult`, build detached candidates, transfer all allocations to an idempotent `IslandHandle`, and preserve the existing opaque world after T010 in `src/island.js`

**Checkpoint**: `npm test` passes for generic data, axial helpers, legacy layouts, generic statistics, and baseline island ownership.

---

## Phase 3: User Story 1 - Select Force-Directed Layout (Priority: P1) MVP

**Goal**: A user selects the single `force-anchors` mode and receives a deterministic static leaf-only layout on unique hex centers while the previous valid world remains available until commit.

**Independent Test**: On fixed generic hierarchies, select `force-anchors` and verify one unique placement per leaf, no internal placements, exact ten-run and input-order repeatability, grouping cohesion, keyboard/touch access, latest-request commit, live status, and retained-world failures in every portable engine/class project.

### Validation for User Story 1

- [X] T012 [P] [US1] Write and observe failing force-layout tests for immutable request/config input, exact version-1 config, collision-safe structured identities, deterministic initialization, fixed 256-tick alpha phases, virtual anchors/immediate-parent links, 5,999 links accepted/6,000 rejected before simulation, bounded deferred assignment, radius 256 accepted/radius 257 rejected before publication, exact final pinning, convergence diagnostics, grouping ratio, all typed calculation failures, reordered input, and ten-run equality in `tests/force-layout.test.js`
- [X] T013 [P] [US1] Write and observe failing one-request worker tests for structured-clone-safe success/failure messages, request-ID agreement, and production-safe `INTERNAL_ERROR` serialization in `tests/layout-worker.test.js`
- [X] T014 [P] [US1] Write and observe failing runner tests for synchronous legacy dispatch, module-worker dispatch, 5,999-spring/radius-256 result revalidation, unsupported/startup/message failures, production `hangGuardMs=60000`, controlled-timer timeout with injected `hangGuardMs=50`, silent cancellation, stale responses, and exactly-once worker/listener/timer cleanup in `tests/layout-runner.test.js`
- [X] T015 [US1] Write and observe failing browser scenarios for keyboard and touch selection, five-action keyboard limit, selector focus retained when busy begins, visible focus, boundary/short viewports, reduced motion, static results, busy/success/error live status, latest request wins, deterministic exposed results, and retained-world failures including unsupported link/radius and guard timeout in `tests/app.spec.js`

### Implementation for User Story 1

- [X] T016 [US1] Implement version-1 constants, hierarchy/config validation, exact ordering, Mulberry32, immutable simulation DTOs, canonical leaf initialization, quantized anchor initialization, and explicit stopped d3-force setup after T012 in `src/force-layout.js`
- [X] T017 [US1] Implement the custom hex-assignment force with radius-derived canonical candidates, protected previous cells, deterministic deferred acceptance, bounded proposal diagnostics, per-tick attraction, assignment lock, and final in-simulation `fx/fy` pinning after T016 in `src/force-layout.js`
- [X] T018 [US1] Implement virtual-anchor immediate-parent forces with the 5,999-link pre-simulation limit, manual 256-tick alpha scheduling, convergence/invariant checks, radius-256 result validation without clamping, quantized structured springs, grouping metrics, generic stats, and complete deterministic `LayoutResult` output after T017 in `src/force-layout.js`
- [X] T019 [P] [US1] Implement one-request module-worker calculation and production-safe success/failure serialization after T013 and T018 in `src/layout-worker.js`
- [X] T020 [P] [US1] Implement promise-based legacy/worker dispatch, dependency-injected worker creation, production `hangGuardMs=60000` and injectable `50` ms timeout tests, 5,999-spring/radius-256 response validation, silent supersession, stale-result rejection, timeout cleanup, and idempotent disposal after T014 and T018 in `src/layout-runner.js`
- [X] T021 [US1] Add only the `force-anchors` mode with localized label/note, `isAsync`, `showSprings`, and `occupiedOpacity` metadata after T009 and T018 in `src/layout.js`
- [X] T022 [P] [US1] Add the single force option, associated algorithm note and live status, `aria-describedby`, and busy semantics after T015 in `index.html`
- [X] T023 [US1] Integrate normalized data, monotonic request IDs, `layout-runner`, detached island candidates, latest-request checks, and add-before-remove transactional world commits after T019-T022 in `src/main.js`
- [X] T024 [US1] Add localized typed-error mapping, silent cancellation, calculating/completed/retained-world announcements, source-payload joins, generic gap-label mapping, candidate rollback, and teardown cleanup after T023 in `src/main.js`
- [X] T025 [P] [US1] Add non-animated busy/error treatment and keep controls reachable with visible focus at 360px width and short mobile heights while preserving reduced-motion behavior after T015 in `src/style.css`
- [ ] T026 [US1] Run the complete US1 scenario in `desktop-chromium` at 1024x720 with keyboard/pointer and append command, bundled engine revision, deterministic-result, status, and failure outcomes in `specs/001-force-directed-layout/validation/us1.md`
- [ ] T027 [US1] After T026, run the complete US1 scenario in `desktop-firefox` at 1024x720 with keyboard/pointer and append command, bundled engine revision, deterministic-result, status, and failure outcomes in `specs/001-force-directed-layout/validation/us1.md`
- [ ] T028 [US1] After T027, run the complete US1 scenario in `desktop-webkit` at 1024x720 with keyboard/pointer and append command, bundled engine revision, deterministic-result, status, and failure outcomes in `specs/001-force-directed-layout/validation/us1.md`
- [ ] T029 [US1] After T028, run the complete US1 scenario in `phone-chromium` at 360x800 with touch and append command, bundled engine revision, deterministic-result, status, and emulation outcomes in `specs/001-force-directed-layout/validation/us1.md`
- [ ] T030 [US1] After T029, run the complete US1 scenario in `phone-firefox` at 360x800 with touch where emulatable, record any capability limitation, and append command, revision, deterministic-result, and status outcomes in `specs/001-force-directed-layout/validation/us1.md`
- [ ] T031 [US1] After T030, run the complete US1 scenario in `phone-webkit` at 360x800 with touch where emulatable, record any capability limitation, and append command, revision, deterministic-result, and status outcomes in `specs/001-force-directed-layout/validation/us1.md`
- [ ] T032 [US1] After T031, run the complete US1 scenario in `tablet-chromium` at 768x1024 with touch or pointer and append command, bundled engine revision, deterministic-result, status, and input outcomes in `specs/001-force-directed-layout/validation/us1.md`
- [ ] T033 [US1] After T032, run the complete US1 scenario in `tablet-firefox` at 768x1024 with touch or pointer, record any capability limitation, and append command, revision, deterministic-result, and status outcomes in `specs/001-force-directed-layout/validation/us1.md`
- [ ] T034 [US1] After T033, run the complete US1 scenario in `tablet-webkit` at 768x1024 with touch or pointer, record any capability limitation, and append command, revision, deterministic-result, and status outcomes in `specs/001-force-directed-layout/validation/us1.md`

**Checkpoint**: The single force mode independently satisfies US1 in all nine portable engine/class projects.

---

## Phase 4: User Story 2 - Inspect Debug Springs (Priority: P2)

**Goal**: The force mode displays every active immediate-parent spring at world `y = 0`, distinguishable through 50%-opaque towers but normally occluded by opaque geometry.

**Independent Test**: With a known-edge fixture, verify one segment per active relation, no object for a zero-relation result, exact material/depth/resource invariants, unchanged color/height mappings, and all prescribed 5x5 device-pixel contrast/occlusion probes in the six focused visual projects without changing the user camera preset.

### Validation for User Story 2

- [X] T035 [P] [US2] After T010, extend and observe failing object tests for non-finite endpoint, radius-above-256, and spring-count-above-5,999 rejection before allocation; 50% tower opacity; disabled translucent depth writes; one batched `LineSegments`; two vertices per spring; literal `y = 0`; spring `depthTest: true`/`depthWrite: false`; zero-spring resource omission; unchanged color/height mappings; raycast exclusion; and exact disposal in `tests/island.test.js`
- [X] T036 [US2] After T015, extend and observe failing browser scenarios for spring count/status, zero-active-relation success, exact camera application/restoration, predefined 5x5 screenshot-device-pixel regions, WCAG sRGB-linearized relative-luminance contrast, at least one 3:1 pixel in every visible-spring/hover/selection region, at-most-5-per-channel RGB difference in every opaque region versus a spring-disabled control frame, and unchanged user camera preset in `tests/app.spec.js`

### Implementation for User Story 2

- [X] T037 [P] [US2] Reject radius above 256 or more than 5,999 springs before allocation, render validated springs as one handle-owned `THREE.LineSegments` buffer at literal `y = 0`, apply physical depth settings and 50% force-tower presentation, preserve color/height/scale interactions, omit zero-spring resources, and dispose exactly once after T035 in `src/island.js`
- [X] T038 [P] [US2] Announce virtual-anchor grouping, active spring count or zero-spring success, and tower transparency in algorithm/status/canvas accessibility text after T024 and T036 in `src/main.js`
- [X] T039 [P] [US2] Preserve readable note/status presentation and focus/selection cues for translucent towers across the desktop and mobile visual viewports after T025 and T036 in `src/style.css`
- [X] T040 [US2] Run `visual-desktop-chromium` at 1440x900/DPR 1/FOV 34/target control-spring midpoint at `y=0`/azimuth 32/elevation 30/distance 43; execute every 5x5 device-pixel 3:1 visible/hover/selection probe and every at-most-5-RGB opaque-control comparison; record raw probe results, object invariants, and camera restoration in `specs/001-force-directed-layout/validation/us2.md`
- [X] T041 [US2] After T040, run the identical desktop camera and pixel-probe assertions in `visual-desktop-firefox` and append engine revision, raw probe results, object invariants, and camera restoration in `specs/001-force-directed-layout/validation/us2.md`
- [X] T042 [US2] After T041, run the identical desktop camera and pixel-probe assertions in `visual-desktop-webkit` and append engine revision, raw probe results, object invariants, and camera restoration in `specs/001-force-directed-layout/validation/us2.md`
- [X] T043 [US2] After T042, run `visual-mobile-chromium` at 390x844/DPR 3/FOV 34/target control-spring midpoint at `y=0`/azimuth 32/elevation 30/distance 72; execute every 5x5 device-pixel 3:1 visible/hover/selection probe and every at-most-5-RGB opaque-control comparison; append raw probe results, object invariants, and camera restoration in `specs/001-force-directed-layout/validation/us2.md`
- [X] T044 [US2] After T043, run the identical mobile camera and pixel-probe assertions in `visual-mobile-firefox` and append engine revision, raw probe results, object invariants, and camera restoration in `specs/001-force-directed-layout/validation/us2.md`
- [X] T045 [US2] After T044, run the identical mobile camera and pixel-probe assertions in `visual-mobile-webkit` and append engine revision, raw probe results, object invariants, and camera restoration in `specs/001-force-directed-layout/validation/us2.md`
- [ ] T046 [US2] After T037-T045 and a successful `npm run build`, execute SC-007 with exactly ten first-time participants using the fixed unprompted identify-and-trace task, and record build ID, anonymous pass/fail totals, and the required at-least-9-of-10 result in `specs/001-force-directed-layout/validation/usability.md`

**Checkpoint**: US2 passes object contracts and all six exact camera-preset visual projects.

---

## Phase 5: User Story 3 - Restore Existing Layout Presentation (Priority: P3)

**Goal**: Switching from the force mode to any existing layout removes springs, restores opaque towers and legacy output, commits only the newest selection, and releases replaced resources exactly once.

**Independent Test**: Repeatedly switch from `force-anchors` through flat, nested, and packed modes and verify empty springs, opacity 1, unchanged legacy positions/encodings/statistics, no stale commits or duplicate scene objects, retained-world errors, and balanced cleanup.

### Validation for User Story 3

- [X] T047 [P] [US3] After T035, extend and observe failing island tests for opaque legacy materials after force candidates, zero legacy spring resources, factory-exception cleanup, idempotent candidate disposal, and exactly-once replacement disposal in `tests/island.test.js`
- [X] T048 [US3] After T036, extend and observe failing browser scenarios for force-to-flat/nested/packed switching, rapid mixed-mode selection, silent worker cancellation, unchanged legacy placements/styles/statistics, retained-world failures, and no duplicate scene objects in `tests/app.spec.js`

### Implementation for User Story 3

- [X] T049 [P] [US3] Harden island candidate ownership transfer, partial-factory cleanup, force-to-legacy material restoration, and idempotent replacement disposal after T037 and T047 in `src/island.js`
- [X] T050 [P] [US3] Finalize mixed synchronous/worker cancellation, stale-candidate disposal, interaction-reference rollback/swap, selection restoration, and legacy summary restoration after T038 and T048 in `src/main.js`
- [X] T051 [US3] Run repeated force-to-flat/nested/packed switching and failure recovery, then record scene-object counts, worker/island disposal evidence, and legacy regression outcomes in `specs/001-force-directed-layout/validation/us3.md`

**Checkpoint**: US3 leaves exactly one current world with no stale force presentation or resources.

---

## Phase 6: Polish and Cross-Cutting Validation

**Purpose**: Prove performance, accessibility, lifecycle quality, documentation, build health, and every supported release/browser/device combination.

- [ ] T052 [P] Implement the clarified acceptance benchmark for the representative, current-maximum, and structural-maximum fixtures: two excluded warmups plus ten selector-to-commit measurements; nearest-rank p95 `sorted[ceil(0.95*N)-1]` (rank 10, the maximum, for N=10); 2s representative and 8s maximum limits; after busy status with the selector focused, exactly one `Tab` per measured run timed from `keydown.timeStamp` to the first subsequent `requestAnimationFrame` callback with rank-10 p95 at most 100ms; ten five-second post-commit frame windows per 4,800-leaf fixture pooled into one median at most 33.3ms; and layout-period long tasks captured only as diagnostics in `tests/layout.benchmark.spec.js`
- [ ] T053 Run T052 only in `benchmark-chromium` on Windows 11/Intel Core i7-1360P/32GB/AC power/1440x900/DPR 1/no CPU throttle with nonessential applications closed; record exact OS/browser/build metadata, warmups, all raw completion/Tab/frame samples, rank calculations, pooled frame median, and long-task diagnostics while confirming no 2s/8s per-run abort, production `hangGuardMs=60000`, and injected timeout-test `hangGuardMs=50` in `specs/001-force-directed-layout/validation/benchmark.md`
- [ ] T054 [P] Add browser resource-profile assertions for repeated mixed-mode replacements, zero active superseded workers, exactly one active island, balanced create/dispose counts, stable listeners, and no feature-owned per-frame allocation path in `tests/resource-profile.spec.js`
- [ ] T055 Run T054 after T049-T050 and record worker, island, GPU-object, listener, and per-frame allocation evidence in `specs/001-force-directed-layout/validation/resources.md`
- [ ] T056 Run keyboard-only selection, touch selection, live statuses/errors, visible focus, 360px and short viewport reachability, all three boundary classes, and reduced-motion/static-result scenarios in all nine portable Playwright projects and record commands, revisions, limitations, and outcomes in `specs/001-force-directed-layout/validation/accessibility.md`
- [ ] T057 [P] Document architecture boundaries, the single force mode, virtual anchors, physical spring occlusion, 50% tower opacity, controls, test commands, and performance/release-validation procedures in `README.md`
- [ ] T058 [P] Create the 18-row release evidence matrix with product, engine, release, OS/device, viewport, input, WebGL 2, module-worker, primary-scenario, and camera/probe columns in `specs/001-force-directed-layout/validation/final.md`
- [ ] T059 After T058, certify current stable Google Chrome/Blink on an applicable desktop/laptop at 1024x720 with keyboard/pointer for selection, build, spring-present, zero-spring, and legacy-restore scenarios; also run the exact desktop camera/probe preset; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T060 After T059, certify current stable Google Chrome/Blink on an Android phone at 360x800 with touch for the primary scenarios and exact mobile camera/probe preset; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T061 After T060, certify current stable Google Chrome/Blink on an Android tablet/hybrid at 768x1024 with touch or pointer for the primary scenarios; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T062 After T061, certify previous stable Google Chrome/Blink on an applicable desktop/laptop at 1024x720 with keyboard/pointer for the primary scenarios and exact desktop camera/probe preset; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T063 After T062, certify previous stable Google Chrome/Blink on an Android phone at 360x800 with touch for the primary scenarios and exact mobile camera/probe preset; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T064 After T063, certify previous stable Google Chrome/Blink on an Android tablet/hybrid at 768x1024 with touch or pointer for the primary scenarios; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T065 After T064, certify current stable Mozilla Firefox/Gecko on an applicable desktop/laptop at 1024x720 with keyboard/pointer for the primary scenarios and exact desktop camera/probe preset; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T066 After T065, certify current stable Mozilla Firefox/Gecko on an Android phone at 360x800 with touch for the primary scenarios and exact mobile camera/probe preset; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T067 After T066, certify current stable Mozilla Firefox/Gecko on an Android tablet/hybrid at 768x1024 with touch or pointer for the primary scenarios; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T068 After T067, certify previous stable Mozilla Firefox/Gecko on an applicable desktop/laptop at 1024x720 with keyboard/pointer for the primary scenarios and exact desktop camera/probe preset; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T069 After T068, certify previous stable Mozilla Firefox/Gecko on an Android phone at 360x800 with touch for the primary scenarios and exact mobile camera/probe preset; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T070 After T069, certify previous stable Mozilla Firefox/Gecko on an Android tablet/hybrid at 768x1024 with touch or pointer for the primary scenarios; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T071 After T070, certify current stable Apple Safari/WebKit on macOS at 1024x720 with keyboard/pointer for the primary scenarios and exact desktop camera/probe preset using compatible Apple infrastructure or a real-browser/device service; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T072 After T071, certify current stable Apple Safari/WebKit on iPhone at 360x800 with touch for the primary scenarios and exact mobile camera/probe preset using compatible Apple infrastructure or a real-device service; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T073 After T072, certify current stable Apple Safari/WebKit on iPad at 768x1024 with touch or pointer for the primary scenarios using compatible Apple infrastructure or a real-device service; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T074 After T073, certify previous stable Apple Safari/WebKit on macOS at 1024x720 with keyboard/pointer for the primary scenarios and exact desktop camera/probe preset using compatible Apple infrastructure or a real-browser/device service; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T075 After T074, certify previous stable Apple Safari/WebKit on iPhone at 360x800 with touch for the primary scenarios and exact mobile camera/probe preset using compatible Apple infrastructure or a real-device service; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T076 After T075, certify previous stable Apple Safari/WebKit on iPad at 768x1024 with touch or pointer for the primary scenarios using compatible Apple infrastructure or a real-device service; record exact versions and outcomes in `specs/001-force-directed-layout/validation/final.md`
- [ ] T077 Execute every scenario in `specs/001-force-directed-layout/quickstart.md`, then run `npm test`, `npm run test:e2e`, `npm run benchmark:layout`, and `npm run build`; append commands, build ID, results, unresolved limitations, and final acceptance status after T053, T055-T058, and T076 in `specs/001-force-directed-layout/validation/final.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies; T002 and T003 can run in parallel after T001 is assigned.
- **Phase 2 Foundation**: Depends on Setup and blocks all user-story implementation.
- **Phase 3 US1**: Depends on Foundation and delivers the MVP.
- **Phase 4 US2**: Object/browser tests can be prepared after Foundation, but its shared files follow the serialization chains below and app integration depends on US1.
- **Phase 5 US3**: Tests can be prepared after the preceding shared-file tests; implementation depends on the relevant US1/US2 source changes.
- **Phase 6 Polish**: Depends on all three completed user stories; T077 is the final gate.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 (MVP)
                    -> US2 object/browser tests -> US2 integration after US1
                    -> US3 object/browser tests -> US3 integration after US1/US2
US1 + US2 + US3 -> Performance/resources/accessibility -> 18 release targets -> Final gate
```

### Shared-File Serialization

- `tests/island.test.js`: T010 -> T035 -> T047.
- `tests/app.spec.js`: T015 -> T036 -> T048.
- `src/layout.js`: T009 -> T021.
- `src/island.js`: T011 -> T037 -> T049.
- `src/main.js`: T023 -> T024 -> T038 -> T050.
- `src/style.css`: T025 -> T039.
- `specs/001-force-directed-layout/validation/us1.md`: T026 -> T027 -> T028 -> T029 -> T030 -> T031 -> T032 -> T033 -> T034.
- `specs/001-force-directed-layout/validation/us2.md`: T040 -> T041 -> T042 -> T043 -> T044 -> T045.
- `specs/001-force-directed-layout/validation/final.md`: T058 -> T059 -> T060 -> T061 -> T062 -> T063 -> T064 -> T065 -> T066 -> T067 -> T068 -> T069 -> T070 -> T071 -> T072 -> T073 -> T074 -> T075 -> T076 -> T077.

### Test-Before-Implementation Gates

- Foundation: T004 before T005, T006 before T007, T008 before T009, and T010 before T011.
- US1: T012-T015 must fail for the intended reason before T016-T025.
- US2: T035-T036 must fail for the intended reason before T037-T039.
- US3: T047-T048 must fail for the intended reason before T049-T050.
- Do not combine a failing-test task with its production implementation task.

### Parallel Opportunities

- Setup: T002 and T003 use separate files.
- Foundation: T004 and T006 can begin together; implementations remain behind their own failing tests.
- US1 validation: T012, T013, and T014 use separate files; T019 and T020 can proceed together after T018.
- US1 UI: T022 and T025 use separate files after T015 while `src/main.js` remains serialized.
- US2: T035 and T036 use different shared test files after their prior chain entries; T037, T038, and T039 then use different source files. T046 intentionally waits for completed implementation, visual evidence, and a successful build.
- US3: T047 and T048 use different test files; T049 and T050 then use different source files.
- Polish: T052, T054, T057, and T058 use separate files until T058 creates the shared final evidence matrix. T059-T077 are intentionally sequential because they append to that file.

---

## Parallel Example: User Story 1

```text
Task T012: tests/force-layout.test.js
Task T013: tests/layout-worker.test.js
Task T014: tests/layout-runner.test.js

After T018:
Task T019: src/layout-worker.js
Task T020: src/layout-runner.js
```

## Parallel Example: User Story 2

```text
After T035-T036 fail as expected:
Task T037: src/island.js
Task T038: src/main.js
Task T039: src/style.css
```

## Parallel Example: User Story 3

```text
Task T047: tests/island.test.js
Task T048: tests/app.spec.js

After both tests fail as expected:
Task T049: src/island.js
Task T050: src/main.js
```

---

## Implementation Strategy

### MVP First: User Story 1

1. Complete Setup and Foundation.
2. Write and observe all US1 failing tests.
3. Implement the single deterministic `force-anchors` pipeline, worker lifecycle, and transactional UI integration.
4. Run T026-T034 and stop for independent validation in all nine portable projects.

### Incremental Delivery

1. US1 delivers selectable deterministic leaf-only layouts on unique hex centers.
2. US2 adds complete spring diagnostics and 50%-opaque tower presentation, proven by six exact camera projects.
3. US3 proves safe return to every existing mode and closes replacement/resource risks.
4. Phase 6 validates clarified performance statistics, resources, accessibility, all 18 supported release targets, and the final build.

### Performance Acceptance Method

- Run exactly two unmeasured warmups before ten measured builds for each force fixture.
- Measure end to end from selector change through committed active status, including worker startup, clone/transport, calculation, validation, candidate rendering, and commit.
- Sort the ten completion durations ascending and use nearest-rank `ceil(0.95 * 10) = 10`; the acceptance value is the slowest measured build. Require at most 2 seconds for 1,200 leaves and 8 seconds for each 4,800-leaf fixture.
- During each measured build, wait for busy status while the algorithm selector remains focused, press `Tab` exactly once, measure `keydown.timeStamp` to the first subsequent `requestAnimationFrame` callback, and apply the same rank-10 p95, requiring at most 100ms.
- For every measured 4,800-leaf build, collect all frame deltas in one five-second post-commit window. Pool deltas from all ten windows and require one median at most 33.3ms; exclude warmups.
- Capture layout-period long tasks with `PerformanceObserver` as diagnostics only; there is no long-task acceptance threshold.
- Never use 2 or 8 seconds as an individual run timeout. Use `hangGuardMs=60000` in production and dependency-inject exactly `50` in controlled timeout tests; this guard exists only for stuck-resource recovery and is neither equal to nor derived from acceptance thresholds.

## Notes

- Tests are mandatory because the approved artifacts require deterministic contracts, browser interaction/visual checks, lifecycle evidence, and performance acceptance.
- Bundled Playwright projects provide portable automation but do not replace the 18 current/previous stable Google Chrome, Mozilla Firefox, and Apple Safari certification tasks.
- A missing WebGL 2 or module worker is an expected unsupported-environment outcome, not a passing supported-platform certification.
- Do not add collision force unless measured evidence demonstrates a concrete need and the task list is regenerated with a focused failing case.
- Complete `npm run build` before implementation is accepted.
