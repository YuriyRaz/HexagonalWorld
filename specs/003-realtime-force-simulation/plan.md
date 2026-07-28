# Implementation Plan: Realtime Force Simulation Visualization

**Branch**: `003-realtime-force-simulation` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-realtime-force-simulation/spec.md`

## Summary

Implement one retained, deterministic d3-force session whose leaves move under link, many-body, centering, and a stateful unique-hex-target force. Step 0 and every numbered non-reduced force step are painted in order. Cell assignments may change at deterministic epochs and influence later motion; convergence requires stable assignments, bounded movement, and leaves locked exactly to assigned centers inside the numbered simulation. Terminal full-precision worker coordinates equal assigned centers, while transported/rendered towers and spring sources use their direct Float32 representation, with no independent final projection. After the stable island commits, the worker remains idle and exposes tested stable-ID fix/release controls for future interaction epochs, while this feature adds no drag gesture.

## Technical Context

**Language/Version**: JavaScript native ES modules on Node.js 20.19+ or 22.12+

**Primary Dependencies**: Existing Three.js 0.178, d3-force 3.0.0, Vite 7, and Playwright 1.61; no new dependency

**Storage**: N/A; hierarchy, simulation, evolving assignments, accepted control transcript, progress, and result state remain in memory

**Testing**: `npm test` for session, assignment, cyclic-input rejection, commands, worker/runner, and render contracts; the existing local Playwright Chromium desktop, 360x800 touch-emulation, 768x1024 touch-emulation, and benchmark projects through `npm run test:e2e` and `npm run benchmark:layout`; `npm run build`

**Target Platform**: Locally available Playwright Chromium desktop validation plus phone/tablet viewport and touch-emulation profiles. Native Android browser/OS/hardware acceptance, ADB/CDP, branded Chrome release certification, Firefox, Safari, and Chrome on iOS are out of scope.

**Project Type**: Client-side 3D web application

**Performance Goals**: Normal-motion step 0 plus status within 1 second for the 1,200-leaf representative fixture and 2 seconds for the 4,800-leaf maximum fixture; reduced-motion status within the same limits; at the representative fixture every step is contiguous, at least 5 steps/sec, and at least 95% of gaps are <=200 ms; independent ten-run local-host desktop-keyboard, desktop-pointer, and Playwright emulated-phone-touch nearest-rank p95 action latency <=100 ms; p95 completion <=2 seconds/8 seconds respectively and maximum-fixture post-commit median frame <=33.3 ms remain blocking; a retained settled worker emits zero ticks/messages/timers and repeated replacement leaves no resource growth

**Constraints**: One D3 tick equals one global numbered force step; no batching/coalescing/dropping/interpolation in normal motion; every leaf owns one unique cell throughout; successful terminal leaf coordinates equal assigned centers before serialization; maximum initial or post-release cooling budget is 256; one retained worker per authoritative force request; no user-facing drag UI; production frame updates allocate no scene resources

**Scale/Scope**: A displayed entity is a rendered leaf/tower and excludes internal anchors. With seed `0x5eed003`, the exact representative fixture has 1,200 displayed leaves, 300 anchors, 19,200 memberships, 1,499 springs, and maximum depth 16; the exact maximum fixture has 4,800 displayed leaves, 1,200 anchors, 76,800 memberships, 5,999 springs, and maximum depth 16. Depth 16 is a verification composition rather than a product cap. Final axial radius is 256, and each leaf has at most 38 assignment candidates per assignment epoch.

**Accessibility/Responsive Scope**: The essential force-mode selection, generator/rebuild, status/progress/relationship meaning, and canonical-camera-reset journey uses semantic keyboard controls with visible focus. Canvas selection and free orbit/zoom remain enabled non-essential exploratory enhancements, with reset-camera as the keyboard recovery alternative. Visible `aria-live="off"` step/convergence progress, polite start/terminal status, reduced-motion final-only calculation, and local Chromium desktop/phone/tablet validation profiles remain required; native mobile assistive-technology acceptance and tower manipulation remain out of scope.

**Deterministic Inputs/Outputs**: Canonical hierarchy/node/link/candidate order, complete version-2 config, seeded d3 random source, integer global/epoch/cooling steps, quantized assignment decisions and metrics, one accepted command transcript, and full-precision worker state determine traces/results; paint timing, pointer events, visibility, and transport precision do not

**Resource Ownership**: Session owns d3 nodes/links, assignments, fixed map, command transcript, epochs, and reusable buffers; runner owns one request-scoped worker, listeners, deferreds, sequence counters, and active-time guards through retained settlement; main owns RAF/media/visibility listeners and stable/provisional islands; operation success clears its guard but retains session resources; failure, mode switch, rebuild, supersession, commit failure, `pagehide`, or disposal destroys them exactly once

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Pre-research check (2026-07-27): PASS WITH TRACKED COMPLEXITY**

- **Domain-neutral model - PASS**: Assignments and controls use stable generic leaf IDs and simulation-plane coordinates only.
- **Separation and determinism - PASS**: Layout owns assignments/controls, worker/runner own ordering, renderer owns scene buffers, and main owns user interaction; no DOM/camera/Three.js value crosses into calculation.
- **Performance and lifecycle - PASS**: Scale/cadence/input/final targets, bounded assignment work, zero-idle-work retained state, one-worker invariant, and exact release paths are explicit.
- **Accessibility and resilience - PASS**: Current controls remain accessible; the command seam is non-user-facing; reduced motion, hidden tabs, rollback, retained-worker failure, and teardown are covered.
- **Quality and simplicity - PASS WITH TRACKED COMPLEXITY**: The retained worker/control seam is additional current complexity justified by approved FR-014/FR-015/QR-006 and the concrete next drag feature. No drag UI, preview, pointer arbitration, or dormant second abstraction is added.

**Pre-research gate conclusion**: The tracked extension seam is justified; no unresolved clarification blocks research.

**Post-design check (2026-07-27): PASS WITH TRACKED COMPLEXITY**

- **Domain-neutral model - PASS**: Contracts use request, command sequence, stable leaf ID, fix/release action, and finite plane coordinates.
- **Separation and determinism - PASS**: Stateful assignment, in-tick center lock, command application boundaries, transcript replay, operation settlement, and scene commit have independent contracts/tests.
- **Performance and lifecycle - PASS**: Radius-three candidates, reusable arrays/buffers, one outstanding frame, no retained idle work, pending-commit handshake, resumed guard, and all destruction paths are defined.
- **Accessibility and resilience - PASS**: Negative UI tests ensure no drag gesture was introduced; retained-session failure preserves the committed world; future manipulation accessibility remains in the future feature.
- **Quality and simplicity - PASS WITH TRACKED COMPLEXITY**: One generic two-command seam is the minimum extension. Existing runner Promise compatibility is preserved, and broader drag semantics are explicitly deferred.

**Post-design gate conclusion**: Phase 1 passes with the retained-session complexity documented below.

## Project Structure

### Documentation

```text
specs/003-realtime-force-simulation/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- force-session-contract.md
|   |-- worker-protocol.md
|   `-- render-contract.md
`-- tasks.md                 # Regenerated by /speckit.tasks
```

### Source And Tests

```text
index.html
package.json
playwright.config.js

src/
|-- data.js
|-- hex.js
|-- force-layout.js          # Session, hex force, convergence, commands/epochs
|-- layout-worker.js         # Step/paint/control state machine, retained idle
|-- layout-runner.js         # Promise operation plus retained-session control port
|-- island.js                # Mutable live and stable island resources
|-- main.js                  # RAF, progress, transactions, lifecycle release
`-- style.css

tests/
|-- fixtures/hierarchies.js
|-- force-layout.test.js
|-- layout-worker.test.js
|-- layout-runner.test.js
|-- island.test.js
|-- app.spec.js
|-- layout.benchmark.spec.js
`-- resource-profile.spec.js
```

**Structure Decision**: Preserve current module boundaries. Add no drag module or UI component; the force-control port is implemented at session/worker/runner boundaries and exercised through contract/test seams only.

## Implementation Approach

### Evolving Unique Hex Assignments

- Create a resumable version-2 force session. Leaves start mobile at unique packed assignments; anchors start at all-descendant centroids. Install seeded randomness and register link, many-body, center, then custom hex-target force in fixed order.
- Give leaves and anchors the configured many-body strength so a fixed leaf can repel neighbors. The hex force attracts each uncontrolled leaf toward its current assigned center every tick; it does not directly rewrite positions during ordinary movement.
- Reconsider assignments every four local cooling steps. Predict leaf position, enumerate canonical radius-three candidates plus protected previous cell, rank quantized distance/move cost, resolve conflicts with deterministic deferred acceptance, and commit atomically only when all leaves remain uniquely assigned. Reuse numeric arrays/encoded cells; retain no production trace history.
- Track real unchanged assignment epochs. After three unchanged epochs and center-error gates (`max <=0.06`, `RMS <=0.01` cell spacings), begin center lock. During the next numbered D3 tick set automatic leaf `fx/fy` to already-assigned centers; freeze assignments and keep anchors mobile. This in-simulation lock makes full-precision leaf coordinates exactly equal centers.
- Converge after minimum step 32 and eight consecutive terminal-quality steps requiring no controlled-fixed leaves, stable assignments, exact leaf-center equality, and centered movement (`max <=0.06`, `RMS <=0.01`). Step 256 without convergence fails. `finish()` only validates/serializes the terminal state and never assigns or moves nodes.

### One-Step Presentation

- Send topology and step 0, then alternate exact logical paint acknowledgements and one D3 tick. Frames contain global step, epoch/cooling step, assignment revision/hash/stability, movement/target errors, control watermark, positions, and terminal evidence.
- Normal-motion sequences are contiguous with one outstanding returned Float32 buffer. Reduced motion executes the same kernel final-only. Hidden presentation pauses acknowledgement/active guard without catching up.
- The terminal force frame already contains exact assigned-center leaves. An ordinary stable island may replace live GPU resources only after result validation and must reproduce every tower and leaf spring source coordinate exactly.

### Retained Session And Control Port

- Extend the session with ordered `set-fixed-position` and `release-fixed-position` controls applied only between ticks. Commands contain request ID, monotonic sequence, stable leaf ID, action, and finite simulation-plane coordinates; no UI/camera/render object is accepted.
- Initial epoch is 0. Commands reject during initial running and settled-awaiting-commit. In retained-settled, the first valid fixed command starts a new interaction epoch, clears automatic center locks, resets alpha/streak/assignment stability, and keeps global steps contiguous. Further commands are accepted in held/interaction-cooling. Controlled leaves use command-owned `fx/fy`; convergence and cooling-budget consumption are disabled while any remain fixed. Fixed coordinates must be finite and within fractional axial radius 256. Each accepted held command boundary permits one neighbor-updating tick.
- Releasing the final fixed leaf clears command fixation, resets cooling step/streak/alpha, and starts a fresh 256-step budget. Assignments resume deterministic evolution and eventual in-simulation center lock. Identical accepted transcripts at identical global-step boundaries reproduce the epoch trace/result.
- `runLayout()` still resolves the initial result Promise. Success changes runner to `settled-awaiting-commit`, clears the operation guard, and retains worker/listeners. `confirmSessionResultCommitted()` enables controls and enters `retained-settled`. Commit failure destroys the session.
- `submitForceControl()` returns an applied/rejected receipt. `waitForEpochSettlement()` exposes later results to a future caller. No current gesture invokes either. Retained idle owns no timer and emits no ticks/messages. New layout/data, mode switch, supersession, worker failure, `pagehide`, or dispose destroys the captured session exactly once.

### Rendering, UI, And Transactions

- Reuse one live tower `InstancedMesh` and one dynamic spring buffer for steps. Assignment target changes do not teleport towers; terminal center lock occurs in the numbered worker frame.
- Build a stable island from the terminal result plus its authoritative terminal frame after exact coordinate equality checks; force-mode stable construction consumes the terminal frame's direct Float32 leaf positions rather than deriving transforms from axial placements. Retain the same worker only after final island commit confirmation. A later control epoch treats the committed island as rollback authority, creates a provisional live view through retained observers, and requires epoch-specific commit confirmation before returning to retained-settled.
- Add visible non-live progress for global step, epoch, cooling step, assignment stability, convergence streak, and terminal reason. Keep current selection/camera gestures unchanged and controls enabled; test that no tower drag or simulation-mutating accessible action exists.
- Initial/mid-run reduced motion suppresses intermediate presentation but not calculation. A future interaction epoch resamples motion preference at epoch start. Retained idle remains inert regardless of preference.

## Validation Strategy

- Pure tests cover complete config, canonical assignments, bounded proposals, conflict chains, assignment trace determinism, next-tick target influence, all-node repulsion, lock prerequisites, exact terminal equality, no final mutation, no-command compatibility, commands between ticks, interaction epochs, held convergence blocking, release budget, and transcript replay.
- Worker/runner tests cover exact paint gating, command FIFO/receipts, no accepted-command coalescing, control watermark, initial Promise settlement without termination, pending-commit rejection, retained idle, later epoch settlement, fresh guards, stale callbacks, post-success failure, and all release paths.
- Render/browser tests cover frame/tower/spring/assignment coherence, terminal/live/stable coordinate identity, current gestures unchanged, no drag UI, retained worker after commit, zero idle activity, rollback, mode-switch release, reduced motion, hidden tab, and one-root/one-worker/resource baselines.
- Local Playwright Chromium initial/cadence and desktop-keyboard, desktop-pointer, and emulated-phone-touch cohorts remain as specified. Blocking final timing metrics remain. Benchmark retained idle CPU/message counts and repeated settle/rebuild/switch resource growth. Profile before optimizing.
- Freeze benchmark-passing behavior before automated semantic-clarity evidence, the full local Chromium validation-profile matrix, and `npm run build`.

## Complexity Tracking

| Added Complexity | Why Needed Now | Simpler Alternative Rejected Because |
|---|---|---|
| Retain one request-scoped worker after successful commit | FR-014 requires exact full-precision continuation for the concrete next drag feature | Reconstructing from stable cells loses exact force/anchor/assignment state; terminating immediately contradicts the approved requirement |
| Generic ordered fix/release command port and interaction epochs | FR-015, QR-006, and SC-010/SC-012 require a tested extension seam now | Deferring all controls would require redesigning session, worker success lifecycle, convergence, and runner ownership after implementation |
