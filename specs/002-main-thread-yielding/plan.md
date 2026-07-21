# Implementation Plan: Main Thread Yielding for Responsive Event Loop

**Branch**: `002-main-thread-yielding` | **Date**: 2026-07-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-main-thread-yielding/spec.md`

## Summary

The Three.js render loop in `src/main.js` runs `requestAnimationFrame(animate)` continuously, calling `updateHover()` which performs synchronous raycasting on every frame. At small viewports (360×568), this starves the browser event loop, preventing Playwright's `locator.evaluate()` from executing within the 60s timeout. The fix makes the render loop cooperative by yielding to the event loop between frames, ensuring pending microtasks and macrotasks (including Playwright callbacks) can execute.

## Technical Context

**Language/Version**: JavaScript (ES modules, Vite 7)

**Primary Dependencies**: Three.js 0.178, d3-force 3.0.0

**Storage**: N/A (in-memory scene graph)

**Testing**: Node.js built-in test runner (`node --test`) for unit tests; Playwright 1.61 for E2E tests

**Target Platform**: Modern browsers (WebGL2), tested at 360×568 through 1024×720 viewports

**Project Type**: Web application (single-page Three.js app with Vite bundler)

**Performance Goals**: Maintain ≥30fps render loop at 360×568 with 500+ tiles; Playwright reachability test completes in <30s

**Constraints**: No new dependencies; changes confined to `src/main.js` render loop; must pass `npm run build` and existing test suite

**Scale/Scope**: Single file change (`src/main.js`); existing test suite validates correctness

**Accessibility/Responsive Use**: Controls must remain reachable at 360×568; render loop must not block keyboard/touch input; reduced-motion preference already handled by existing code

**Deterministic Inputs/Outputs**: Identical scene data must produce identical rendered output before and after the change

**Resource Ownership**: GPU resources (renderer, scene, geometries) managed by existing lifecycle; no new allocations needed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Domain-neutral model**: PASS — The fix is generic (cooperative yielding in render loop) and does not depend on specific tile counts, algorithms, or scene content. Entity IDs and parent-child relationships unchanged.
- **Separation and determinism**: PASS — Render loop behavior is modified but data, layout, and UI boundaries remain explicit. Identical inputs produce identical outputs.
- **Performance and lifecycle**: PASS — The change preserves frame budget (16ms at 60fps) and maintains ≥30fps target. No per-frame allocations added. GPU/listener ownership unchanged.
- **Accessibility and resilience**: PASS — Event loop yielding ensures controls remain reachable. Error recovery in render loop is preserved (existing try/catch in rebuildIsland).
- **Quality and simplicity**: PASS — Single file change, no new dependencies, smallest justified solution. Validated by `npm run build` and Playwright E2E tests.

## Project Structure

### Documentation (this feature)

```text
specs/002-main-thread-yielding/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── render-loop.md   # Render loop yielding contract
└── tasks.md             # Phase 2 output (not created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── main.js              # Render loop, scene setup, UI bindings (target of changes)
├── island.js            # Island creation and disposal
├── layout.js            # Layout algorithm definitions
├── layout-runner.js     # Worker-based layout execution
├── layout-worker.js     # Web Worker for layout computation
├── force-layout.js      # Force-directed layout config
├── hex.js               # Hexagonal grid math
├── data.js              # School data generation
└── style.css            # Responsive styles

tests/
├── app.spec.js          # E2E tests (Playwright) — contains failing test
├── data.test.js         # Data generation tests
├── force-layout.test.js # Force layout tests
├── hex.test.js          # Hex math tests
├── island.test.js       # Island creation tests
├── layout-runner.test.js # Layout runner tests
├── layout-worker.test.js # Worker tests
├── layout.test.js       # Layout algorithm tests
└── fixtures/            # Test fixtures
```

**Structure Decision**: Single-project structure. The change is confined to `src/main.js` (render loop) with validation via existing Playwright E2E tests in `tests/app.spec.js`.

## Complexity Tracking

No constitution violations to justify — the fix is the smallest solution that addresses the event loop starvation without introducing new dependencies or abstractions.
