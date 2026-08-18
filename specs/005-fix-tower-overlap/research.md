# Research: Overlap Prevention in Force Directed Layout

## Decision 1: D3-Force Collide Force Integration
- **Decision**: Integrate `forceCollide` from `d3-force` into the D3 simulation inside `src/force-layout.js`.
- **Rationale**: D3's native collision force is designed exactly to prevent node overlap in force-directed graphs. It computes a quadtree of node positions at each tick and resolves overlaps by applying resolving forces. This is highly optimized and integrates natively with the D3 simulation lifecycle.
- **Alternatives considered**: 
  - *Custom collision constraint in target force*: A custom constraint could be added to `createHexTargetForce` or a new custom force. However, this would duplicate the quadtree-based collision resolution that D3 already implements efficiently in `forceCollide`.

## Decision 2: Collision Radius Specification
- **Decision**: Configure the collision radius to be half of the adjacent cell spacing: `ADJACENT_CELL_SPACING * 0.5` for leaf nodes (towers), and `0` for anchors.
- **Rationale**: Since the distance between adjacent cells is `ADJACENT_CELL_SPACING` (derived from `HEX_SIZE * Math.sqrt(3)`), setting the collision radius to `ADJACENT_CELL_SPACING * 0.5` ensures that when two leaf nodes collide, the minimum distance between their centers is `ADJACENT_CELL_SPACING`. This prevents the rendered hexagonal meshes from overlapping or intersecting. Anchors are virtual and not rendered, so they do not need collision constraints.
- **Alternatives considered**: 
  - *Fixed radius*: A hardcoded value (e.g., `1.0` or `1.3`) could be used, but this would not scale if the hex size configuration changes. Using `ADJACENT_CELL_SPACING` dynamically ensures consistency with the physical grid layout.

## Decision 3: Simulation Stability and Tuning
- **Decision**: Tune the collision force strength (`1.0`) and keep iterations at default or low (e.g., 1) to avoid excessive performance overhead, while verifying that convergence still occurs within the standard 256-step limit.
- **Rationale**: Higher collision iterations or strengths can prevent convergence or cause jittering. A strength of `1.0` with 1 iteration is sufficient to push nodes apart during the cooling phase without disrupting the settling of nodes into their final hex targets.
- **Alternatives considered**: 
  - *Multi-iteration collision*: Increasing collision iterations improves collision resolution but multiplies the layout computation cost, potentially violating the 2s/8s latency budget.
