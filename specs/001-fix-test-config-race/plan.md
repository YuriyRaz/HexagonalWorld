# Implementation Plan: Fix Test Config Race Condition

**Branch**: `001-fix-test-config-race` | **Date**: 2026-07-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-fix-test-config-race/spec.md`

## Summary

Fix a race condition where `rebuildIsland()` consumes `nextConfig` before the test sets it, and where the test cannot trigger a rebuild when the selector is already on the target value. The fix ensures each failure scenario's config is consumed by its own rebuild, allowing all 14 scenarios to complete within 120 seconds.

## Technical Context

**Language/Version**: JavaScript (ES modules, `"type": "module"`)

**Primary Dependencies**: Three.js (^0.178.0), d3-force (3.0.0), Vite 7

**Storage**: N/A (in-memory application state)

**Testing**: Node built-in test runner (`npm test`) for unit tests; Playwright (^1.61.1) for E2E tests (`npm run test:e2e`)

**Target Platform**: Web browser (Chromium, Firefox, WebKit)

**Project Type**: Web application (Three.js 3D visualization)

**Performance Goals**: 14 failure scenarios complete within 120 seconds total

**Constraints**: Must not change browser behavior (select change events); fix must be minimal and targeted

**Scale/Scope**: Single-page application, ~400 lines of test code, ~400 lines of app entry point

**Accessibility/Responsive Play**: Keyboard-accessible controls, semantic HTML, reduced-motion preferences

**Deterministic Inputs/Outputs**: Identical config + rebuild trigger sequence must produce identical error codes and state transitions

**Resource Ownership**: Three.js scene objects, Web Worker for layout, event listeners on UI controls

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Domain-neutral model**: PASS - Fix operates on generic rebuild/config infrastructure, no domain coupling.
- **Separation and determinism**: PASS - Fix ensures config consumption is deterministic (one config per rebuild).
- **Performance and lifecycle**: PASS - No new allocations; fix reduces overhead by eliminating unnecessary rebuilds.
- **Accessibility and resilience**: PASS - No UI changes; error handling behavior unchanged.
- **Quality and simplicity**: PASS - Smallest justified fix: either adjust test helper to force rebuild, or adjust app to not clear config on unrelated rebuilds. `npm run build` verification required.

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-test-config-race/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
src/
├── main.js              # App entry, rebuildIsland(), test API
├── data.js              # School data generation
├── hex.js               # Hexagonal grid math
├── layout.js            # Layout algorithms
├── layout-runner.js     # Worker-based async layout runner
├── layout-worker.js     # Web Worker for force layout
├── force-layout.js      # Force layout config
├── island.js            # Three.js island mesh
└── style.css

tests/
├── app.spec.js          # Playwright E2E spec (failure scenarios)
├── fixtures/
│   └── hierarchies.js   # Test hierarchy fixtures
└── *.test.js            # Unit tests
```

**Structure Decision**: Single-project web application. Fix touches `src/main.js` (app) and `tests/app.spec.js` (test).

## Complexity Tracking

No constitution violations to justify. Fix is minimal and targeted.
