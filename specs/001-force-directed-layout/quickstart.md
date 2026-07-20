# Quickstart: Validate Force-Directed Layout

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm
- WebGL 2 and module-worker support
- Playwright-bundled Chromium, Firefox, and WebKit for portable automation
- Access to current and immediately previous stable Google Chrome/Blink on applicable desktop/laptop and Android phone/tablet, Mozilla Firefox/Gecko on applicable desktop/laptop and Android phone/tablet, and Apple Safari/WebKit on macOS, iPhone, and iPad; Safari checks require compatible Apple infrastructure or a real-browser/device service

## Install And Build

```powershell
npm install
npm run build
```

Expected result: Vite completes a production build without errors. The existing chunk-size advisory may remain unless implementation changes the current bundle split.

## Automated Validation

After implementation adds the planned scripts, run:

```powershell
npm test
npm run test:e2e
npm run benchmark:layout
```

Expected results:

- Pure tests pass hierarchy validation, axial helpers, exact unique assignments, spring cardinality, input-order independence, typed failures, and ten-run determinism.
- Browser tests pass keyboard and touch selection, live status, cancellation/latest-request behavior, empty/unsupported/startup/render failures, legacy restoration, reduced-motion behavior, the three device-class boundaries, and the exact desktop/mobile visibility cameras in bundled Chromium, Firefox, and WebKit.
- The benchmark reports the force mode at 1,200 and 4,800 leaves, the prescribed focused-selector `Tab` response, and post-commit frame time.

Portable Playwright project matrix:

| Project suffix | Engine | Device class | Boundary viewport/input |
|---|---|---|---|
| `desktop-chromium`, `desktop-firefox`, `desktop-webkit` | Bundled engine | Desktop/laptop | 1024x720 CSS px, keyboard and pointer |
| `phone-chromium`, `phone-firefox`, `phone-webkit` | Bundled engine | Phone | 360x800 CSS px, touch where supported; responsive/input limitation recorded otherwise |
| `tablet-chromium`, `tablet-firefox`, `tablet-webkit` | Bundled engine | Tablet/hybrid | 768x1024 CSS px, touch or pointer |

These projects provide repeatable cross-engine automation but do not by themselves certify current and previous stable branded products.

Focused spring-visibility projects:

| Project suffix | Preset |
|---|---|
| `visual-desktop-chromium`, `visual-desktop-firefox`, `visual-desktop-webkit` | Desktop QR-006a camera |
| `visual-mobile-chromium`, `visual-mobile-firefox`, `visual-mobile-webkit` | Mobile QR-006a camera |

Reference benchmark profile:

- Windows 11, Intel Core i7-1360P, 32 GB RAM, AC power.
- Dedicated `benchmark-chromium` project using Playwright 1.61 bundled Chromium, 1440x900 viewport, DPR 1, no CPU throttling.
- Close nonessential applications and record exact OS/browser/build metadata.
- Run two warmups followed by ten measured runs for every force-mode fixture.
- Measure from selector change through committed active status, including worker startup, structured clone, calculation, validation, candidate rendering, and commit.
- Calculate p95 by nearest rank (`ceil(0.95 * sampleCount)` after ascending sort); with ten completion runs this is the maximum measured run.
- During each measured run, wait for busy status while the algorithm selector remains focused, press `Tab` exactly once, and measure `keydown.timeStamp` to the first subsequent `requestAnimationFrame` callback. Calculate nearest-rank p95 over the ten measured responses; rank 10 is the acceptance value.
- Capture layout-period long tasks with `PerformanceObserver`. For each measured 4,800-leaf run, capture one five-second post-commit frame window; pool all frame deltas from the ten measured windows and calculate one median, excluding warmups.

Fixed fixture shapes:

- Representative: 1,200 leaves, 20 depth-1 internal entities, 5 roots, depth 2, 2,400 leaf-to-ancestor memberships, and 1,220 anchor links.
- Current-generator maximum: 4,800 leaves, 80 depth-1 internal entities, 10 roots, depth 2, 9,600 memberships, and 4,880 links.
- Structural maximum: 4,800 leaves plus 1,200 internal entities including one root; internal nodes occupy depths 0-15, every leaf is at depth 16, every internal entity has a descendant leaf, yielding 76,800 memberships and 5,999 active hierarchy links/debug springs; the successful result radius is at most 256.

Scale-boundary fixtures:

- Accept exactly 5,999 active links and reject 6,000 as `UNSUPPORTED_SCALE` before simulation.
- Accept computed radius 256 and reject radius 257 as `UNSUPPORTED_SCALE` during calculation/result validation.
- Every rejection retains the current world and publishes no partial layout.

Expected benchmark acceptance:

- p95 completion is at most 2 seconds for the representative fixture and 8 seconds for each maximum fixture.
- p95 focused-selector `Tab` `keydown`-to-next-frame latency while layout status is busy is at most 100 ms.
- Median frame time over the pooled ten five-second windows after committing 4,800 towers is at most 33.3 ms.
- The 2-second and 8-second values are statistical acceptance limits and never abort an individual measured or user run. The production worker hang guard is exactly 60,000 ms; timeout tests dependency-inject exactly 50 ms and use controlled/fake timing so normal validation never waits 60 seconds.
- Layout-period long tasks are recorded as diagnostics and do not add an acceptance threshold beyond the approved metrics.

## Release Compatibility Matrix

At release validation time, run the primary selection, build, spring rendering, zero-active-relation edge case, and restore-existing-layout scenarios in all 18 combinations:

| Product/engine | Desktop/laptop | Phone | Tablet/hybrid |
|---|---|---|---|
| Google Chrome/Blink, current and previous stable | Applicable desktop/laptop | Android phone | Android tablet/hybrid |
| Mozilla Firefox/Gecko, current and previous stable | Applicable desktop/laptop | Android phone | Android tablet/hybrid |
| Apple Safari/WebKit, current and previous stable | macOS | iPhone | iPad |

Use at least 1024x720 CSS px with keyboard/pointer for desktop/laptop, 360x800 CSS px with touch for phone, and 768x1024 CSS px with touch or pointer for tablet/hybrid. Record exact browser product, engine, OS/device, viewport, input mode, WebGL version, and module-worker result. A missing WebGL 2 or module worker is an expected unsupported-environment outcome, not a passing supported-platform run.

## Run Interactively

```powershell
npm run dev
```

Open the local URL printed by Vite.

## Scenario 1: Virtual Anchors And Springs

1. Keep or generate a hierarchy with multiple internal levels and leaves; the current school/class/student dataset is one example.
2. Select the force-directed mode using only the keyboard.
3. When busy status appears and the algorithm selector remains focused, press `Tab` once and verify focus advances without delaying the next frame by more than the measured acceptance procedure.
4. Wait for the completion announcement.
5. Rotate and zoom the world.

Expected:

- The previous world remains visible until the new result is ready.
- Exactly one tower appears for each leaf; no internal hierarchy entity or ancestor appears as a tower.
- Every tower is centered on a unique hex cell.
- Towers use opacity `0.5` (accepted range `0.45-0.55`); object checks preserve color and height mappings, while the fixed visual probes verify hover and selection contrast.
- All active hierarchy springs lie at surface level zero; the fixed visual probes verify visibility through translucent towers and normal occlusion by opaque geometry.
- The status identifies the active mode and spring count.

## Scenario 2: Restore Existing Layouts

1. From the force mode, select every existing layout mode in turn.

Expected:

- Any active worker is cancelled.
- Springs disappear.
- Occupied towers return to full opacity.
- Existing positions, height/color meanings, selection behavior, and summary values remain unchanged.
- No duplicated island resources remain after repeated switching.

## Scenario 3: Latest Request Wins

1. Generate the largest practical dataset.
2. Select the force mode and immediately select an existing mode, then another existing mode.

Expected:

- The interface remains responsive.
- Superseded calculations never replace the final selection.
- Cancellation does not show an error.
- Only the last selected mode becomes active.

## Scenario 4: Failure Retains The World

Use automated fixtures for empty input, duplicate ID, missing parent, cycle, 6,000 active links, computed radius 257, forced non-convergence, unsupported worker environment, worker startup/message failure, independent hang-guard expiry, WebGL unavailability, and candidate render failure. For hang-guard expiry, inject exactly 50 ms with controlled/fake timing and use a worker that never responds; separately assert that production configuration is 60,000 ms.

Expected:

- A localized live message explains that the requested layout was not built.
- The last valid world, selection controls, and camera remain usable.
- No partial force result or candidate resources become active.
- Timeout cleanup removes listeners, clears the guard, and terminates the worker exactly once.

## Scenario 5: Responsive, Touch, And Reduced Motion

1. Run the portable projects at desktop 1024x720, phone 360x800, and tablet/hybrid 768x1024 CSS px in bundled Chromium, Firefox, and WebKit.
2. Repeat with reduced motion enabled.
3. Navigate the complete form using keyboard only.
4. In projects with touch support, tap the algorithm select and apply the force mode; record emulation limitations rather than silently dropping an engine/class combination.

Expected:

- The force mode and its note/status remain reachable and readable.
- Focus remains visible.
- Touch selection applies the force mode without requiring hover or a mouse-only action.
- No simulation movement is shown in either motion preference.
- Critical grouping and failure information is available as text rather than color or animation alone.

## Scenario 6: Fixed Spring Visibility Cameras

Use a deterministic fixture that identifies one control spring, at least one segment seen only through a force-mode tower, and one segment behind opaque geometry. Run both presets in each bundled engine:

| Preset | Viewport | DPR | FOV | Target | Azimuth | Elevation | Distance |
|---|---:|---:|---:|---|---:|---:|---:|
| Desktop | 1440x900 | 1 | 34 degrees vertical | Control-spring midpoint at `y = 0` | 32 degrees clockwise from +Z | 30 degrees | 43 world units |
| Mobile | 390x844 | 3 | 34 degrees vertical | Same | 32 degrees clockwise from +Z | 30 degrees | 72 world units |

Probe procedure:

- Define every probe as a 5x5 rectangle in screenshot device pixels after DPR, not CSS pixels. Pair each visible-spring probe with an adjacent-background probe and each hover/selection probe with the same tower's inactive reference state.
- Convert 8-bit sRGB channels to linear values and compute WCAG relative luminance contrast `(L1 + 0.05) / (L2 + 0.05)`, where `L1 >= L2`.
- Require every visible-spring, hover, and selection region to contain at least one pixel at contrast 3:1 or greater against its paired reference.
- Capture an otherwise identical frame with the control spring disabled; require every corresponding pixel in each opaque-occlusion region to differ by no more than 5 in every 8-bit RGB channel.
- Verify color and height mappings with object-level assertions rather than screenshot interpretation.
- Restore the prior camera state and confirm the fixture did not modify the product's user camera preset.

## Scenario 7: Grouping Quality

Run deterministic grouping fixtures with at least two tested-depth ancestors having at least two leaves each.

Expected:

- At each tested depth, classify a leaf by its internal ancestor at that depth; exclude leaves without one.
- For each included leaf, measure nearest axial distance to a leaf with the same tested-depth ancestor and to one with a different ancestor.
- At every tested depth, mean same-ancestor nearest distance is at most 80% of mean different-ancestor nearest distance.
- The force-directed mode passes at every tested depth.

## Scenario 8: Debug Comprehension

Use exactly ten first-time participants. Without explaining the visualization, ask each participant what the lines represent and ask them to trace one specified relation from one endpoint to the other. Record anonymous pass/fail outcomes only.

Expected:

- At least nine of ten participants identify the lines as active virtual-anchor spring relations and trace the requested relation correctly.
- The task script, build ID, participant count, and aggregate outcome are retained with validation evidence.

## Resource Verification

Use the object-level island test and repeated browser switching scenario.

Expected:

- The force mode creates one spring geometry/material pair when active relations exist, regardless of spring count.
- A valid root-leaf fixture with no active relation creates no spring resources.
- Replaced candidates, old islands, and terminated workers release their owned resources exactly once.
- Debug springs never participate in tile raycasting.
