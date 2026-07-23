# Tasks: Fix Test Config Race Condition

**Input**: Design documents from `/specs/001-fix-test-config-race/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/test-api.md

**Validation**: Run `npm run test:e2e -- --grep "announces failures"` to verify all 14 scenarios pass. Run `npm run build` to verify no build errors.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No setup needed — project structure already exists

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No foundational tasks needed — fix targets existing code

---

## Phase 3: User Story 1 - Failure Scenario Test Passes Reliably (Priority: P1) 🎯 MVP

**Goal**: Add `forceRebuild()` test API and use it in the failure scenario loop to eliminate the race condition

**Independent Test**: `npm run test:e2e -- --grep "announces failures"` completes all 14 scenarios within 120 seconds

### Validation for User Story 1

- [x] T001 [P] [US1] Verify the race condition exists by running `npm run test:e2e -- --grep "announces failures"` — expect timeout or failure after ~7 scenarios

### Implementation for User Story 1

- [x] T002 [P] [US1] Add `forceRebuild` method to `window.__hexWorldTest` test API in src/main.js (after the existing `getState` assignment, ~line 340)
- [x] T003 [P] [US1] Add `forceRebuild()` helper function in tests/app.spec.js (after `waitForActiveMode`, ~line 67)
- [x] T004 [US1] Update failure scenario loop in tests/app.spec.js:368-396 to use `forceRebuild()` instead of `selector.selectOption(FORCE_MODE)` after `configureNextRequest()`
- [x] T005 [US1] Run `npm run test:e2e -- --grep "announces failures" --project=chromium-desktop` to verify all 14 scenarios pass
- [x] T006 [US1] Run `npm run test:e2e -- --grep "announces failures"` across all browser projects to verify no cross-browser regressions

**Checkpoint**: User Story 1 complete — failure scenario test passes reliably

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Verify no regressions across the full test suite

- [x] T007 [P] Run `npm test` to verify unit tests still pass
- [x] T008 [P] Run `npm run build` to verify build succeeds
- [x] T009 [P] Run `npm run test:e2e` (full E2E suite) to verify no regressions
- [x] T010 Run the failure scenario test 3 times consecutively to verify no flakiness

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Skipped — no setup needed
- **Phase 2 (Foundational)**: Skipped — no foundational tasks
- **Phase 3 (US1)**: Can start immediately — no dependencies on other phases
- **Phase 4 (Polish)**: Depends on Phase 3 completion

### User Story Dependencies

- **User Story 1 (P1)**: Only story — no dependencies on other stories

### Within User Story 1

- T001 (verify bug exists) — independent, can run first
- T002 (add forceRebuild to app) and T003 (add helper to test) — can run in parallel [P]
- T004 (update test loop) — depends on T002 and T003
- T005 and T006 (verify fix) — depend on T004

### Parallel Opportunities

- T002 and T003 can run in parallel (different files: src/main.js and tests/app.spec.js)
- T007, T008, T009 can run in parallel (independent validation commands)
- T010 depends on T005 passing

---

## Parallel Example: User Story 1

```bash
# T002 and T003 can be done in parallel (different files):
Task: "Add forceRebuild method to window.__hexWorldTest in src/main.js"
Task: "Add forceRebuild() helper function in tests/app.spec.js"

# T007, T008, T009 can run in parallel:
Task: "Run npm test"
Task: "Run npm run build"
Task: "Run npm run test:e2e"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Add `forceRebuild()` to test API (T002)
2. Add test helper (T003)
3. Update failure loop (T004)
4. **STOP and VALIDATE**: Run T005 — test must pass
5. Run T006 — cross-browser verification
6. Run Phase 4 polish tasks

### Implementation Order

This is a minimal, targeted fix with only 3 code changes:
1. `src/main.js`: Add 1 line to expose `forceRebuild` on test API
2. `tests/app.spec.js`: Add 3-line helper function
3. `tests/app.spec.js`: Replace 1 line in failure loop (selector → forceRebuild)

Total estimated change: ~5 lines of code across 2 files.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- This is a bug fix, not a feature — tasks are minimal and focused
- Verify `npm run build` before marking the feature complete
- Commit after completing all Phase 3 tasks
