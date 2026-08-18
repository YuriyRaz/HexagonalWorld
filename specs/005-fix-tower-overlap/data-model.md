# Data Model: Overlap Prevention in Force Directed Layout

## Entities

### Leaf Node
Represents a physical hexagonal tower in the visualization.
- **Attributes**:
  - `x`: Simulation X-coordinate (Float64)
  - `y`: Simulation Y-coordinate (Float64)
  - `vx`: Velocity X (Float64)
  - `vy`: Velocity Y (Float64)
  - `assignedQ`: Assigned hex cell Q coordinate (Int32)
  - `assignedR`: Assigned hex cell R coordinate (Int32)
  - `kind`: `'leaf'` (constant)
  - `collisionRadius`: `ADJACENT_CELL_SPACING * 0.5` (Float64, virtual constraint property)

### Simulation Frame
Represents a snapshot of node coordinates at a specific step in the simulation.
- **Attributes**:
  - `globalStep`: Step index (integer)
  - `positions`: Float32Array of alternating X and Z coordinates for all nodes.
  - **Invariants**:
    - For any two leaf indices `i` and `j`, the Euclidean distance between their positions in the frame must satisfy:
      `Math.hypot(positions[i*2] - positions[j*2], positions[i*2+1] - positions[j*2+1]) >= ADJACENT_CELL_SPACING` (or within a tolerance during early simulation steps).

## State Transitions
1. **Simulation Tick**: For each step, D3-force updates `x`, `y`, `vx`, `vy`. The collision force resolves overlapping nodes, updating positions and velocities.
2. **Final Settlement**: In the final frame, nodes are locked exactly to their unique assigned hex targets, which are mathematically guaranteed to not overlap.
