# Feature Specification: Fix Tower Overlap in Force Directed Layout

**Feature Branch**: `005-fix-tower-overlap`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Force directed graph has a fundamental issue. The towers is overlaped. This have not to be happening."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prevent Tower Overlaps During Simulation (Priority: P1)

When a user selects the force-directed layout, the towers and debug springs move through intermediate positions. During this animation, the towers must not overlap or intersect, allowing the user to clearly distinguish each individual entity throughout the entire simulation.

**Why this priority**: Preventing overlap ensures visual clarity and readability of the graph during animation. If towers overlap, the user cannot track individual entities or debug their relationships.

**Independent Test**: Start force-directed layout mode with a dense hierarchy, capture intermediate frame positions, and assert that the distance between any two leaf nodes is at least the collision threshold (so no two towers render on top of each other).

**Acceptance Scenarios**:

1. **Given** a dense hierarchy and force-directed layout is active, **When** the simulation is running, **Then** the distance between the center coordinates of any two leaf nodes in every frame (including step 0) is at least the minimum collision distance.
2. **Given** the simulation is animating, **When** visual frames are rendered, **Then** no two hexagonal tower meshes intersect or visually overlap.

---

### User Story 2 - Maintain Layout Convergence and Performance (Priority: P2)

The addition of overlap prevention does not prevent the layout from converging, nor does it cause the simulation to exceed the established performance budgets.

**Why this priority**: Preventing overlap must not break the layout solver or cause the UI to freeze or lag.

**Independent Test**: Measure the simulation convergence step count and execution time, and verify they remain within the performance limits.

**Acceptance Scenarios**:

1. **Given** the representative fixture (1,200 leaves), **When** force-directed layout is run, **Then** the simulation converges successfully within the maximum step budget.
2. **Given** the representative fixture, **When** execution time is measured, **Then** the total time from start to final commit is at most 2 seconds.

---

### Edge Cases

- **Single or few nodes**: Hierarchies with 0, 1, or 2 nodes must run without errors and respect the collision boundary if they move close to each other.
- **High-degree hubs**: Anchors with many connected leaf nodes must still resolve assignments and collision constraints deterministically without causing infinite oscillation or failing to converge.
- **Boundary constraints**: Nodes pushed near the maximum grid radius (`maxGridRadius`) must not be pushed out of bounds or cause the simulation to fail.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The force-directed simulation MUST prevent physical overlap of leaf towers during all stages of the simulation, including intermediate frames and the final converged state.
- **FR-002**: The simulation MUST enforce a minimum separation distance between any two leaf nodes.
- **FR-003**: The separation distance MUST be based on the physical size of the hexagonal towers (derived from `HEX_SIZE` or `ADJACENT_CELL_SPACING`) to guarantee that no two hex meshes intersect.
- **FR-004**: The overlap prevention mechanism MUST be integrated directly into the D3 force simulation (e.g. via a collision force or equivalent constraint).
- **FR-005**: All collision calculations MUST be fully deterministic and use the seeded random source.

### Quality and Constraint Requirements *(mandatory)*

- **QR-001 - Domain neutrality**: The collision and overlap prevention logic MUST remain entirely independent of any business domain.
- **QR-002 - Determinism**: For the same input data, layout settings, and seed, the simulation output (including intermediate coordinates) MUST be 100% reproducible.
- **QR-003 - Performance and scale**: The introduction of collision constraints MUST NOT cause the representative fixture (1,200 leaves) to exceed the 2-second convergence budget, nor the maximum fixture (4,800 leaves) to exceed the 8-second budget.
- **QR-004 - Accessibility and responsive use**: No changes to user interaction, camera controls, or keyboard accessibility.
- **QR-005 - Resilience**: The simulation MUST handle extreme edge cases (e.g., highly connected networks or overlapping initial coordinates) gracefully and converge or exit cleanly without crashing the worker.

### Key Entities *(include if feature involves data)*

- **Leaf Node**: Represents a visual hexagonal tower in the scene, which must maintain a minimum physical distance from other leaf nodes.
- **Collision Force**: A physical simulation constraint that applies repulsive forces to nodes when they are closer than the minimum separation distance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of generated force simulation frames have zero overlapping towers.
- **SC-002**: The minimum distance between any two leaf node simulation coordinates `(x, y)` in any frame is at least `ADJACENT_CELL_SPACING` (or the corresponding hex diameter).
- **SC-003**: The simulation converges within the maximum cooling steps (256 steps) for all standard hierarchy fixtures.
- **SC-004**: Execution time for the representative fixture (1,200 leaves) is at most 2 seconds.

## Assumptions

- **Collision Radius**: The standard collision radius can be derived from the hexagonal grid metrics defined in `src/hex.js` (e.g., matching the spacing of adjacent cells).
- **D3 Force-Collide**: Using D3's native `forceCollide` is appropriate and can be tuned to work with the existing forces (many-body, link, center, hex target).
