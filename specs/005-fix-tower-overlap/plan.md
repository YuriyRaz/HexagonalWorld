# Implementation Plan: Fix Tower Overlap in Force Directed Layout

**Branch**: `005-fix-tower-overlap` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-fix-tower-overlap/spec.md`

## Summary

We will integrate D3's `forceCollide` into the force-directed layout simulation worker to prevent physical tower overlap during simulation. The collision radius will be set to half the distance between adjacent cell centers (`ADJACENT_CELL_SPACING * 0.5`) to ensure a physical separation equivalent to `ADJACENT_CELL_SPACING` between leaf node centers, preventing hexagonal mesh intersections.

## Technical Context

**Language/Version**: JavaScript (ES Modules, Node 20/22)

**Primary Dependencies**: `d3-force` (version 3.0.0), `three` (version 0.178.0)

**Storage**: N/A (in-memory simulation and Three.js state)

**Testing**: Node.js native test runner (`node --test`), Playwright for E2E validation

**Target Platform**: WASM / Modern Web Browsers (Chrome, Firefox, Safari)

**Project Type**: Web Application

**Performance Goals**: 
- Representative scale: 1,200 leaves, convergence in < 2 seconds.
- Maximum scale: 4,800 leaves, convergence in < 8 seconds.

**Constraints**: 
- All operations in the simulation must be deterministic and reproducible.
- Minimum separation between any two leaf nodes must be `ADJACENT_CELL_SPACING`.

**Scale/Scope**: 1,200 to 4,800 entities.

**Accessibility/Responsive Scope**: Existing keyboard-accessible controls, canvas orbit/zoom, and camera reset controls remain active. No new gestures.

**Deterministic Inputs/Outputs**: Determinism is maintained by using the seeded `mulberry32` random generator and strict convergence thresholds.

**Resource Ownership**: The layout worker owns the D3-force simulation state. The Three.js renderer owns the GPU instanced mesh resources and disposes them on mode changes or teardown.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Domain-neutral model**: Stable IDs and explicit parent-child relationships are preserved; source domain assumptions remain behind adapters.
- [x] **Separation and determinism**: Data, layout, rendering, and UI boundaries are explicit; identical normalized inputs and configuration produce reproducible visual mappings.
- [x] **Performance and lifecycle**: Representative scale and measurable performance goals are stated; per-frame allocation is avoided and GPU/listener ownership and cleanup are defined.
- [x] **Accessibility and resilience**: Keyboard or accessible alternatives, mobile behavior, reduced-motion behavior, and applicable loading/empty/error/unsupported states are specified.
- [x] **Quality and simplicity**: The design is the smallest justified solution; dependencies and abstractions have concrete need; validation includes `npm run build` plus risk-appropriate automated or browser-level checks.

## Project Structure

### Documentation (this feature)

```text
specs/005-fix-tower-overlap/
├── plan.md              # This file
├── research.md          # Research findings (Phase 0 output)
├── data-model.md        # Entities and state transitions (Phase 1 output)
├── quickstart.md        # Runnable verification guide (Phase 1 output)
└── contracts/           # Interface contracts
    └── collision-config.md
```

### Source Code

```text
src/
├── data.js
├── force-layout.js      # Layout session and force calculations
├── hex.js               # Hex grid dimensions and math
├── island.js            # Three.js rendering and object lifecycle
├── layout-runner.js
├── layout-worker.js     # Web worker entrypoint
└── main.js              # UI entrypoint and orchestration

tests/
├── force-layout.test.js # Unit tests for simulation forces
├── island.test.js       # Unit tests for rendering structures
└── app.spec.js          # E2E application tests
```

**Structure Decision**: Single project layout matching the existing structure of the codebase.

## Complexity Tracking

*No violations detected. Not applicable.*
