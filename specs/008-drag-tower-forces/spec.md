# Feature Specification: Interactive Tower Dragging with Real-Time Force Recalculation

**Feature Branch**: `008-drag-tower-forces`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "I want to add posobolity to drag a tower with mouse. The graph have to be real time recalculated based on all the defined forces, user may drag and see how other tower changing their posittions"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Interactive Mouse Dragging of Towers (Priority: P1)

As an interactive world viewer, I want to click and drag any tower across the layout using my mouse or pointer device, so that I can intuitively adjust the spatial layout of specific entities.

**Why this priority**: Core interaction enabling users to manipulate graph nodes directly in the 3D scene.

**Independent Test**: Click and hold a tower with the mouse pointer, move the pointer across the screen, and verify that the target tower smoothly follows pointer movement on the layout plane.

**Acceptance Scenarios**:

1. **Given** a rendered world with multiple towers, **When** the user presses and holds the primary mouse button on a tower and moves the pointer, **Then** the selected tower continuously updates its position to align with the pointer location on the layout plane.
2. **Given** an active tower drag operation, **When** the user releases the primary mouse button, **Then** the drag operation completes and the tower remains at the release location or settles into place.

---

### User Story 2 - Real-Time Graph Recalculation During Drag (Priority: P1)

As a visualizer exploring connections, I want all other towers to dynamically adjust their positions in real time while I drag a tower, so that I can immediately observe how changing one entity's location affects the force network.

**Why this priority**: Fundamental functional requirement where forces recalculate continuously during drag to show live graph structural adjustments.

**Independent Test**: Drag a connected tower continuously for several seconds and verify that surrounding/linked towers adjust their positions fluidly frame-by-frame without requiring pointer release.

**Acceptance Scenarios**:

1. **Given** a connected network of towers, **When** a user drags one tower to a new position, **Then** all connected and nearby towers update their positions continuously based on active attraction, repulsion, and layout forces in real time.
2. **Given** continuous mouse dragging motion, **When** the force engine recalculates spatial positions, **Then** visual updates occur smoothly without frame stutters or layout snapping.

---

### User Story 3 - Touch and Keyboard Accessible Tower Dragging (Priority: P2)

As a touch screen or keyboard user, I want to relocate towers using touch gestures or key directional inputs, so that real-time force recalculation is accessible regardless of input device.

**Why this priority**: Essential for inclusive interaction, supporting touch viewports and non-pointer users per accessibility standards.

**Independent Test**: Select a tower via keyboard focus and press directional keys (or perform a touch drag on touch screens) to verify real-time position updates and force recalculations.

**Acceptance Scenarios**:

1. **Given** a selected tower focused via keyboard navigation, **When** the user presses directional arrow keys (with modifier or drag mode enabled), **Then** the tower moves step-by-step in the indicated direction while forces recalculate in real time.
2. **Given** a touch-enabled device, **When** a user performs a single-finger touch-and-drag gesture on a tower, **Then** the tower follows the touch point and triggers real-time graph recalculation identically to mouse drag.

---

### Edge Cases

- What happens when a user drags a tower quickly beyond the current viewport or camera bounds?
  - *Behavior*: The pointer position maps safely to the layout plane boundary without throwing errors or placing towers at infinity.
- What happens if pointer focus is lost during drag (e.g., ALT+Tab, browser window blur, or dragging outside browser window)?
  - *Behavior*: The drag operation gracefully cancels/releases, leaving the tower at its last valid pointer position and unfreezing standard simulation state.
- What happens when dragging a completely isolated tower with zero connected forces?
  - *Behavior*: The isolated tower moves independently with pointer drag without affecting surrounding disconnected towers.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to initiate a drag operation on any tower in the visual scene using pointer press (mouse down / touch start).
- **FR-002**: System MUST project 2D pointer screen coordinates onto the 3D layout plane to calculate accurate 3D spatial target positions during dragging.
- **FR-003**: System MUST update the force-directed layout engine with the dragged tower's real-time position during active drag motion.
- **FR-004**: System MUST treat the dragged tower as a fixed or constrained reference node in the force simulation during drag so it remains at the pointer position while driving forces on other nodes.
- **FR-005**: System MUST recalculate and render positions for all non-dragged towers dynamically every frame (or at active physics tick rate) during an active drag operation.
- **FR-006**: System MUST terminate the drag operation on pointer release (mouse up / touch end / touch cancel) or window focus loss.
- **FR-007**: System MUST provide visual feedback (e.g., hover highlight, drag cursor state, or elevation change) indicating when a tower is interactive and currently being dragged.
- **FR-008**: System MUST provide an accessible keyboard mechanism allowing users to select a tower and adjust its spatial position incrementally, updating forces in real time.

### Quality and Constraint Requirements *(mandatory)*

- **QR-001 - Domain neutrality**: Drag interaction and force recalculation MUST operate strictly on stable entity IDs, coordinates, and force topology without domain-specific logic or metadata coupling.
- **QR-002 - Determinism**: Dragging a tower to identical coordinates under identical layout configurations MUST produce identical force vectors and equilibrium layout arrangements.
- **QR-003 - Performance and scale**: Real-time force recalculation during active dragging MUST maintain standard target frame rates (60 FPS target, minimum 30 FPS) for representative graph sizes (up to 500 nodes).
- **QR-004 - Accessibility and responsive use**: Interactive dragging MUST support touch input across mobile/tablet viewports and provide keyboard directional movement fallbacks. Visual indicators MUST NOT rely solely on color. Motion MUST respect `prefers-reduced-motion`.
- **QR-005 - Resilience**: Dragging MUST handle invalid pointer coordinates, lost pointer capture, rapid window resizing, and touch cancellation gracefully without freezing render loops or corrupting graph state.

### Key Entities

- **Tower Node**: A spatial graphical representation of a hierarchical entity with a unique stable entity ID, 3D spatial coordinates, height, color, and force properties.
- **Drag Session**: State object tracking an active drag interaction, containing the target entity ID, pointer origin, active layout plane projection, and original pre-drag coordinates.
- **Force Graph Topology**: Node and link configuration defining attraction, repulsion, and distance constraints between towers in the force layout simulation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can successfully click/touch and drag any tower to a new layout position in under 1 second of initial gesture response time.
- **SC-002**: During active continuous tower dragging, force-directed graph position recalculations render smoothly at >= 30 frames per second on target hardware with up to 500 nodes.
- **SC-003**: 100% of non-dragged towers connected to a dragged node visually respond and shift positions according to active forces within 50ms of pointer movement.
- **SC-004**: Keyboard users can complete tower repositioning using accessible arrow controls without relying on pointer devices.
- **SC-005**: Releasing or cancelling a drag operation restores full layout simulation equilibrium without throwing unhandled exceptions or leaking GPU/event listener resources.

## Assumptions

- Pointer interactions in 3D use raycasting or screen-to-world projection onto the main horizontal ground plane.
- Existing force-directed simulation (Worker or main thread physics engine) supports setting fixed/pinned node positions during live physics steps.
- Keyboard navigation relies on existing selection/focus mechanisms, extending them with arrow-key directional displacement commands.
