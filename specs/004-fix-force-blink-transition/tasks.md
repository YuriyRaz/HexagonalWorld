# Tasks: Continuous Force-Directed Layout Simulation

**Input**: Design documents from `/specs/004-fix-force-blink-transition/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Validation**: Run unit tests via `npm test`, E2E tests via Playwright, and `npm run build` for verification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify baseline tests pass and clean up any leftover promote code.

- [x] T001 Run `npm test` and `npm run build` to confirm baseline passes
- [x] T002 Remove `promote()` method and promote tests from src/island.js and tests/island.test.js

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Adapt layout-worker to run calculations continuously.

- [x] T003 Modify afterPaint in src/layout-worker.js to continue calling advance(state) even when outstanding.frame.terminal is not 'none' (i.e. do not automatically stop or post failure/success terminal messages)
- [x] T004 Adapt startV2 in src/layout-worker.js to not terminate the loop early in final-only mode, so it still runs step-by-step indefinitely
- [x] T005 Run `npm test` to ensure worker persistence changes do not break other layouts

**Checkpoint**: Worker is able to run the simulation continuously without stopping.

---

## Phase 3: User Story 1 - Continuous Simulation & No Promotion (Priority: P1) 🎯 MVP

**Goal**: Keep simulation running indefinitely in the UI and remove all commit/promotion code.

**Independent Test**: Select force-directed layout, verify the island remains translucent, springs stay visible, and the simulation does not stop.

### Implementation for User Story 1

- [x] T006 [US1] Remove the promote commit path from the algorithmSelect.value === 'force-anchors' check in src/main.js so that it does not call promote or change the activeIslandHandle
- [x] T007 [US1] Remove the commitEpochSettlement function entirely from src/main.js
- [x] T008 [US1] Remove the skipForcePresentationRestore check and simplify the finally block in src/main.js to keep force presentation mode active (no re-enabling of shadows/particles when force layout is active)
- [x] T009 [US1] Verify that selecting force-directed layout keeps the simulation running indefinitely without resetting the active island root UUID in tests/app.spec.js

**Checkpoint**: Force-directed layout runs indefinitely without visual transitions or promotion.

---

## Phase 4: User Story 2 - Real-Time Convergence Status Display (Priority: P2)

**Goal**: Display how close the simulation is to converging and whether it has converged.

**Independent Test**: Verify that the UI displays the streak status (e.g. "Серия сходимости: X / 8") and changes status once converged.

### Implementation for User Story 2

- [x] T010 [US2] Update the layout progress panel in src/main.js to dynamically render the current convergence state and streak closeness from frame metrics on every onStep
- [x] T011 [US2] Add unit tests in tests/island.test.js or integration tests in tests/app.spec.js verifying that the UI updates the convergence status elements correctly during simulation steps

**Checkpoint**: Real-time convergence status and streak closeness are visible in the progress panel.

---

## Phase 5: User Story 3 - Convergence Step Counter (Priority: P3)

**Goal**: Show the exact step count at which the simulation converged.

**Independent Test**: Watch the layout panel, verify it records and displays the step number when convergence occurs.

### Implementation for User Story 3

- [x] T012 [US3] Update onStep and status update functions in src/main.js to record the exact globalStep at which terminal === 'converged' is first received, and display this step count in the layout status bar
- [x] T013 [US3] Update E2E assertions in tests/app.spec.js to verify that the step count is correctly shown when the layout stabilizes

**Checkpoint**: Step count to converge is accurately displayed in the UI.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification of performance, accessibility, and E2E status.

- [x] T014 Run `npm test` to confirm all unit tests pass
- [x] T015 Run `npm run build` to confirm production build succeeds
- [x] T016 Run Playwright E2E tests to confirm layout execution and UI behavior are correct

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Can start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 - worker persistence is required before any user story
- **Phase 3 (US1)**: Depends on Phase 2 - continuous simulation implementation
- **Phase 4 (US2)**: Depends on Phase 3 - status display depends on continuous updates
- **Phase 5 (US3)**: Depends on Phase 4 - step count display is part of status updates
- **Phase 6 (Polish)**: Depends on all user stories being complete

---

## Parallel Example: User Story 2 + 3

```bash
# Once Phase 3 is completed, US2 and US3 UI changes can be implemented in parallel:
Task: "T010 [US2] Update layout progress panel in src/main.js"
Task: "T012 [US3] Update status update functions in src/main.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 & 2: Setup and Foundational worker modifications
2. Complete Phase 3: Continuous layout execution without promotion
3. **STOP and VALIDATE**: Confirm layout runs continuously in the browser without stopping.
