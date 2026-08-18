# Implementation Plan: Continuous Force-Directed Layout Simulation

**Branch**: `004-fix-force-blink-transition` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-fix-force-blink-transition/spec.md`

## Summary

Remove the automatic termination, layout result commitment, and promotion-in-place paths for the force-directed layout. The layout worker calculation will run continuously without stopping. The UI will render real-time convergence status (calculating vs. converged), closeness metrics, and the step count at which convergence was reached.

## Technical Context

**Language/Version**: JavaScript (ES2022 modules), Node.js 20.19+

**Primary Dependencies**: Three.js ^0.178.0, d3-force 3.0.0

**Storage**: N/A (in-memory scene state)

**Testing**: `node --test` (unit), Playwright (e2e/benchmark)

**Target Platform**: Desktop/mobile browsers via Vite dev server; Chromium emulation for automated tests

**Project Type**: Web application (single-page 3D visualization)

**Performance Goals**: 60 fps; zero per-frame allocation in rendering loop

**Constraints**: Continuous simulation ticks must maintain target frame rate without GPU resource leaks or memory growth.

**Scale/Scope**: Representative fixture of 1,200 entities (leaves with springs)

**Accessibility/Responsive Scope**: Continuous updates to aria-live messages with step count and convergence state.

**Deterministic Inputs/Outputs**: Convergence step count and status must be computed deterministically from the frame metrics.

**Resource Ownership**: The live island handle owns its InstancedMesh and LineSegments resources. Disposal occurs only when the layout is rebuilt or switched — never automatically.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Domain-neutral model**: PASS — The design operates strictly at the orchestration, UI status, and worker loop layers.
- **Separation and determinism**: PASS — Data, layout, rendering, and UI remain separated. Convergence status and steps are derived deterministically from layout worker frame outputs.
- **Performance and lifecycle**: PASS — Eliminating promotion eliminates transition allocations. The render loop continues to reuse geometries/materials in the live island.
- **Accessibility and resilience**: PASS — Status messages are updated continuously to announce calculation progress and convergence state.
- **Quality and simplicity**: PASS — Removing commit paths and promotion logic simplifies orchestration in `main.js`.

## Project Structure

### Documentation (this feature)

```text
specs/004-fix-force-blink-transition/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── data.js
├── force-layout.js
├── hex.js
├── island.js            # createLiveIsland, applyStep - PRIMARY CHANGES
├── layout-runner.js     # Dispatch continuous step notifications
├── layout-worker.js     # Persistent calculation loop, no termination
├── layout.js
├── main.js              # Continuous UI updates, remove commit & promotion
└── style.css

tests/
├── island.test.js       # Verify continuous update logic
├── layout-runner.test.js
├── force-layout.test.js
├── app.spec.js          # E2E test verifying continuous simulation
└── fixtures/
```

## Complexity Tracking

> No constitution violations. Table intentionally empty.
