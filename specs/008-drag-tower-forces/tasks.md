# Tasks: Interactive Tower Dragging with Real-Time Force Recalculation

**Input**: Design documents from `/specs/008-drag-tower-forces/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/drag-contract.md`, `quickstart.md`

**Validation**: Manual browser scenarios per `quickstart.md` and automated build validation via `npm run build`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- File paths are explicitly included in descriptions.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Infrastructure preparation and message protocol definitions.

- [x] T001 Verify existing project baseline and force layout configuration in `src/force-layout.js`
- [x] T002 [P] Define `DRAG_START`, `DRAG_MOVE`, and `DRAG_END` message types and worker payload structures in `src/layout-worker.js`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core physics constraint handlers and runner message dispatches required before UI integration.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 [P] Implement fixed node coordinate pinning (`fx`, `fy`/`fz`) and unpinning logic in `src/force-layout.js`
- [x] T004 [P] Implement `dragStart(id, x, z)`, `dragMove(id, x, z)`, and `dragEnd(id, unpin)` dispatch methods in `src/layout-runner.js`

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Interactive Mouse Dragging of Towers (Priority: P1) 🎯 MVP

**Goal**: Allow users to click and drag any tower on the layout plane using the mouse while camera OrbitControls are locked.

**Independent Test**: Click and drag a tower with the mouse pointer to verify that the tower follows the pointer across the screen without rotating or panning the scene.

### Implementation for User Story 1

- [x] T005 [P] [US1] Implement 3D raycasting and horizontal plane ($Y = \text{baseElevation}$) projection math in `src/main.js`
- [x] T006 [US1] Implement drag session state tracking and OrbitControls toggling (`controls.enabled = false` / `true`) in `src/main.js`
- [x] T007 [US1] Attach `pointerdown`, `pointermove`, `pointerup`, and `pointercancel` listeners to trigger drag session actions in `src/main.js`
- [x] T008 [US1] Add visual hover highlight and active drag cursor styling in `src/main.js` and `src/style.css`

**Checkpoint**: At this point, User Story 1 is fully functional and testable independently (tower follows cursor smoothly).

---

## Phase 4: User Story 2 - Real-Time Graph Recalculation During Drag (Priority: P1)

**Goal**: Recalculate forces continuously during drag so connected and surrounding towers shift positions in real time.

**Independent Test**: Drag a connected tower continuously and verify surrounding towers dynamically adjust their positions frame-by-frame.

### Implementation for User Story 2

- [x] T009 [P] [US2] Update worker iteration loop to process live `DRAG_MOVE` coordinates and tick physics in `src/layout-worker.js`
- [x] T010 [US2] Connect worker position ticks to real-time object transform updates in `src/island.js` and `src/main.js`
- [x] T011 [US2] Optimize render loop updates to ensure zero per-frame garbage allocation during live dragging in `src/main.js`

**Checkpoint**: At this point, User Stories 1 AND 2 are both functional independently and together.

---

## Phase 5: User Story 3 - Touch and Keyboard Accessible Tower Dragging (Priority: P2)

**Goal**: Support touch gestures on touchscreens and keyboard arrow key nudge controls for accessibility.

**Independent Test**: Move a selected tower using arrow keys or single-finger touch gestures and verify real-time position updates and force recalculations.

### Implementation for User Story 3

- [x] T012 [P] [US3] Add touch gesture handlers (`touchstart`, `touchmove`, `touchend`, `touchcancel`) for mobile pointer dragging in `src/main.js`
- [x] T013 [US3] Add keyboard arrow key navigation listeners (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`) to nudge selected towers in `src/main.js`

**Checkpoint**: All user stories are now functional across mouse, touch, and keyboard inputs.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge case handling, resource cleanup, and final validation.

- [x] T014 [P] Add window `blur` and `Escape` key cancellation handlers in `src/main.js`
- [x] T015 [P] Verify event listener cleanup and worker session termination on scene reset in `src/main.js` and `src/island.js`
- [x] T016 Execute browser validation scenarios documented in `specs/008-drag-tower-forces/quickstart.md`
- [x] T017 Run build verification command `npm run build`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3+)**: Depend on Foundational phase completion.
  - User Story 1 (P1): Can start after Foundational phase.
  - User Story 2 (P1): Can start after Foundational phase.
  - User Story 3 (P2): Can start after Foundational phase.
- **Polish (Final Phase)**: Depends on completion of User Stories 1, 2, and 3.

### Parallel Opportunities

- `T002`, `T003`, `T004` can run in parallel (different files: `layout-worker.js`, `force-layout.js`, `layout-runner.js`).
- `T005` [US1] and `T009` [US2] can run in parallel once Foundational phase completes.
- `T012` [US3], `T014`, and `T015` can run in parallel during final polish.

---

## Implementation Strategy

### MVP First (User Story 1 & 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1 (Mouse Dragging)
4. Complete Phase 4: User Story 2 (Real-Time Forces)
5. **VALIDATE**: Test live dragging in browser.

### Incremental Delivery

1. Setup + Foundational -> Core layout runner message support ready.
2. User Story 1 + 2 -> Interactive mouse dragging with live force recalculation (MVP!).
3. User Story 3 -> Touchscreen and keyboard accessibility support.
4. Polish -> Edge case recovery and `npm run build` verification.
