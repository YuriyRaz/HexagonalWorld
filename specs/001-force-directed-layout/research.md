# Research: Force-Directed Layout

## Decision 1: Use Standalone d3-force 3.0.0

**Decision**: Add `d3-force@3.0.0` as the only new runtime dependency and commit the resulting lockfile update. Import named ESM exports rather than the complete D3 bundle.

**Rationale**: The package is rendering-independent, works with the project's native ESM/Vite baseline, provides composable links, many-body force, fixed positions, seeded randomness, manual ticks, and custom-force initialization. Its unpacked package size is approximately 90 KB before dependency deduplication. These are the mature physics primitives the feature needs while leaving hierarchy grouping and hex assignment in project-owned code.

**Alternatives considered**:

- Implementing all physics locally would duplicate cooling, integration, collision broad phase, Barnes-Hut repulsion, seeded coincidence handling, and link relaxation without adding product value.
- Graphology with ForceAtlas2 is suitable for free-form network analysis but adds an unnecessary graph model and does not expose an equivalent composable per-tick custom-force boundary for discrete hex occupancy.
- Importing the full `d3` package adds unrelated modules and bundle weight.

## Decision 2: Run Static Force Calculation In A Module Worker

**Decision**: Run both force modes in a Vite-bundled module worker. Stop the automatic d3-force timer and execute a fixed manual tick schedule. The runner owns one active worker, terminates it when superseded, and accepts only a matching request ID.

**Rationale**: `simulation.tick(count)` is synchronous and emits no timer events. At 4,800 leaves, many-body quadtrees and custom assignment can block input if run on the main thread. A worker directly satisfies the requirement that controls remain usable and provides a clear cancellation/resource owner.

**Alternatives considered**:

- Main-thread synchronous ticks risk multi-second input stalls.
- Main-thread tick batches scheduled between frames avoid one long block but complicate cancellation and still consume frame budget.
- A persistent multi-request worker saves startup cost but allows an old expensive request to delay a newer one unless it implements additional cooperative cancellation; terminating and replacing one worker is simpler for the current interaction rate.

## Decision 3: Isolate d3-force Mutation

**Decision**: Clone normalized entities into simulation-only DTOs and clone link records before passing them to d3-force. Keep domain payloads and immutable endpoint IDs outside these mutable objects.

**Rationale**: d3-force mutates node `index`, positions, velocities, and fixed positions. `forceLink` also replaces endpoint IDs with object references and adds link indexes. An explicit translation boundary keeps domain data authoritative and makes worker serialization, tests, and returned results predictable.

**Alternatives considered**:

- Passing source/domain entities directly would leak simulation state into data and violate the project boundary.
- Deep-cloning the whole generated dataset would transport rendering labels and marks that layout does not need.

## Decision 4: Make Simulation Deterministic By Construction

**Decision**: Sort normalized entities, anchors, links, and output records using explicit order and exact code-unit ID comparison; initialize leaves on a canonical spiral and anchors at quantized descendant centroids with zero velocities; use Mulberry32 with an unsigned 32-bit seed; set every d3-force value explicitly; quantize continuous published values to `0.000001` axial units; and execute exactly 256 ticks in fixed manually scheduled alpha phases.

**Rationale**: D3's defaults are deterministic within a version, but relying on default node order, default random source, or default cooling weakens the public reproducibility contract. Explicit inputs make ten-run tests meaningful and protect behavior from accidental configuration changes. Final axial coordinates are exact integers; continuous anchor endpoints are quantized before publication.

**Alternatives considered**:

- Running until a wall-clock deadline makes accepted output depend on device speed.
- Running until an event-based end condition delegates work count to mutable defaults.
- Depending on `Math.random()` or generator order would make repeatability impossible.

## Decision 5: Maintain Unique Hex Assignments Inside A Custom Force

**Decision**: Implement a stateful `hexAssignmentForce` that owns one axial cell per leaf. During fixed mutable epochs it ranks a bounded radius-three neighborhood plus the leaf's previous cell, resolves conflicts with deterministic deferred acceptance, commits assignments atomically, and applies attraction to the assigned center on every tick.

**Rationale**: Independent nearest-cell rounding cannot guarantee uniqueness. A bounded coordinated resolver gives at most 38 candidates and proposals per leaf per epoch, retains a guaranteed previous-cell fallback, avoids stable-ID serial bias, and keeps assignment work expected `O(n)` for fixed radius. Assignment is part of the simulation rather than a separate global post-layout matching pass.

**Alternatives considered**:

- Nearest-free serial greedy is simpler but strongly favors early IDs and can trap dense groups.
- Recomputing all assignments every tick adds cost without improving the fixed-phase result.
- Hungarian or min-cost-flow matching is a separate global postprocess with excessive complexity for 4,800 leaves.
- A bounded local search without a protected previous-cell fallback cannot guarantee a complete assignment for coincident desired positions.

## Decision 6: Pin Exact Centers During Final Simulation Ticks

**Decision**: Use mutable assignment through tick 159, lock assignments through tick 223, then set leaf `fx/fy` to assigned centers from tick 224 through 255. Reject the result unless assignments are complete and unique, positions are finite, assignment churn has stopped, and pre-pin error/anchor velocity thresholds pass.

**Rationale**: Finite attraction cannot mathematically guarantee exact equality with a cell center. d3-force applies `fx/fy` during its tick integration, so final pinning remains inside the simulation and satisfies the no-post-layout-assignment constraint. Fixed phases preserve reproducibility while metrics prevent pinning from hiding a failed layout.

**Alternatives considered**:

- Rounding after `simulation.tick()` violates the selected in-simulation constraint.
- Increasing attraction strength alone can oscillate or leave floating residual error.
- Accepting the final state when a hang guard expires would make successful results machine-dependent.

## Decision 7: Generalize Both Grouping Modes Over Arbitrary Hierarchy

**Decision**: Derive leaves and internal entities from normalized parent relationships. Anchor mode creates one simulation-only anchor per internal entity and one active link per child-parent relationship. Group mode creates no anchors or links and applies reusable centroid forces for each leaf-to-ancestor membership with strength decaying by hierarchy distance.

**Rationale**: This maps arbitrary internal-entity grouping factors without making source-domain types part of the layout and supports different hierarchy depths. Anchor work is linear in hierarchy edges. Group-force work is `O(M)`, where `M` is total leaf-to-ancestor memberships and is at most two memberships per leaf in the current data.

**Alternatives considered**:

- Hardcoded source-domain forces violate domain neutrality.
- Pairwise links among all members create artificial semantics, `O(n^2)` edges, and unusable debug clutter.
- A representative visible leaf per group makes one business entity arbitrarily special.

## Decision 8: Omit Collision Force Until Measurement Justifies It

**Decision**: Start with many-body separation, grouping/link forces, weak centering, and the authoritative hex-assignment force. Do not add `forceCollide` unless benchmarks or visual fixtures show harmful transient overlap.

**Rationale**: Unique final cells already guarantee tower non-overlap. Collision builds another quadtree and each additional collision iteration multiplies that cost. The constitution requires optimizations and complexity to respond to measured bottlenecks rather than speculation.

**Alternatives considered**:

- Always enabling collision is conventional for free-form layouts but redundant for the final discrete result.
- Removing many-body force instead would make dense desired positions and assignment churn more likely.

## Decision 9: Return Typed Results And Fail Transactionally

**Decision**: Worker responses are either a complete validated `LayoutResult` or a non-localized typed code/details failure. The runner adds empty/invalid/overscale, unsupported environment, worker startup/message, independently configured hang-guard expiry, cancellation, and internal failures; rendering adds WebGL/resource failures. `main.js` alone maps codes to localized text. The current island remains mounted until a candidate result has rendered successfully.

**Rationale**: Partial positions would violate deterministic and unique-cell guarantees. Transactional replacement meets the resilience requirement and prevents the current valid world from disappearing when calculation or resource creation fails.

**Alternatives considered**:

- Publishing best-effort positions after hang-guard expiry creates machine-dependent results.
- Removing the old island before calculation repeats the current failure mode in `main.js` and leaves an empty scene on errors.

## Decision 10: Batch Debug Springs With Physical Depth Occlusion

**Decision**: Render anchor-mode springs as one `LineSegments` geometry at literal world `y = 0`, with `depthTest: true` and `depthWrite: false`. Do not clear scene depth or force the lines into an always-on-top overlay. Opaque geometry may occlude them; force-mode towers remain translucent and do not write depth, allowing the lines to remain distinguishable through towers. Return no spring object in group mode. The island factory owns every allocation until successful return and cleans partial failures; ownership then transfers wholly to the handle.

**Rationale**: The approved behavior is a scene element that participates in physical occlusion, not a diagnostic overlay. One buffer avoids one draw object per spring and simplifies cleanup. The prescribed camera fixtures verify visibility through translucent towers and correct occlusion instead of assuming visibility through every surface. Springs remain excluded from raycasting.

**Alternatives considered**:

- Disabling depth testing or forcing late overlay rendering violates the approved physical-occlusion behavior.
- Raising springs above the base plane violates the specified zero level.
- One line object per spring scales resource and traversal overhead with link count.

## Decision 11: Use Layered Automated And Browser Validation

**Decision**: Use Node's built-in test runner for pure contracts and Playwright for interaction/visual behavior. Portable Playwright projects cover bundled Chromium, Firefox, and WebKit across desktop, phone, and tablet viewport/input classes, plus exact desktop and mobile visibility cameras. Separate release certification covers current and immediately previous stable Blink, Gecko, and WebKit products in every applicable device class. Benchmark two warmups and ten measured end-to-end runs at 1,200 and 4,800 leaves on the documented i7-1360P/32 GB Windows Chromium reference project, including worker startup through render commit; compute nearest-rank p95 completion and control response plus the pooled post-commit frame median. Do not enforce hardware-sensitive timing in generic CI until a matching stable runner exists.

**Rationale**: Layout, assignment, determinism, and failure contracts run without a browser and need precise regression tests. Transparency sorting, physical depth occlusion, live status, keyboard behavior, cancellation, and responsive presentation require browser scenarios. Bundled Playwright engines provide repeatable automation but do not certify both stable release trains or branded Safari, so versioned product/device evidence is recorded separately. No additional test framework is needed because Playwright is already installed and Node supplies the pure runner.

**Alternatives considered**:

- Browser-only tests make deterministic algorithm failures slower and harder to diagnose.
- Screenshot-only validation cannot prove uniqueness, cardinality, cancellation, or cleanup.
- Treating one bundled Playwright revision per engine as current-and-previous product certification leaves a release-coverage gap.
- Adding another unit-test dependency has no demonstrated need.

## Decision 12: Separate Performance Statistics From Runtime Safety

**Decision**: For each mode/fixture, run two unmeasured warmups and ten measured builds. Compute completion nearest-rank p95 from the ten build durations and control-response nearest-rank p95 from one prescribed busy-state response observation per measured build; rank `ceil(0.95 * 10) = 10` is the slowest observation. For 4,800-leaf fixtures, pool frame deltas from ten five-second post-commit windows and compute one median. Keep an independently configured worker hang guard solely for stuck-resource recovery; it is not equal to or derived from the 2/8-second acceptance thresholds and does not determine layout output.

**Rationale**: Explicit sample populations make all three metrics reproducible. Statistical limits assess expected product performance without making valid output depend on device speed, while a separate safety guard still bounds leaked or permanently stuck worker resources.

**Alternatives considered**:

- Using 2 or 8 seconds as a per-run abort threshold would conflate acceptance measurement with runtime behavior.
- Pooling an arbitrary number of control events across runs would make the p95 population vary with individual build duration.
- Omitting a separate hang guard could leave a failed worker and listeners alive indefinitely.

## Decision 13: Compute Generic Boundary Gaps With A Hex Wavefront

**Decision**: Preserve the existing minimum axial cell-gap meaning but calculate it generically by internal-entity depth and sibling partition. Use a deterministic multi-source hex-grid wavefront within the bounded layout radius to discover nearest boundaries between distinct groups, then average each group's nearest eligible gap.

**Rationale**: The current nested group/cell comparisons can approach quadratic work and would undermine the 4,800-leaf budget. The final force output already occupies unique integer cells inside radius 256, making bounded wavefront traversal exact, domain-neutral, and practical across supported hierarchy depths.

**Alternatives considered**:

- Keeping nested pairwise cell comparisons preserves semantics but can dominate maximum-size layout time.
- Approximate centroid or bounding-radius gaps change the existing user-visible statistic.
- Computing force statistics on the main thread would reintroduce an input-latency risk after worker completion.

## Sources

- [d3-force package metadata](https://github.com/d3/d3-force/blob/main/package.json)
- [d3-force simulation documentation](https://d3js.org/d3-force/simulation)
- [d3-force link documentation](https://d3js.org/d3-force/link)
- [d3-force many-body documentation](https://d3js.org/d3-force/many-body)
- [d3-force collision documentation](https://d3js.org/d3-force/collide)
- [Graphology ForceAtlas2 documentation](https://graphology.github.io/standard-library/layout-forceatlas2.html)
- [ForceAtlas2 paper](https://doi.org/10.1371/journal.pone.0098679)
- [Playwright browser support and installation](https://playwright.dev/docs/browsers)
- [Playwright device and input emulation](https://playwright.dev/docs/emulation)
- [Chrome release channels](https://chromereleases.googleblog.com/)
- [Firefox releases](https://www.mozilla.org/firefox/releases/)
- [Safari release notes](https://developer.apple.com/documentation/safari-release-notes)
