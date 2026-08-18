# Tasks: Hex Grid Field with Tower Snapping

**Input**: Design documents from `/specs/006-hex-grid-field/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Validation**: Run `npm run build` after each phase. Browser-level visual verification for rendering changes. Automated tests for deterministic behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new project setup needed — all changes are within existing `src/island.js`

*No tasks in this phase — the project structure and dependencies already exist.*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extract shared function that both `createIsland` and `createForceIsland` will use

**⚠️ CRITICAL**: User story work depends on this shared function being in place

- [X] T001 Extract shared `createEmptyCellGrid(ownership, gridRadius, occupiedCells)` function in `src/island.js` — move the empty cell iteration loop (lines 567-620) into a standalone function that returns `{ mesh, instances, baseColors }`, registered with the ownership ledger
- [X] T002 Replace inline empty cell code in `createIsland` (lines 567-620 of `src/island.js`) with a call to `createEmptyCellGrid(validated.gridRadius, validated.occupiedCells)`, preserving the existing return value contract (`interactiveTiles`, `userData.isEmpty`, `baseColors`)

**Checkpoint**: `createIsland` produces identical output using the new shared function — no visual change

---

## Phase 3: User Story 1 - Visible Hex Grid Field (Priority: P1) 🎯 MVP

**Goal**: Make the hexagonal grid visible beneath all towers in static layout modes (flat, nested, packed)

**Independent Test**: Render any static layout, confirm hexagonal tile grid is visible beneath towers within gridRadius area

### Implementation for User Story 1

- [X] T003 [US1] Increase empty cell visibility in `createEmptyCellGrid` in `src/island.js` — change opacity from 0.12 to 0.18, tile height from 0.035 to 0.05, and base color from `0xffffff` to `0x4fa98c` (teal tint matching project palette). Values are initial estimates — adjust after visual review in T014.
- [X] T004 [US1] Add minimum default grid radius in `createEmptyCellGrid` in `src/island.js` — when `gridRadius` is 0 (empty scene), use a default radius of 3 so the user always sees the coordinate system
- [X] T005 [US1] Verify hover highlighting works for empty cells in `src/main.js` — confirm `setTileState` applies color lerp to empty cells (already implemented at lines 773-779), no code changes expected

**Checkpoint**: Static layouts show visible hex grid beneath towers, hover highlights empty cells

---

## Phase 4: User Story 2 - Tower Snap-to-Cell Force (Priority: P2)

**Goal**: Ensure all towers snap to integer axial hex cells (verify existing behavior)

**Independent Test**: Place towers in any layout mode, confirm each tower's position is on an integer (q, r) cell with no fractional offset

### Implementation for User Story 2

- [X] T006 [US2] Verify deterministic layout snap behavior in `src/layout.js` — confirm `calculateLayout` already produces integer axial placements (check `roundAxial` calls in flat/nested/packed algorithms), no code changes expected
- [X] T007 [US2] Verify force-layout snap behavior in `src/force-layout.js` — confirm `createHexTargetForce` pulls towers to assigned hex cells and final positions are quantized to integer axial, no code changes expected

**Checkpoint**: All four layout modes produce towers at integer hex coordinates — zero fractional offsets

---

## Phase 5: User Story 3 - Grid Visual Consistency Across Layout Modes (Priority: P3)

**Goal**: Add hex grid to force mode (`createForceIsland`) so the grid is visible in all layout modes

**Independent Test**: Switch to force mode, confirm hex grid is visible beneath animated towers with same visual style as static modes

### Implementation for User Story 3

- [X] T008 [US3] Add empty cell grid to `createForceIsland` in `src/island.js` — after rendering occupied tiles, compute `gridRadius` from placement hex distances, build `occupiedCells` Set from placement coordinates, call `createEmptyCellGrid(ownership, gridRadius, occupiedCells)`, add returned mesh to `root` group. Verify grid extent updates as force simulation moves towers (FR-009).
- [X] T009 [US3] Include empty cell instances in `interactiveTiles` array in `createForceIsland` in `src/island.js` — push returned mesh to `interactiveTiles` so `main.js` raycaster can detect hover on force-mode empty cells
- [X] T010 [US3] Verify force mode empty cell lifecycle in `src/island.js` — confirm `createForceIsland` disposal path cleans up empty cell GPU resources via the ownership ledger (already tracked by `createEmptyCellGrid`)

**Checkpoint**: Force mode shows hex grid beneath animated towers, hover works on empty cells, layout mode switching shows consistent grid

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and edge case handling

- [X] T011 [P] Add unit test for `createEmptyCellGrid` in `tests/island.test.js` — test that function returns correct mesh count, instance positions match `axialToPlane`, occupied cells are excluded, minimum radius applies for empty scene
- [X] T012 [P] Add unit test for force-mode grid in `tests/island.test.js` — test that `createForceIsland` includes empty cell grid in `interactiveTiles`, grid extent matches placement radius
- [X] T013 Run `npm run build` and verify no compilation errors
- [X] T014 Browser visual verification — test all four layout modes (flat, nested, packed, force) at desktop viewport, confirm grid visibility, hover highlighting, no flickering on mode switch. Verify tower selection and dragging still work after grid is added (FR-012). Test at mobile viewport size. Test with `prefers-reduced-motion: reduce` — motion should respect existing preferences. Measure grid render overhead via browser devtools to validate SC-003 (<2ms). Observe that snapping completes within 1 second for default dataset (SC-004). Adjust T003 visibility values if grid is too subtle or too prominent.
- [X] T015 Verify GPU resource cleanup — switch layout modes rapidly, confirm no WebGL resource leaks (check `ownership.dispose()` path)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately (no tasks)
- **Phase 2 (Foundational)**: No dependencies — extract shared function
- **Phase 3 (US1)**: Depends on Phase 2 (T001, T002) — uses shared function
- **Phase 4 (US2)**: Depends on Phase 2 — verification only, no code changes
- **Phase 5 (US3)**: Depends on Phase 2 (T001, T002) — uses shared function
- **Phase 6 (Polish)**: Depends on Phases 3, 4, 5 being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **User Story 2 (P2)**: Can start after Phase 2 — verification only, independent of US1/US3
- **User Story 3 (P3)**: Can start after Phase 2 — uses same shared function as US1

### Within Each User Story

- Implementation before verification
- Core rendering changes before integration tests
- Story complete before moving to next priority

### Parallel Opportunities

- T006 and T007 (US2 verification) can run in parallel
- T011 and T012 (unit tests) can run in parallel
- US1 (T003-T005) and US3 (T008-T010) can run in parallel after Phase 2
- US2 (T006-T007) can run in parallel with US1 and US3

---

## Parallel Example: User Story 1 + User Story 3

```bash
# After Phase 2 completes, US1 and US3 can be developed in parallel:

# US1 tasks (static layouts):
Task: "T003 [US1] Increase empty cell visibility in src/island.js"
Task: "T004 [US1] Add minimum default grid radius in src/island.js"
Task: "T005 [US1] Verify hover highlighting in src/main.js"

# US3 tasks (force mode):
Task: "T008 [US3] Add empty cell grid to createForceIsland in src/island.js"
Task: "T009 [US3] Include empty cells in interactiveTiles in src/island.js"
Task: "T010 [US3] Verify force mode disposal path in src/island.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Extract shared function
2. Complete Phase 3: US1 — visible grid in static layouts
3. **STOP and VALIDATE**: Test static layouts show grid, hover works
4. The grid is now visible in flat/nested/packed modes

### Incremental Delivery

1. Phase 2 → Shared function ready
2. Phase 3 (US1) → Grid visible in static modes (MVP!)
3. Phase 4 (US2) → Verify snap behavior (no code changes)
4. Phase 5 (US3) → Grid visible in force mode (full feature)
5. Phase 6 → Polish and validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Most US2 tasks are verification — the snap mechanism already works
- The core code change is extracting `createEmptyCellGrid` and adjusting visibility parameters
- All changes are confined to `src/island.js` — no new files needed
- Complete `npm run build` before marking the feature complete
- Commit after each task or logical group

---

## Phase 7: Convergence

**Purpose**: Address viewport-dependent grid extent (FR-002) — grid currently extends only to tower bounding area, not the visible viewport

- [X] T016 Implement viewport-dependent grid extent in `src/island.js` — compute visible ground area by intersecting the camera frustum with the ground plane (y = WATER_LEVEL), convert bounds to axial coordinates, set gridRadius to cover visible axial extent plus buffer. Refactor `createEmptyCellGrid` or its callers to accept a viewport-derived radius instead of (or in addition to) the tower bounding radius. Update grid when camera moves via a throttled listener (max 10Hz). Limit maximum grid radius (e.g., 100) per plan constraint. (FR-002, missing)
- [X] T017 Add camera-change listener in `src/main.js` — on OrbitControls change event, recompute visible ground bounds from frustum and trigger grid extent update on the active island handle. Ensure the listener is cleaned up on island dispose (FR-002, FR-010, missing)
- [X] T018 Verify viewport-dependent grid at multiple zoom levels in browser — confirm grid fills visible ground plane when zoomed out, shrinks when zoomed in, and updates smoothly on pan without flickering. Validate SC-003 (<2ms overhead) with the new dynamic extent. Test in all four layout modes. (FR-002, partial)

---

## Phase 8: Convergence

**Purpose**: Address remaining gaps in viewport-dependent grid and dynamic updates during force simulation

- [X] T019 Update occupiedCells set dynamically in force mode — in `src/island.js` `createForceIsland`, modify the force simulation tick callback to update the occupiedCells Set as towers move, and rebuild the empty cell grid (or update instance visibility) to reflect current tower positions. Ensure grid extent expands when towers move beyond current gridRadius. (FR-009, missing)
- [X] T020 Ensure initial grid extent fills visible viewport on scene load — in `src/main.js`, after setting activeIslandHandle, immediately call `scheduleViewportGridUpdate()` (or directly invoke `updateViewportRadius`) to apply viewport-dependent grid radius before first render. (FR-002, partial)
- [X] T021 Verify dynamic occupied cell updates during force simulation in browser — confirm empty cells appear/disappear as towers move, grid extent expands when towers move outward, and no visual glitches or performance degradation. Test with rapid tower movement and large datasets. (FR-009, partial)
