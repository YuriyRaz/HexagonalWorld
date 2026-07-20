# Quickstart: Validate Force-Directed Layout

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm
- WebGL 2 and module-worker support
- Playwright-bundled Chromium, Firefox, and WebKit for portable automation
- Access to current and immediately previous stable Blink, Gecko, and WebKit products across the applicable desktop/laptop, phone, and tablet/hybrid classes for release certification; Safari/WebKit product checks require compatible Apple infrastructure or a real-browser/device service

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
- The benchmark reports both modes at 1,200 and 4,800 leaves plus main-thread input latency and post-commit frame time.

Portable Playwright project matrix:

| Project suffix | Engine | Device class | Boundary viewport/input |
|---|---|---|---|
| `desktop-chromium`, `desktop-firefox`, `desktop-webkit` | Bundled engine | Desktop/laptop | 1024x720 CSS px, keyboard and pointer |
| `phone-chromium`, `phone-firefox`, `phone-webkit` | Bundled engine | Phone | 360x800 CSS px, touch where supported; responsive/input limitation recorded otherwise |
| `tablet-chromium`, `tablet-firefox`, `tablet-webkit` | Bundled engine | Tablet/hybrid | 768x1024 CSS px, touch or pointer |

These projects provide repeatable cross-engine automation but do not by themselves certify current and previous stable branded products.

Reference benchmark profile:

- Windows 11, Intel Core i7-1360P, 32 GB RAM, AC power.
- Dedicated `benchmark-chromium` project using Playwright 1.61 bundled Chromium, 1440x900 viewport, DPR 1, no CPU throttling.
- Close nonessential applications and record exact OS/browser/build metadata.
- Run two warmups followed by ten measured runs for every mode/fixture pair.
- Measure from selector change through committed active status, including worker startup, structured clone, calculation, validation, candidate rendering, and commit.
- Calculate p95 by nearest rank (`ceil(0.95 * sampleCount)` after ascending sort); with ten completion runs this is the maximum measured run.
- During each measured run, perform one prescribed benign keyboard-focus or pointer action while status is busy and measure its event timestamp to the next animation frame. Calculate nearest-rank p95 over the ten measured responses; rank 10 is the acceptance value.
- Capture layout-period long tasks with `PerformanceObserver`. For each measured 4,800-leaf run, capture one five-second post-commit frame window; pool all frame deltas from the ten measured windows and calculate one median, excluding warmups.

Fixed fixture shapes:

- Representative: 1,200 leaves, 20 immediate groups, 5 roots, depth 2, 2,400 leaf-to-ancestor memberships, and 1,220 anchor links.
- Current-generator maximum: 4,800 leaves, 80 immediate groups, 10 roots, depth 2, 9,600 memberships, and 4,880 links.
- Structural maximum: 4,800 leaves plus 1,200 internal entities including one root; internal nodes occupy depths 0-15, every leaf is at depth 16, every internal entity has a descendant leaf, yielding 76,800 memberships and 5,999 links.

Expected benchmark acceptance:

- p95 completion is at most 2 seconds for the representative fixture and 8 seconds for each maximum fixture.
- p95 input-to-next-frame latency while layout status is busy is at most 100 ms.
- No layout-caused main-thread task exceeds 250 ms.
- Median frame time over the pooled ten five-second windows after committing 4,800 towers is at most 33.3 ms.
- The 2-second and 8-second values are statistical acceptance limits and never abort an individual measured or user run. A separately configured worker hang guard exists only for stuck-resource recovery.

## Release Compatibility Matrix

At release validation time, run the primary selection, build, spring-present/spring-absent, and restore-existing-layout scenarios in all 18 combinations:

- Blink current and previous stable x desktop, phone, tablet/hybrid.
- Gecko current and previous stable x desktop, phone, tablet/hybrid.
- WebKit current and previous stable x desktop, phone, tablet/hybrid.

Use at least 1024x720 CSS px with keyboard/pointer for desktop/laptop, 360x800 CSS px with touch for phone, and 768x1024 CSS px with touch or pointer for tablet/hybrid. Record exact browser product, engine, OS/device, viewport, input mode, WebGL version, and module-worker result. A missing WebGL 2 or module worker is an expected unsupported-environment outcome, not a passing supported-platform run.

## Run Interactively

```powershell
npm run dev
```

Open the local URL printed by Vite.

## Scenario 1: Virtual Anchors And Springs

1. Keep or generate a hierarchy with multiple internal levels and leaves; the current school/class/student dataset is one example.
2. Select the force-directed virtual-anchor mode using only the keyboard.
3. Keep interacting with the algorithm selector while calculation is announced.
4. Wait for the completion announcement.
5. Rotate and zoom the world.

Expected:

- The previous world remains visible until the new result is ready.
- Exactly one tower appears for each leaf; no internal hierarchy entity or ancestor group appears as a tower.
- Every tower is centered on a unique hex cell.
- Towers are 50% opaque and remain distinguishable by color, height, hover, and selection.
- All active hierarchy springs lie at surface level zero, remain distinguishable through translucent towers, and are occluded normally by opaque geometry.
- The status identifies the active mode and spring count.

## Scenario 2: Grouping Forces Without Links

1. Select the force-directed grouping-force mode.
2. Wait for completion and inspect groups from several angles.

Expected:

- Leaves sharing nearer ancestors form stronger spatial groups than leaves sharing only remote ancestors.
- There are no virtual anchors, debug springs, or artificial leaf-to-leaf relations.
- Towers remain 50% opaque and occupy unique hex centers.
- The mode note explicitly says grouping is performed without links and towers are 50% transparent.

## Scenario 3: Restore Existing Layouts

1. From each force mode, select every existing layout mode in turn.

Expected:

- Any active worker is cancelled.
- Springs disappear.
- Occupied towers return to full opacity.
- Existing positions, height/color meanings, selection behavior, and summary values remain unchanged.
- No duplicated island resources remain after repeated switching.

## Scenario 4: Latest Request Wins

1. Generate the largest practical dataset.
2. Select virtual-anchor mode and immediately select grouping-force mode, then an existing mode.

Expected:

- The interface remains responsive.
- Superseded calculations never replace the final selection.
- Cancellation does not show an error.
- Only the last selected mode becomes active.

## Scenario 5: Failure Retains The World

Use automated fixtures for empty input, duplicate ID, missing parent, cycle, unsupported scale, forced non-convergence, unsupported worker environment, worker startup/message failure, independent hang-guard expiry, WebGL unavailability, and candidate render failure.

Expected:

- A localized live message explains that the requested layout was not built.
- The last valid world, selection controls, and camera remain usable.
- No partial force result or candidate resources become active.

## Scenario 6: Responsive, Touch, And Reduced Motion

1. Run the portable projects at desktop 1024x720, phone 360x800, and tablet/hybrid 768x1024 CSS px in bundled Chromium, Firefox, and WebKit.
2. Repeat with reduced motion enabled.
3. Navigate the complete form using keyboard only.
4. In projects with touch support, tap the algorithm select and apply both force values; record emulation limitations rather than silently dropping an engine/class combination.

Expected:

- Both force modes and their notes/status remain reachable and readable.
- Focus remains visible.
- Touch selection applies both modes without requiring hover or a mouse-only action.
- No simulation movement is shown in either motion preference.
- Critical grouping mode and failure information is available as text rather than color or animation alone.

## Scenario 7: Fixed Spring Visibility Cameras

Use a deterministic fixture that identifies one control spring, at least one segment seen only through a force-mode tower, and one segment behind opaque geometry. Run both presets in each bundled engine:

| Preset | Viewport | DPR | FOV | Target | Azimuth | Elevation | Distance |
|---|---:|---:|---:|---|---:|---:|---:|
| Desktop | 1440x900 | 1 | 34 degrees vertical | Control-spring midpoint at `y = 0` | 32 degrees clockwise from +Z | 30 degrees | 43 world units |
| Mobile | 390x844 | 3 | 34 degrees vertical | Same | 32 degrees clockwise from +Z | 30 degrees | 72 world units |

Expected:

- The entire control-spring portion passing only behind translucent towers remains distinguishable.
- The assigned portion behind opaque geometry is occluded by normal depth testing.
- Tower color, height, hover, and selection remain distinguishable.
- The fixture restores the prior camera state and does not modify the product's user camera preset.

## Scenario 8: Grouping Quality

Run deterministic grouping fixtures with at least two groups of at least two leaves at every tested ancestor depth.

Expected:

- At each tested depth, group a leaf by its ancestor at that depth; exclude leaves without one.
- For each included leaf, measure nearest axial distance to a leaf with the same tested-depth ancestor and to one with a different ancestor.
- At every tested depth, mean same-group nearest distance is at most 80% of mean different-group nearest distance.
- Both anchor and no-link force modes pass independently.

## Scenario 9: Debug Comprehension

Use exactly ten first-time participants. Without explaining the visualization, ask each participant what the lines represent and ask them to trace one specified relation from one endpoint to the other. Record anonymous pass/fail outcomes only.

Expected:

- At least nine of ten participants identify the lines as force/group relations and trace the requested relation correctly.
- The task script, build ID, participant count, and aggregate outcome are retained with validation evidence.

## Resource Verification

Use the object-level island test and repeated browser switching scenario.

Expected:

- Anchor mode creates one spring geometry/material pair regardless of spring count.
- Group mode creates no spring resources.
- Replaced candidates, old islands, and terminated workers release their owned resources exactly once.
- Debug springs never participate in tile raycasting.
