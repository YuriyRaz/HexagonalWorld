# Phase 0 Research: Interactive Tower Dragging with Real-Time Force Recalculation

## Research Decisions

### Decision 1: Pointer Raycasting & Plane Projection

- **Decision**: Raycast pointer screen coordinates against scene objects to select a tower, then intersect ray with a fixed ground plane ($Y = 0$ or tower base elevation plane) during pointer movement.
- **Rationale**: Projecting screen coordinates onto a 3D horizontal ground plane provides a smooth, predictable 2D drag plane in 3D camera space regardless of camera tilt or distance.
- **Alternatives Considered**:
  - *Screen-space 2D movement*: Unintuitive in 3D perspective camera space because movement speed varies drastically with depth.
  - *Dragging along camera plane*: Causes towers to float upwards/downwards in 3D space when dragging away from camera center.

### Decision 2: OrbitControls Coordination

- **Decision**: Disable `OrbitControls` (`controls.enabled = false`) as soon as a valid tower drag operation begins on `pointerdown` / `pointermove` threshold, and restore `controls.enabled = true` on `pointerup`, `pointercancel`, or `Escape`.
- **Rationale**: Prevents camera rotation and panning from conflicting with pointer drag movements.
- **Alternatives Considered**:
  - *Separate drag handle*: Requires extra UI elements; direct model raycasting is more intuitive.
  - *Right-click drag only*: Violates standard direct-manipulation pointer conventions.

### Decision 3: Fixed Node Constraint in Force Simulation Worker

- **Decision**: Introduce a `dragStart(id, x, z)`, `dragMove(id, x, z)`, and `dragEnd(id, unpin)` message protocol between the main thread runner (`layout-runner.js`) and physics worker (`layout-worker.js`).
- **Rationale**: Fixing (pinning) the dragged node's coordinates (`fx`, `fy` / `fz`) in the force simulation engine forces the physics solver to treat the dragged tower as an anchor while computing attraction/repulsion forces for all other unpinned nodes in real time.
- **Alternatives Considered**:
  - *Pausing simulation during drag*: Fails the requirement that graph recalculates in real time while dragging.
  - *Direct manual coordinate override without physics updates*: Leaves connected graph nodes static during drag.

### Decision 4: Keyboard Accessible Nudge/Drag Navigation

- **Decision**: Extend keyboard selection model so that when a tower is selected, pressing Arrow keys (or `Shift + Arrow`) adjusts the target entity's position on the layout plane by small fixed spatial increments and notifies the force runner.
- **Rationale**: Satisfies accessibility mandate (QR-004) for non-pointer users.
- **Alternatives Considered**:
  - *Tab-only focus without positioning*: Lacks feature parity for non-pointer users.

### Decision 5: Resource Management & Disaster Recovery

- **Decision**: Register global `pointerup`, `pointercancel`, and window `blur` listeners on the canvas/window during active drag sessions to ensure drag state cleanup occurs even if mouse releases outside viewport or window loses focus.
- **Rationale**: Prevents stuck drag states or orphaned event listeners per Constitution Principle III & IV.
