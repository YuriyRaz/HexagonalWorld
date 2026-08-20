# Implementation Plan: Interactive Tower Dragging with Real-Time Force Recalculation

**Branch**: `008-drag-tower-forces` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-drag-tower-forces/spec.md`

## Summary

Enable real-time interactive tower dragging via mouse/touch pointers and keyboard controls in the 3D scene. Raycast pointer input onto the horizontal layout plane, update the force-directed physics engine with fixed node constraints in real time, and trigger dynamic recalculations for surrounding towers while maintaining smooth frame rates and accessible fallback controls.

## Technical Context

**Language/Version**: JavaScript (ES2022 / ES Modules), Node 20.19+ baseline

**Primary Dependencies**: Three.js, Vite

**Storage**: N/A (in-memory scene & physics worker state)

**Testing**: Manual browser scenarios, `npm run build` verification

**Target Platform**: WebGL-enabled modern Web Desktop & Mobile browsers

**Project Type**: 3D Web Application / Interactive Visualization

**Performance Goals**: 60 FPS target (minimum 30 FPS under continuous force recalculation for up to 500 nodes)

**Constraints**: Smooth real-time recalculation during drag, zero per-frame object allocation, full OrbitControls coordination

**Scale/Scope**: Up to 500 tower nodes in live force-directed layout

**Accessibility/Responsive Scope**: Touch pointer gestures, keyboard directional key nudge, reduced-motion awareness

**Deterministic Inputs/Outputs**: Same layout configuration and node displacement produce reproducible force equilibrium positions

**Resource Ownership**: Temporary drag state listeners cleaned up on drag end, window blur, or view tear-down

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Domain-neutral model**: PASS. Tower drag logic references stable entity IDs and layout coordinates without domain-specific logic.
- **Separation and determinism**: PASS. Layout calculations stay in layout engine / worker; Three.js renderer consumes updated coordinates.
- **Performance and lifecycle**: PASS. Physics tick messages pass lightweight coordinate payloads to worker without per-frame garbage allocations.
- **Accessibility and resilience**: PASS. Supports keyboard arrow key nudging, touch events, and blur/cancel recovery.
- **Quality and simplicity**: PASS. Direct extension of existing layout runner and main scene interaction handlers.

## Project Structure

### Documentation (this feature)

```text
specs/008-drag-tower-forces/
├── spec.md              # Feature specification
├── plan.md              # This implementation plan
├── research.md          # Phase 0 research decisions
├── data-model.md        # Phase 1 data model & state transitions
├── quickstart.md        # Validation scenarios
└── contracts/
    └── drag-contract.md # UI & worker communication contracts
```

### Source Code (repository root)

```text
src/
├── main.js             # Pointer raycasting, OrbitControls toggle, keyboard listeners
├── island.js           # Live island update handles & pointer pick targets
├── layout-runner.js    # Drag start/move/end method dispatch to layout worker
├── layout-worker.js    # Handles DRAG_START/MOVE/END messages & node pinning
└── force-layout.js     # Physics simulation engine pin/unpin constraint logic
```

**Structure Decision**: Single web application layout modifying existing modules in `src/`.

## Complexity Tracking

*No constitution violations present.*
