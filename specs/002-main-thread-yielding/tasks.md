# Tasks: Main Thread Yielding for Responsive Event Loop

**Input**: Design documents from `/specs/002-main-thread-yielding/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Validation**: Include automated tests for deterministic data/layout behavior, regressions, and reusable
contracts when practical. Include browser-level scenarios for rendering and interaction changes. Every
feature includes independent acceptance validation and `npm run build`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Foundational (Blocking Prerequisite)

**Purpose**: Fix the root cause — `addEventListener('beforeunload', ...)` registered inside `animate()` on every frame, accumulating thousands of listeners and starving the event loop.

**⚠️ CRITICAL**: No user story validation can succeed until this phase is complete

- [x] T001 Move `addEventListener('beforeunload', ...)` from inside `animate()` to module scope in src/main.js — register exactly once at startup, not per frame (lines 528-530)

**Checkpoint**: Listener accumulation bug fixed — event loop starvation eliminated

---

## Phase 2: User Story 1 - Responsive UI at Small Viewports (Priority: P1) 🎯 MVP

**Goal**: Controls remain reachable and status updates appear within time budgets at 360×568 viewport

**Independent Test**: Load app at 360×568, select layout algorithm, verify `#layout-status` updates and all controls are reachable within 5 seconds

### Implementation for User Story 1

- [x] T002 [US1] Add frame budget guard to `updateHover()` in src/main.js — skip raycasting if elapsed frame time exceeds 16ms (defensive measure per research.md R3)
- [x] T003 [US1] Run `npm run build` to verify no syntax or build errors in src/main.js

**Checkpoint**: Fix applied and builds successfully — ready for E2E validation

---

## Phase 3: User Story 2 - Playwright Test Reliability (Priority: P2)

**Goal**: The reachability test passes at 360×568 within 30 seconds without timeout

**Independent Test**: `npx playwright test tests/app.spec.js -g "keeps controls reachable" --project=chromium-360x568` passes

### Validation for User Story 2

- [x] T004 [US2] Run Playwright reachability test at 360×568 viewport and confirm it passes within 30s in tests/app.spec.js

**Checkpoint**: Test passes — no more timeout failures at small viewport

---

## Phase 4: User Story 3 - Consistent Behavior Across Viewports (Priority: P3)

**Goal**: No viewport-dependent regressions — test passes at both 360×568 and 1024×720

**Independent Test**: Run full E2E test suite and verify zero failures at all viewport profiles

### Validation for User Story 3

- [x] T005 [US3] Run full E2E test suite (`npm run test:e2e`) and verify all tests pass at all viewport profiles
- [x] T006 [US3] Run quickstart.md Scenario 5 to verify beforeunload listener count is exactly 1 after 60 seconds

**Checkpoint**: All user stories validated — no regressions across viewports

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [x] T007 Verify render loop maintains ≥30fps at 360×568 by running quickstart.md Scenario 4 (manual check)
- [x] T008 Verify no visual differences in rendered output before and after the change (SC-005)
- [x] T009 Run `npm run build` as final verification

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately
- **User Story 1 (Phase 2)**: Depends on Foundational (T001 must complete first)
- **User Story 2 (Phase 3)**: Depends on User Story 1 (T002, T003 must complete first)
- **User Story 3 (Phase 4)**: Depends on User Story 2 (T004 must pass first)
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — implements the fix
- **User Story 2 (P2)**: Depends on US1 — validates the fix via Playwright test
- **User Story 3 (P3)**: Depends on US2 — validates no regressions across viewports

### Within Each User Story

- Implementation before validation
- Build verification before E2E test execution
- Single-viewport validation before cross-viewport validation

### Parallel Opportunities

- T002 and T003 can run in parallel (different concerns in same file)
- T005 and T006 can run in parallel (independent validation scenarios)

---

## Parallel Example: User Story 1

```bash
# T002 and T003 can be parallelized:
Task: "Add frame budget guard to updateHover() in src/main.js"
Task: "Run npm run build to verify no syntax errors"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Fix the beforeunload listener bug (T001)
2. Complete Phase 2: Add frame budget guard + build verification (T002, T003)
3. **STOP and VALIDATE**: Run `npm run build` — if it passes, the core fix is done
4. The Playwright test should now pass at 360×568

### Incremental Delivery

1. Fix listener bug → Build succeeds → Core fix complete
2. Add frame budget guard → Defensive measure in place
3. Run Playwright test at 360×568 → Test reliability confirmed
4. Run full E2E suite → No regressions confirmed
5. Manual validation → Visual correctness confirmed

### Single Developer Strategy

This is a single-file change with straightforward validation:

1. Fix the bug (T001) — 1 minute
2. Add defensive guard (T002) — 2 minutes
3. Build (T003) — 30 seconds
4. Run targeted test (T004) — 2 minutes
5. Run full suite (T005) — 5 minutes
6. Manual check (T007) — 2 minutes

Total estimated time: ~15 minutes

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Complete `npm run build` before marking the feature complete
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The primary fix (T001) is a 3-line change: move `addEventListener('beforeunload', ...)` from line 528-530 to module scope (before the `animate` function definition)
