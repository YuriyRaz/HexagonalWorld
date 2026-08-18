# Implementation Plan: Fix Tower-to-Cell Alignment

**Branch**: `007-fix-tower-cell-alignment` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-fix-tower-cell-alignment/spec.md`

## Summary

Force-layout assignments are already deterministic, unique integer axial cells, but live frames expose continuous simulation coordinates and `island.js` renders those coordinates directly. Grid occupancy then independently rounds those positions, so rendered leaf Towers, cell metadata, springs, and hidden grid cells can disagree until terminal center lock.

Expose the authoritative leaf cell assignments in every force frame. Validate them at the worker/runner boundary, and make the renderer atomically derive rendered leaf-Tower transforms, leaf spring endpoints, selection metadata, and occupancy from the same assignment snapshot. Internal hierarchy entities remain non-rendered Layout Anchors. Preserve continuous normal presentation as discrete cell-to-cell changes, suppress intermediate presentation for reduced motion, and reuse grid resources when assignments or viewport coverage change.

## Technical Context

**Language/Version**: JavaScript ES modules on Node.js 20.19+ or 22.12+

**Primary Dependencies**: Three.js ^0.178.0, d3-force 3.0.0, Vite 7

**Storage**: N/A; layout sessions, assignments, and scene state are in memory

**Testing**: Node.js built-in test runner (`node --test`) and Playwright 1.61.1

**Target Platform**: Supported desktop and mobile browsers with WebGL and module-worker support, automated in the repository's Chromium profiles defined below

**Project Type**: Single-page 3D web application

**Performance Goals**: On the documented reference benchmark condition, present at least 60 complete visible updates per second for 500 rendered leaf Towers and approximately 2,000 visible cells over a fixed five-second window, and present the first aligned settled scene within 1,000 ms of validated result availability; both are hard test assertions

**Constraints**: No per-frame object or GPU-resource allocation in the live update path; one outstanding transferable frame at a time; integer axial coordinates must satisfy `R(q,r) = max(abs(q), abs(r), abs(-q-r)) <= 256`; invalid, duplicate, non-finite, non-integer, and out-of-bound assignments are rejected before presentation; rendered leaf-Tower centers remain on valid cells in every visible frame

**Scale/Scope**: Empty/prior-empty and single-rendered-leaf states through the 500-rendered-leaf-Tower/approximately-2,000-cell representative rendering fixture; internal entities remain calculation-only anchors, and protocol validation remains compatible with existing larger layout fixtures

**Accessibility/Responsive Scope**: Preserve keyboard selection and orbit rotate/pan/zoom/reset camera controls at the desktop, phone, tablet, and visual profiles defined below; reduced motion uses final-only presentation with no intermediate live island; alignment cannot rely on color alone

**Deterministic Inputs/Outputs**: Normalized entities, canonical topology order, force configuration, and seeded simulation determine an ordered leaf-cell snapshot; identical inputs produce identical complete visible frame/transition sequences, assignment revisions, visible centers, and final placements

**Resource Ownership**: The force session owns assignments and reusable frame buffers; the worker/runner transfer exact buffer ownership through receipts; the island handle owns reusable tower, spring, and grid GPU resources and disposes them on replacement, cancellation, rebuild, or page teardown

## Support and Validation Matrix

The implementation and validation use the same concrete support boundary as `spec.md`:

| Dimension | Supported values | Planned evidence |
| --- | --- | --- |
| Layout mode | `flat`, `nested`, `packed`, `force-anchors` | Static alignment for the first three; force `all-steps` and reduced-motion `final-only` lifecycle coverage |
| Camera operation | Orbit rotate, pan, zoom/dolly, Reset view | Pointer coverage on desktop; configured touch rotation and dolly/pan coverage on phone/tablet; world-space coordinates remain unchanged |
| Portable profiles | `desktop-chromium` 1024x720/DPR 1 keyboard-pointer; `phone-chromium` 360x800/DPR 1 touch; `tablet-chromium` 768x1024/DPR 1 touch | Responsive, resize, camera, keyboard, and reduced-motion checks in all three profiles |
| Visual profiles | `visual-desktop-chromium` 1440x900/DPR 1; `visual-mobile-chromium` 390x844/DPR 3 touch | Complete camera-operation and resize checks (rotate, pan, zoom/dolly, Reset) in both profiles, plus fixed visibility camera orientation checks |
| Browser | Playwright 1.61.1 bundled Chromium with WebGL and module-worker support | Record browser/OS/DPR/input/WebGL/worker metadata; local emulation is not native-device certification |
| Data and scale | Empty/prior-empty, one leaf Tower, negative cells, `R=256`, invalid `R>256`, and 500 rendered leaf Towers with approximately 2,000 visible cells | Unit, protocol, renderer, browser, resource, and benchmark fixtures |
| Benchmark condition | Windows 11 x64, Intel Core i7-1360P, 32 GB RAM, AC power, hardware-accelerated WebGL, no CPU throttling, nonessential applications closed | Two warm-ups plus ten measured five-second windows; record exact machine/browser metadata and reject evidence from an unmatched shared/virtualized machine |

## Constitution Check

*GATE: PASS. `spec.md` is Approved under the explicit remediation authorization, so the requirement gate is satisfied. The pre-research and post-design checks below are recorded and re-checked for this implementation-ready plan.*

### Pre-Research Gate

- **Domain-neutral model**: PASS. Stable entity IDs and canonical leaf order are retained; assignments contain only entity-independent hex coordinates.
- **Separation and determinism**: PASS. Force calculation owns assignments, transport validates them, and rendering consumes them without independently deciding cells.
- **Performance and lifecycle**: PASS. The representative scale, reference hardware condition, five-second measurement window, hard 60-update assertion, 1,000 ms settlement assertion, and resource ownership rules are explicit; transferred arrays, matrices, geometries, materials, and grid capacity are reused.
- **Accessibility and resilience**: PASS. The complete profile matrix, camera operations, keyboard preservation, final-only reduced-motion behavior, invalid frames, active-calculation cancellation, supersession, and empty/prior-world fallbacks are defined.
- **Quality and simplicity**: PASS. The design extends existing frame and renderer contracts without new dependencies or a replacement layout algorithm; validation includes complete-sequence determinism, cancellation lifecycle, unit, browser, resource, benchmark, and build checks.

## Project Structure

### Documentation (this feature)

```text
specs/007-fix-tower-cell-alignment/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── alignment-frame-contract.md
└── tasks.md                         # Created by /speckit.tasks, not this command
```

### Source Code (repository root)

```text
src/
├── hex.js                 # Reuse canonical axial-to-plane mapping and cell metrics
├── force-layout.js        # Publish authoritative leaf-cell snapshots and preserve continuous steps
├── layout-worker.js       # Transfer/restore both frame buffers and honor final-only presentation
├── layout-runner.js       # Validate assignment frames, receipts, settlement, and stale identities
├── island.js              # Render leaf Towers/springs/occupancy atomically from assignments; reuse grid resources
└── main.js                # Commit live/final-only scenes and expose alignment diagnostics to tests

tests/
├── fixtures/
│   └── hierarchies.js       # Canonical alignment, boundary, scale, and repeatability fixtures
├── force-layout.test.js   # Assignment snapshot determinism and uniqueness
├── force-session-v2.test.js
├── layout-worker.test.js  # Transfer ownership, continuous/final-only lifecycle
├── layout-runner.test.js  # Protocol rejection, settlement, and supersession
├── island.test.js         # Matrices, metadata, springs, occupancy, and resource reuse
├── app.spec.js            # Desktop/mobile/reduced-motion acceptance scenarios
├── layout.benchmark.spec.js
└── resource-profile.spec.js
```

**Structure Decision**: Keep the existing flat `src/` architecture. Calculation, transport, rendering, and orchestration changes remain in their current owners; no new runtime module or dependency is justified.

## Phase 0 Research Outcome

Research decisions and alternatives are recorded in [research.md](./research.md). All technical unknowns are resolved; no clarification markers remain.

## Phase 1 Design

### Authoritative Frame Data

Each force frame carries continuous node positions for simulation diagnostics and Layout Anchor spring endpoints plus an ordered `Int16Array` of leaf `(q, r)` assignments. Canonical leaf order is obtained by filtering topology order for `nodeKinds[index] === 'leaf'`; only these leaf entities are rendered Towers. Internal `anchor` nodes are never assigned a Tower cell or footprint. The exact inclusive validity predicate is `R(q,r) = max(abs(q), abs(r), abs(-q-r)) <= 256`, and the existing radius limit fits the selected cell representation.

This follows `data-model.md`: `leafOrder` is the transported assignment order, each Hex Cell Assignment belongs to one leaf, and the Tower Presentation Record is derived only for that leaf.

The worker and runner validate the full cell snapshot before presentation: type and length, finite whole-number coordinates satisfying `R(q,r) <= 256`, uniqueness, assignment hash, request/step identity, and terminal equality with serialized placements. Non-finite, non-integer, duplicate, or out-of-bound assignments fail before callbacks or scene mutation. Presentation receipts return both exact transferable buffers so the next frame reuses their storage.

### Atomic Live Rendering

`createLiveIsland` and `applyStep` validate a complete frame before mutating scene state. On an assignment revision, one update derives rendered leaf-Tower X/Z centers through `axialToPlane`, writes instance `q/r/x/z` metadata, updates leaf spring endpoints, and updates occupied/empty-cell state. Layout Anchor spring endpoints continue to use continuous positions. Horizontal interpolation between cells is prohibited.

When the assignment revision is unchanged, rendered leaf-Tower matrices and grid occupancy remain unchanged; only required Layout Anchor spring data and diagnostics update. This avoids redundant matrix work and grid churn while maintaining continuous force feedback.

### Grid Ownership

Replace repeated empty-grid mesh creation with an island-owned mutable grid resource. Geometry and material are created once. Instance matrices, colors, metadata, and visible count are updated only for an assignment revision or a throttled viewport-radius change. Capacity growth disposes replaced GPU resources exactly once and updates interaction references atomically.

### Presentation Lifecycle

Normal `all-steps` mode keeps the current continuous force presentation. Convergence is a status event, not permission to replay the same numbered terminal frame: subsequent frames remain monotonically numbered and every tower remains on its assigned cell. A valid initial result is derived from the step-zero assignment instead of fabricating duplicate origin placements.

Reduced-motion `final-only` mode performs the same deterministic calculation while suppressing ready and intermediate presentation callbacks. On convergence, the runner validates the terminal assignment and result, main builds one aligned candidate, and the previous valid world remains visible until atomic commit. This newer accessibility behavior supersedes the earlier requirement to animate force steps under reduced motion.

Cancellation during active calculation, rapid mode changes, stale requests, invalid frames, and failed final construction preserve the prior valid world and release worker, listener, buffer, timer, and scene ownership exactly once; no cancellation callback may commit a partial candidate.

### Test Observability

Extend opt-in diagnostics so tests can inspect request/step/revision identity, each rendered leaf Tower's entity ID and `(q, r, x, z)`, occupied-cell keys, assignment hash, leaf-cell assignments, derived centers, and spring vertices after presentation. Production builds do not retain frame history unless the existing test diagnostics flag is enabled. Determinism tests compare the complete ordered visible sequence across repeated runs, not just its terminal snapshot.

### Post-Design Constitution Gate

- **Domain-neutral model**: PASS. The design adds no source-domain fields and preserves stable identity and canonical topology.
- **Separation and determinism**: PASS. Assignment authority remains in layout calculation; transport validates; rendering performs only centralized coordinate mapping.
- **Performance and lifecycle**: PASS. The design reuses transferred arrays and GPU resources, updates occupancy only on assignment/viewport changes, and defines exact disposal paths.
- **Accessibility and resilience**: PASS. Final-only reduced motion, desktop/mobile validation, stale-result rejection, and prior-world rollback are explicit contracts.
- **Quality and simplicity**: PASS. Existing modules and dependencies are reused, all regression logic is independently testable, and the quickstart includes the mandatory build gate.

## Complexity Tracking

No constitution violations require justification.
