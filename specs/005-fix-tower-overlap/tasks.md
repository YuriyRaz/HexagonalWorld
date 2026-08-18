---
description: "Task list template for feature implementation"
---

# Tasks: Fix Tower Overlap in Force Directed Layout

**Input**: Design documents from `/specs/005-fix-tower-overlap/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Validation**: Include automated tests for deterministic data/layout behavior, regressions, and reusable
contracts when practical. Include browser-level scenarios for rendering and interaction changes. Every
feature includes independent acceptance validation and `npm run build`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Paths shown below assume single project - adjust based on plan.md structure

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Update `FORCE_LAYOUT_CONFIG_V2` in `src/force-layout.js` with `collideStrength` and `collideRadiusMultiplier` properties per contract.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Import `forceCollide` from `d3-force` in `src/force-layout.js`.

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Prevent Tower Overlaps During Simulation (Priority: P1) 🎯 MVP

**Goal**: The towers must not overlap or intersect, allowing the user to clearly distinguish each individual entity throughout the entire simulation.

**Independent Test**: Start force-directed layout mode with a dense hierarchy, capture intermediate frame positions, and assert that the distance between any two leaf nodes is at least the collision threshold.

### Validation for User Story 1

> **NOTE: Regression and deterministic behavior tests must fail before implementation. Rendering and
> interaction work must define a repeatable browser scenario before implementation.**

- [X] T003 [US1] Add a unit test in `tests/force-layout.test.js` to ensure the collision config is present and defaults are correct.
- [X] T004 [US1] Add a unit test in `tests/force-layout.test.js` to run a small dense fixture and assert that leaf node distances satisfy the minimum distance constraint across all steps.

### Implementation for User Story 1

- [X] T005 [US1] Instantiate and configure `forceCollide` in `createForceLayoutSession` in `src/force-layout.js` using `collideRadiusMultiplier` and `ADJACENT_CELL_SPACING`.
- [X] T006 [US1] Apply `forceCollide` to the simulation in `src/force-layout.js` using `collideStrength` and 1 iteration.

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Maintain Layout Convergence and Performance (Priority: P2)

**Goal**: The addition of overlap prevention does not prevent the layout from converging, nor does it cause the simulation to exceed the established performance budgets.

**Independent Test**: Measure the simulation convergence step count and execution time, and verify they remain within the performance limits.

### Validation for User Story 2

- [X] T007 [US2] Verify in `tests/force-layout.test.js` that the existing convergence tests pass with the collision force active.
- [X] T008 [US2] Verify in `tests/force-layout.test.js` that performance timing remains under budget for standard fixtures.

### Implementation for User Story 2

- [X] T009 [US2] Adjust convergence/stability thresholds in `FORCE_LAYOUT_CONFIG_V2` in `src/force-layout.js` if necessary to ensure the collision force does not prevent early termination (this is a tuning step if tests from T007 fail).

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T010 Validate keyboard, mobile viewport, and reduced-motion behavior.
- [X] T011 Verify GPU resources and event listeners are released when content is replaced.
- [X] T012 Automate the end-to-end visual overlap validation in tests/app.spec.js to ensure no towers intersect during animation.
- [X] T013 Run `npm run build`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Should be independently testable, depends on US1's collision force being active.

### Within Each User Story

- Regression and deterministic behavior tests MUST be written and fail before implementation
- Browser validation scenarios MUST be defined before rendering or interaction implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All independent validation tasks for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify required regression and deterministic tests fail before implementing
- Complete `npm run build` before marking the feature complete
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
