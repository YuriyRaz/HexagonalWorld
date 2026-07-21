# Feature Specification: Main Thread Yielding for Responsive Event Loop

**Feature Branch**: `002-main-thread-yielding`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "keeps controls reachable at project boundaries and short viewports" — Playwright test timeout caused by Three.js render loop with raycasting starving the event loop, preventing evaluate callbacks from executing at 360×568 viewport

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Responsive UI at Small Viewports (Priority: P1)

A user on a mobile device (360px width, 568px height) interacts with the hexagonal world builder. They select a force-directed layout algorithm, triggering a rebuild. The UI remains responsive throughout the rebuild — status updates appear, controls stay reachable, and the app does not freeze.

**Why this priority**: Core reliability — if the app becomes unresponsive during layout operations at common mobile viewport sizes, users cannot interact with the tool at all on those devices.

**Independent Test**: Can be tested by loading the app at 360×568, selecting a layout algorithm, and verifying that UI controls remain clickable and status text updates within 5 seconds.

**Acceptance Scenarios**:

1. **Given** the app is loaded at 360×568, **When** the user selects a layout algorithm and triggers a rebuild, **Then** the `#layout-status` element updates to show busy state within 2 seconds
2. **Given** the app is loaded at 360×568, **When** a rebuild is in progress, **Then** the `#algorithm-note` element remains reachable (visible and not obscured by overlapping elements)
3. **Given** the app is loaded at 360×568, **When** a rebuild completes, **Then** the `#layout-status` element updates to show the result within 3 seconds

---

### User Story 2 - Playwright Test Reliability (Priority: P2)

Automated tests that verify UI reachability at boundary viewports (360×800, 360×568) complete within the 60-second timeout without false failures caused by main-thread starvation.

**Why this priority**: Test reliability ensures continuous integration catches real regressions rather than producing flaky results that erode confidence.

**Independent Test**: The test `keeps controls reachable at project boundaries and short viewports` passes consistently across 10 consecutive runs at 360×568 without timeout.

**Acceptance Scenarios**:

1. **Given** the test suite runs at the 360×568 viewport profile, **When** the reachability test executes, **Then** it completes within 30 seconds (well under the 60s timeout)
2. **Given** the render loop is active, **When** Playwright injects an evaluate callback, **Then** the callback executes within 5 seconds regardless of viewport size

---

### User Story 3 - Consistent Behavior Across Viewports (Priority: P3)

The app behaves identically at large (1024×720) and small (360×568) viewports with respect to layout rebuild responsiveness. No viewport-dependent regressions in interaction timing.

**Why this priority**: Ensures the fix does not introduce viewport-specific regressions while solving the small-viewport problem.

**Independent Test**: Run the reachability test at both 1024×720 and 360×568 and verify both pass within similar time budgets.

**Acceptance Scenarios**:

1. **Given** the app is loaded at 1024×720, **When** a layout rebuild is triggered, **Then** controls remain reachable (no regression from the fix)
2. **Given** the app is loaded at 360×568, **When** a layout rebuild is triggered, **Then** controls remain reachable (the original problem is resolved)

---

### Edge Cases

- What happens when the render loop has zero tiles to raycast? The loop should still yield periodically to avoid starvation on empty scenes.
- What happens during rapid repeated rebuild triggers? Each rebuild should not compound main-thread blocking — yielding must occur between frames regardless of rebuild state.
- What happens on high-DPI displays where pixel ratio is capped at 2? The yielding behavior must not depend on pixel ratio or frame rate.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The render loop MUST yield control to the event loop at regular intervals (at least once per animation frame) to allow pending microtasks and macrotasks to execute
- **FR-002**: Per-frame hover detection (cursor-to-tile intersection) MUST NOT block the event loop for more than one frame budget (approximately 16ms at 60fps)
- **FR-003**: The app MUST remain interactive (controls clickable, status text updating) during layout rebuild operations at all supported viewport sizes
- **FR-004**: The fix MUST NOT introduce visible rendering artifacts, frame drops, or changes to the visual output for the same input data
- **FR-005**: The `#layout-status` element MUST update its text content within 3 seconds of a rebuild starting and within 3 seconds of a rebuild completing

### Quality and Constraint Requirements *(mandatory)*

- **QR-001 - Determinism**: For identical input data and viewport dimensions, the rendered output must be visually identical before and after the fix
- **QR-002 - Performance and scale**: The render loop must maintain at least 30fps at the smallest supported viewport with a representative tile count (500+ tiles); cooperative yielding must not reduce frame rate below this threshold
- **QR-003 - Accessibility and responsive use**: All controls must remain reachable (visible, not obscured, and interactable) at the smallest supported viewport dimensions; keyboard and touch interaction must not be blocked by the render loop
- **QR-004 - Resilience**: If the render loop encounters an error in raycasting or camera updates, it must recover gracefully on the next frame without crashing the app
- **QR-005 - Domain neutrality**: The yielding mechanism must be generic — it must not depend on specific tile counts, force algorithms, or scene content to function correctly

### Key Entities

- **Render Loop**: The animation cycle that updates camera, controls, hover state, and visual effects each frame via the browser's animation callback
- **Event Loop**: The browser's main-thread task queue that processes user input, JavaScript callbacks, and DOM mutations
- **Hover Detection**: The synchronous operation that determines which tile the cursor is over by intersecting a ray with the scene geometry

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The Playwright test `keeps controls reachable at project boundaries and short viewports` passes at the smallest supported viewport within 30 seconds (50% reduction from the 60s timeout budget)
- **SC-002**: Layout status text updates are visible within 3 seconds of rebuild start/completion at the smallest supported viewport
- **SC-003**: Render loop maintains at least 30fps at the smallest supported viewport with 500+ tiles (no performance regression)
- **SC-004**: The reachability test passes 10 consecutive runs at the smallest supported viewport without timeout failures (0% flake rate)
- **SC-005**: No visual differences in rendered output for identical scene data before and after the change

## Assumptions

- The animation loop's synchronous per-frame work is the primary source of main-thread starvation at small viewports
- Playwright's `locator.evaluate()` requires the main thread to be idle to inject and execute callbacks
- The smallest supported viewport (360×568) represents common short mobile devices (iPhone SE, older Android)
- The existing rebuild-and-worker architecture is sound — the issue is purely in the render loop's cooperation with the event loop
- No changes to the layout computation or worker logic are needed — only the render loop's frame budget behavior needs adjustment
