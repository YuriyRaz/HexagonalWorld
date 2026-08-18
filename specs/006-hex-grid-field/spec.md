# Feature Specification: Hex Grid Field with Tower Snapping

**Feature Branch**: `006-hex-grid-field`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "All the towers have to be placed in the same hexagonal cells with hexagonal coordinates. My idea is: There has to be the endless field under the whole graph with hexagonal cells. And there has to be a force that has to pull each tower to the nearest cell. Thus all the towers will be placed in the specific hexagonal cells with respected hexagonal coordinates."

## Clarifications

### Session 2026-08-06

- Q: How should the spec handle the 'InstancedMesh or equivalent' requirement — reframe as technology-agnostic performance outcome, or keep as implementation guidance? → A: Reframe as technology-agnostic outcome (efficient batch rendering)
- Q: Should the spec explicitly define grid lifecycle (init, update, dispose) or defer to planning? → A: Define lifecycle phases explicitly — grid initializes with layout, updates on tower/layout changes, disposes on scene rebuild
- Q: How should the grid determine its extent — compute from camera frustum each frame, or pre-generate a fixed large area? → A: Grid should extend to fill the visible viewport area, updating as the camera moves to always show hex cells across the entire visible ground plane
- Q: What should happen visually to grid tiles when a tower occupies the cell? → A: Occupied cells are hidden — the tower geometry replaces the grid tile, keeping the grid clean. The cell under the mouse cursor highlights on hover as a general behavior across all layout methods.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visible Hex Grid Field (Priority: P1)

As a user viewing the hexagonal world, I want to see a hexagonal grid field underneath all towers so that I can visually understand the coordinate system and verify that every tower sits on a specific cell.

**Why this priority**: The visible grid is the foundation of the entire feature — without it, the snapping behavior is invisible and unverifiable. This is the prerequisite for all other user stories.

**Independent Test**: Can be fully tested by rendering any tower layout and confirming a hexagonal tile grid is visible beneath all towers within the gridRadius area. Delivers visual confirmation of the coordinate system.

**Acceptance Scenarios**:

1. **Given** the scene is rendered with a static layout mode (flat, nested, packed), **When** the user views the scene, **Then** a hexagonal tile grid is visible underneath all towers, covering the gridRadius area around the tower layout. Force mode is covered by User Story 3.
2. **Given** the user zooms out, **When** the grid is visible, **Then** the grid tiles extend continuously without gaps or seams across the entire gridRadius area.
3. **Given** the user zooms in to the closest level, **When** the grid is visible, **Then** individual hexagonal cell boundaries are clearly distinguishable.
4. **Given** the scene is rendered with a static layout mode, **When** the user rotates the camera, **Then** the grid remains correctly aligned with tower positions and does not shift or flicker.

---

### User Story 2 - Tower Snap-to-Cell Force (Priority: P2)

As a user, I want every tower to be pulled toward the nearest hexagonal cell center so that all towers occupy exact hex coordinates rather than arbitrary floating-point positions.

**Why this priority**: This ensures data integrity — every tower maps to a deterministic hex coordinate, which is essential for any downstream logic (serialization, sharing, reproducibility). Depends on the grid field being visible to verify behavior.

**Independent Test**: Can be tested by placing towers in any layout mode and confirming each tower's final position aligns to a hex cell center (integer axial coordinates). Delivers deterministic coordinate assignment.

**Acceptance Scenarios**:

1. **Given** towers are placed via any layout mode, **When** the layout settles, **Then** every tower's position corresponds to an integer axial hex cell (q, r) with no fractional offset.
2. **Given** a tower is dragged away from its cell, **When** the user releases it, **Then** the tower smoothly returns to its assigned hex cell center.
3. **Given** two towers are placed, **When** their nearest cells are different, **Then** no two towers occupy the same hex cell.
4. **Given** the layout is complete, **When** the user inspects any tower, **Then** its hex coordinates (q, r) are deterministic for the same input data and layout configuration.

---

### User Story 3 - Grid Visual Consistency Across Layout Modes (Priority: P3)

As a user switching between layout modes (flat, nested, packed, force), I want the hex grid field to remain visually consistent so that the coordinate system is always clear regardless of which placement algorithm is active.

**Why this priority**: Ensures the grid is a universal reference layer, not tied to one specific layout mode. Enhances usability when comparing layouts.

**Independent Test**: Can be tested by switching between all layout modes and confirming the grid appearance (tile size, color, extent) stays consistent. Delivers a stable visual reference.

**Acceptance Scenarios**:

1. **Given** the user switches from "flat" to "nested" layout, **When** the transition completes, **Then** the hex grid field is redrawn with the same tile size and visual style.
2. **Given** the user switches to "force" mode, **When** the force simulation runs, **Then** the grid remains visible underneath the animated towers.
3. **Given** any layout mode, **When** the user changes the hierarchy data, **Then** the grid redraws to accommodate the new layout extent without visual artifacts.

---

### Edge Cases

- What happens when the number of towers exceeds the initial gridRadius? The grid MUST dynamically expand to accommodate all towers.
- How does the grid behave when the scene is empty (no towers)? The grid should still render with a minimum default extent so the user sees the coordinate system.
- What happens when two towers would snap to the same cell? The collision prevention from the force simulation must resolve this — one tower claims the cell, the other finds the next nearest.
- How does the grid perform with very large datasets (thousands of towers)? The grid rendering must remain performant via instancing.
- What happens when the user rapidly switches layout modes? The grid must re-render without flickering or stale tiles.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render a hexagonal tile grid as a visual layer underneath all tower objects in the scene.
- **FR-002**: The hex grid extent MUST extend to fill the visible viewport area, updating as the camera moves to always show hex cells across the entire visible ground plane.
- **FR-003**: Each hex grid tile MUST represent one integer axial hex cell (q, r) and be visually distinct as a flat hexagonal prism. Occupied cells (those with a tower) MUST NOT render a grid tile — the tower geometry replaces it.
- **FR-004**: System MUST apply a snap-to-cell force that pulls each tower toward the center of its nearest hex cell during layout computation.
- **FR-005**: After layout settles, every tower MUST occupy a unique hex cell — no two towers share the same (q, r) coordinate.
- **FR-006**: The grid MUST be visually distinct from tower objects — lower opacity, flatter geometry, different color — so towers are clearly distinguishable.
- **FR-007**: The grid MUST render correctly in all four layout modes: flat, nested, packed, and force.
- **FR-008**: The grid MUST use efficient batch rendering to maintain performance with large tile counts.
- **FR-009**: The grid MUST update its extent when towers move (force mode) or when the layout changes, without leaving stale tiles.
- **FR-010**: The grid MUST initialize when the layout is first computed, update its tile coverage when the tower set or layout mode changes, and release all GPU resources when the scene is rebuilt or destroyed.
- **FR-011**: The grid MUST highlight empty cells (those without a tower) under the mouse cursor on hover. Occupied cells do not highlight — existing tower hover logic applies to those. This highlighting behavior MUST work consistently across all layout modes as a general-purpose interaction.
- **FR-012**: The grid MUST NOT interfere with tower selection, dragging, or any other user interaction beyond hover highlighting.

### Quality and Constraint Requirements *(mandatory)*

- **QR-001 - Domain neutrality**: The hex grid is a generic coordinate reference layer. It MUST NOT contain domain-specific labels or behavior — it serves any hierarchy rendered in the scene.
- **QR-002 - Determinism**: For the same data and layout configuration, the grid extent and tower cell assignments MUST be identical across renders.
- **QR-003 - Performance and scale**: The grid MUST render at 60 fps with up to 2000 visible tiles and 500 towers. Grid rendering MUST NOT add more than 2 ms per frame to the render loop.
- **QR-004 - Accessibility and responsive use**: The grid MUST be visible at all supported viewport sizes. Keyboard navigation and reduced-motion preferences MUST NOT be affected by grid rendering.
- **QR-005 - Resilience**: If WebGL context is lost or the scene is rebuilt, the grid MUST re-render correctly without manual intervention.

### Key Entities

- **Hex Grid Field**: A bounded plane of flat hexagonal tiles representing integer axial coordinates, covering the hex area defined by the layout's gridRadius. Each tile has a center position (q, r) in axial space and a corresponding 3D world position.
- **Hex Cell**: A single tile in the grid. Attributes: axial coordinates (q, r), 3D world position (x, z), visual state (empty, highlighted on mouse hover). Occupied cells do not render a grid tile.
- **Snap Force**: A directional force applied during layout computation that pulls each tower toward the center of its nearest unoccupied hex cell. Operates in axial space and translates to 3D world forces.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every tower in the scene occupies a cell with integer axial coordinates (q, r) — zero towers with fractional offsets after layout settles.
- **SC-002**: The hex grid is visible beneath all towers within the gridRadius extent, with no gaps or missing tiles in the bounded area.
- **SC-003**: Grid rendering adds no more than 2 ms per frame to the render loop with up to 2000 visible tiles.
- **SC-004**: Tower snapping completes within 1 second of layout start for datasets up to 500 towers.
- **SC-005**: All four layout modes (flat, nested, packed, force) produce valid hex-coordinate-aligned tower positions.
- **SC-006**: Switching layout modes does not cause visual flickering or stale grid tiles — grid redraws within one frame.

## Assumptions

- The existing axial coordinate system (pointy-top, HEX_SIZE = 1.3) is reused — no new coordinate math is needed.
- The existing snap-to-cell force mechanism is the basis for the tower pulling behavior — this feature refines and makes it visible.
- The hex grid is purely visual and for coordinate reference — it does not store occupancy state or act as a spatial index beyond what the layout algorithms already compute.
- The grid reuses hexagonal prism geometry consistent with tower rendering, ensuring visual harmony.
- Performance budget assumes desktop-class hardware with GPU acceleration — mobile is not a primary target for this feature.
- The grid does not need to handle user editing of cell properties (color, occupation) — it is a read-only reference layer.
