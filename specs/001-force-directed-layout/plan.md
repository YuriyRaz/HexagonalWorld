# Implementation Plan: Force-Directed Layout

**Branch**: `001-force-directed-layout` | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-force-directed-layout/spec.md`

## Summary

Add two static, selectable force-directed layouts for domain-neutral hierarchical data: one uses calculation-only hierarchy anchors and exposes every active spring for debugging, while the other groups leaves by shared ancestors without links. Both modes use the standalone `d3-force` package in a module worker, a deterministic fixed-tick schedule, and a custom force that owns unique axial-cell assignments throughout the simulation and pins leaves exactly to their assigned centers during the final ticks. Rendering consumes the completed layout, shows springs at surface level zero only for anchor mode, and makes occupied towers 50% opaque in both force modes.

## Technical Context

**Language/Version**: JavaScript native ES modules on Node.js 20.19+ or 22.12+

**Primary Dependencies**: Three.js 0.178, d3-force 3.0.0, Vite 7; Playwright 1.61 for browser validation

**Storage**: N/A; generated hierarchy, simulation state, and layout results remain in memory

**Testing**: Node.js built-in test runner for pure hierarchy/hex/layout contracts, Playwright for browser interaction and visual scenarios, and `npm run build`

**Target Platform**: Current and immediately previous stable Blink, Gecko, and WebKit releases on desktop/laptop, phone, and tablet/hybrid classes; WebGL 2 and module workers are required

**Project Type**: Client-side 3D web application

**Performance Goals**: After two warmups, nearest-rank p95 across ten measured end-to-end builds is at most 2 seconds for 1,200 leaves and 8 seconds for 4,800 leaves; nearest-rank p95 across ten measured busy-state control responses is at most 100 ms; the pooled median frame time across ten five-second post-commit windows is at most 33.3 ms after committing 4,800 towers. The 2/8-second values are acceptance statistics, not per-run runtime timeouts

**Constraints**: Every leaf ends at one unique integer axial cell; no internal hierarchy entity becomes a tower; force results are static; anchor springs remain at world surface level `y = 0`; occupied tower opacity is 50% in force modes; only the newest calculation may commit

**Scale/Scope**: Up to 6,000 normalized entities, including 4,800 leaves and 1,200 internal entities; hierarchy depth 16; 76,800 leaf-to-ancestor memberships; 5,999 links/springs; final axial radius 256. Current generator uses at most 4,800 leaves and 90 internal entities

**Accessibility/Responsive Scope**: Native select remains keyboard/touch operable for desktop/laptop at 1024x720 CSS px and wider, phone at 360-767 CSS px, and tablet/hybrid at 768 CSS px and wider; calculation, success, and retained-world errors use live status text; force simulation is never shown as motion and therefore does not depend on reduced-motion preferences

**Deterministic Inputs/Outputs**: Normalized entities are sorted by stable ID/order; simulation DTOs receive explicit initial positions, velocities, seeded randomness, force constants, and tick phases; successful output is an ordered set of unique `(entityId, q, r)` placements plus ordered debug springs and diagnostics

**Resource Ownership**: The layout runner owns the active worker, promise, listeners, and independently configured hang-guard timer; the island factory owns every allocation until successful return and cleans partial failures; ownership then transfers entirely to an idempotent island handle; the application transactionally replaces a world only after a candidate result and handle succeed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Pre-research re-check (2026-07-20): PASS**

- **Domain-neutral model - PASS**: Force calculation consumes stable IDs and arbitrary parent relationships. Source-specific fields remain in the adapter; internal entities become optional calculation anchors, never domain or scene towers.
- **Separation and determinism - PASS**: `data.js` adapts source data, pure layout modules calculate positions, the worker transports plain contracts, `island.js` renders completed results, and `main.js` orchestrates UI state. Seed, ordering, forces, and tick counts are explicit.
- **Performance and lifecycle - PASS**: The plan covers the approved two-warmup/ten-run nearest-rank latency budgets and post-commit frame median, performs simulation off the main thread, avoids per-tick allocations in custom forces, batches springs, and assigns cleanup to worker and island owners. The operational hang guard is independent of the 2/8-second acceptance statistics.
- **Accessibility and resilience - PASS**: Native keyboard/touch selection is preserved across the defined desktop, phone, and tablet/hybrid classes, status is announced, the result is static, cancellation and stale results are defined, and a failed calculation retains the previous valid world.
- **Quality and simplicity - PASS**: Only `d3-force` is added rather than a full graph framework or custom physics engine. Pure deterministic behavior receives automated tests; visual/resource behavior receives browser and object-level checks; `npm run build` remains mandatory.

**Pre-research gate conclusion**: All five principles pass with no unresolved clarification or required Complexity Tracking exception. Phase 0 may proceed.

**Post-design re-check (2026-07-20): PASS**

- **Domain-neutral model - PASS**: The source adapter normalizes source-domain data before any spatial calculation. All existing and force algorithms consume only generic entities/ancestor relationships and return generic placements/gaps; rendering receives generic visual payload and structured endpoints.
- **Separation and determinism - PASS**: Layout, worker transport, and rendering have independent contracts. Axial cells are authoritative, d3 mutation is isolated, alpha is scheduled manually with automatic decay disabled, and published continuous endpoints are quantized.
- **Performance and lifecycle - PASS**: Supported entity/depth/membership/radius bounds, exact warmup/sample/rank definitions, worker cancellation, an acceptance-independent hang guard, bounded proposals, fixed work, one spring buffer, exception-safe factory ownership, and idempotent disposal are represented.
- **Accessibility and resilience - PASS**: The quickstart covers keyboard and touch selection across desktop, phone, and tablet/hybrid projects; current/previous stable engine certification; live status; reduced motion; unsupported/startup/worker/render failures; latest-request behavior; and retained-world recovery.
- **Quality and simplicity - PASS**: Contracts and tests cover the reusable pure behavior; browser checks cover only browser-specific presentation. No additional graph, state, test, or rendering framework is introduced. No Complexity Tracking exception is required.

**Post-design gate conclusion**: `research.md`, `data-model.md`, all interface contracts, and `quickstart.md` preserve the approved boundaries and provide repeatable evidence for every applicable principle. Phase 1 passes with no exception.

## Project Structure

### Documentation (this feature)

```text
specs/001-force-directed-layout/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── layout-contract.md
│   ├── render-contract.md
│   └── worker-protocol.md
└── tasks.md
```

### Source Code (repository root)

```text
index.html
package.json
src/
├── data.js                 # Source generator plus generic hierarchy/visual-payload adapter
├── hex.js                  # Shared pure axial-cell and plane-coordinate helpers
├── layout.js               # Generic existing algorithms, mode metadata, common result statistics
├── force-layout.js         # Pure d3-force setup and custom anchor/group/hex forces
├── layout-worker.js        # Module-worker request handler
├── layout-runner.js        # Async dispatch, hang guard, cancellation, latest-result policy
├── island.js               # Render completed LayoutResult and own GPU resources
├── main.js                 # UI state and transactional world replacement
└── style.css               # Existing responsive UI plus async status treatment

tests/
├── fixtures/
│   └── hierarchies.js       # Deterministic valid, invalid, and benchmark fixtures
├── data.test.js             # Hierarchy normalization and visual payload
├── hex.test.js             # Axial conversion, rounding, spiral, assignment primitives
├── layout.test.js          # Existing-layout regressions and generic statistics
├── force-layout.test.js    # Hierarchy validation, both modes, invariants, determinism
├── layout-worker.test.js   # Worker message/error boundary
├── layout-runner.test.js   # Cancellation, hang-guard, stale-response lifecycle
├── island.test.js          # Presentation contract, spring geometry, disposal
├── app.spec.js             # Keyboard, status, cancellation, responsive browser scenarios
├── layout.benchmark.spec.js # End-to-end 1,200/4,800-leaf Playwright benchmark
└── resource-profile.spec.js # Worker, GPU, listener, and idle-heap lifecycle profile

playwright.config.js

specs/001-force-directed-layout/validation/
├── us1.md
├── usability.md
├── us3.md
├── benchmark.md
├── accessibility.md
├── resources.md
└── final.md
```

**Structure Decision**: Preserve the single Vite application and existing module boundaries. Add only the pure hex/force modules and the worker/runner needed to satisfy deterministic discrete layout and main-thread responsiveness. Do not introduce a graph model, state framework, or rendering dependency beyond the selected packages.

## Implementation Approach

### Data And Layout Boundary

- Adapt the current source dataset into stable `id`, nullable `parentId`, and `order` entities plus a separate generic visual payload (`title`, `metadataText`, `heightValue`, and opaque color-group fields). No source-domain property crosses layout or render contracts.
- Validate empty input, duplicate IDs, missing parents, multiple-parent inconsistencies, cycles, and all documented scale bounds before starting a worker calculation. Derive leaves and ancestor memberships from relationships rather than domain-specific type names.
- Move axial directions, distance, ring/spiral generation, rounding, and axial-to-plane mapping into `src/hex.js` so legacy layouts, force assignment, and rendering share one coordinate definition.
- Preserve exact generic boundary-gap semantics with a deterministic multi-source hex wavefront per sibling partition/depth inside layout calculation, avoiding the current nested all-cell group comparisons at maximum scale.
- Refactor existing domain-named grouping/building inputs into generic leaf and ancestor-group derivation before spatial calculation. Preserve the existing flat/nested/packed math and current outputs with regression fixtures, but require all five algorithms to consume only normalized IDs, parent relationships, and stable order. Visual payload remains exclusively on the render/UI side. Return request/mode, `entityId` placements, empty springs, depth-indexed gaps, radius, and legacy diagnostics; unknown mode IDs fail explicitly.

### Deterministic Force Pipeline

- Clone normalized entities into mutable simulation DTOs because d3-force mutates nodes and links. Preserve immutable endpoint IDs for returned diagnostics.
- Sort entities, anchors, links, and result records with exact code-unit comparison. Initialize sorted leaves on a canonical compact spiral, anchors at quantized descendant centroids, and all velocities at zero; use Mulberry32 with an unsigned 32-bit seed.
- Run `simulation.stop()` and a fixed 256-tick schedule inside the worker: disable automatic alpha decay, set alpha from an explicit piecewise schedule on every tick, keep assignment mutable through tick 159, settle locked cells through tick 223, and pin exactly inside ticks 224-255.
- Register the custom hex-assignment force last. It maintains one cell per leaf, reassigns at fixed epochs with bounded deterministic deferred acceptance, applies attraction every tick, and sets final `fx/fy` to exact cell centers.
- Quantize desired positions, costs, and anchor endpoints to `0.000001` axial units with half-away-from-zero rounding. Validate finite state, scale/radius, complete unique assignments, bounded proposal counts derived from candidate radius, assignment stability, residual target error, and anchor velocity before returning success.

### Force Variants

- **Virtual anchors**: create one simulation-only node for every internal hierarchy entity; link each leaf or child anchor to its immediate parent anchor; apply link, many-body, weak centering, and hex forces; return one debug spring per active hierarchy link and no anchor placements.
- **Grouping forces**: simulate leaves only; precompute leaf-to-ancestor memberships; reuse centroid/count buffers each tick; attract each leaf toward ancestor centroids with strength decaying by hierarchy distance; apply many-body, weak centering, and hex forces; return no anchors, links, or springs.
- Avoid collision force initially because unique cell assignment owns final non-overlap and another quadtree traversal may threaten scale targets. Add it only if measured transient overlap materially harms layout quality.

### Async Orchestration And Rendering

- `layout-runner.js` assigns monotonically increasing request IDs. Starting any new layout first rejects the old promise as silent cancellation, then removes listeners, clears its independently configured hang guard, and terminates its worker; stale responses cannot settle or commit. The guard detects stuck work and is not equal to or derived from the 2/8-second acceptance limits.
- Keep the current island mounted during calculation. Build a candidate island off-world from a validated result; commit by adding the candidate and updating interaction references before removing and disposing the previous island.
- Refactor `island.js` to consume generic visual payload, a completed result, and presentation metadata. The factory cleans every partial allocation on exceptions, then transfers all island resources to an idempotent handle containing root, interactive tiles, water, water rings, world size, stats, and `dispose()`.
- Render all springs as one `THREE.LineSegments` buffer at literal `y = 0`, with `depthTest: true` and `depthWrite: false`. Do not clear depth or force an always-on-top overlay: opaque geometry may occlude springs, while force-mode towers render translucently without depth writes so springs remain distinguishable through them. Springs are never raycast targets.
- Force-mode occupied materials use `transparent: true`, opacity `0.5`, and no depth writes; legacy modes remain opaque. Existing scale/color hover and selection encodings remain unchanged.

### UI And Failure Behavior

- Add separate selector values and centralize label, note, `showSprings`, and occupied opacity in mode metadata. Each force note states grouping behavior, spring presence/absence, and 50% tower transparency.
- Associate the algorithm note and async status with the selector, announce calculating/completed/retained-world errors, and keep the selector available while work runs.
- Keep worker failures non-localized and map typed codes to UI text in `main.js`. Cover empty/invalid/overscale input, unsupported worker environment, startup/message/internal failures, non-finite state, assignment invariant, non-convergence, independent hang-guard expiry, WebGL unavailability, and candidate rendering failure. Superseded cancellation is silent; every other failure retains the previous world and is announced.
- Preserve responsive and reduced-motion styling, and ensure the control panel remains reachable on short mobile viewports.

## Validation Strategy

- Pure Node tests prove hierarchy/scale validation, canonical axial helpers, collision-safe structured IDs, exact config shape, bounded assignment, exact unique cells, generic stats, stable ordering, spring cardinality, no-link output, input-order independence, and ten-run determinism.
- Deterministic grouping fixtures require mean nearest same-group distance to be at most 80% of mean nearest other-group distance at each tested level for both force modes.
- Benchmark fixtures are fixed: representative current shape has 1,200 leaves, 20 immediate groups, 5 roots, depth 2, 2,400 memberships, and 1,220 anchor links; current-generator maximum has 4,800 leaves, 80 immediate groups, 10 roots, depth 2, 9,600 memberships, and 4,880 links; structural maximum has 4,800 leaves plus 1,200 internal entities including its single root, with internal nodes distributed over depths 0-15, every leaf at depth 16, every internal entity owning at least one descendant leaf, 76,800 memberships, and 5,999 links. Successful results remain within radius 256.
- Reference end-to-end benchmark project: Windows 11 workstation with Intel Core i7-1360P, 32 GB RAM, AC power, Playwright 1.61 Chromium, 1440x900 viewport, DPR 1, no CPU throttling, and nonessential applications closed. Record exact OS/browser/build metadata with results; benchmark results do not substitute for the compatibility matrix.
- Run two warmups followed by ten measured runs per mode/fixture. Time selector change through committed active status, including worker startup, cloning, calculation, validation, candidate rendering, and commit. Require nearest-rank p95 completion within 2 seconds for the representative fixture and 8 seconds for both maximum fixtures, nearest-rank p95 input-to-next-frame latency within 100 ms while busy, no layout-caused main-thread task over 250 ms, and pooled median post-commit frame time within 33.3 ms for the 4,800-leaf fixtures. The completion limits never abort an individual run.
- Calculate nearest-rank p95 as rank `ceil(0.95 * N)` after ascending sort; for ten measured runs, rank 10 is the slowest value. During each measured run, perform one prescribed benign keyboard-focus or pointer action while status is busy and measure its event timestamp to the next animation frame, then calculate control-response p95 over those ten observations. For each measured 4,800-leaf run, collect all animation-frame deltas in a five-second post-commit window and calculate one median over the pooled deltas from all ten windows; exclude warmups. Capture layout-period long tasks separately with `PerformanceObserver`.
- Configure portable Playwright projects for each bundled `chromium`, `firefox`, and `webkit` engine in three classes: `desktop` at 1024x720 with keyboard/pointer, `phone` at 360x800 with touch, and `tablet` at 768x1024 with touch or pointer. Where Playwright cannot emulate a capability for an engine, retain the viewport/input scenario and record the limitation rather than treating emulation as product certification.
- Run release certification in current and immediately previous stable Blink, Gecko, and WebKit products for every applicable desktop/laptop, phone, and tablet/hybrid class, yielding 18 engine-version-class combinations. Resolve and record exact product/engine/OS/device versions at execution time; use compatible macOS/iOS infrastructure or a real-browser/device service for Safari/WebKit. Bundled Playwright revisions alone do not prove current/previous stable support.
- Add focused visual projects for each bundled engine using the assigned control spring midpoint at `y = 0` as target: desktop 1440x900/DPR 1/distance 43 and mobile 390x844/DPR 3/distance 72, both with vertical FOV 34 degrees, azimuth 32 degrees clockwise from positive Z, and elevation 30 degrees. Applying these fixtures must not mutate the user camera preset. Assert visibility through translucent towers and normal occlusion by opaque geometry.
- Three.js object tests verify tower opacity/depth settings, spring `depthTest: true`, spring `depthWrite: false`, one batched spring object, literal zero-height vertices, exclusion from raycasting, and exactly-once disposal without requiring a WebGL context.
- Playwright covers keyboard and touch mode selection, live status, rapid switching/latest-request wins, empty/unsupported/startup/render failures, retained world, legacy restoration, all three device-class boundaries, reduced motion, the engine matrix, and both exact spring-visibility camera fixtures.
- SC-007 uses exactly ten first-time participants with a fixed unprompted task: identify what lines mean and trace one assigned relation. Record anonymous pass/fail evidence; at least nine must answer both correctly.
- Run `npm test`, `npm run test:e2e`, and `npm run build` before completion.
