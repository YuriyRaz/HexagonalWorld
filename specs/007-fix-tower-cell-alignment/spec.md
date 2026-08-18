# Feature Specification: Fix Tower-to-Cell Alignment

**Feature Branch**: `007-fix-tower-cell-alignment`

**Created**: 2026-08-14

**Status**: Approved
**Approval Basis**: The explicit user authorization for this remediation is treated as approval to proceed in this feature workflow; no constitution change is required.

**Input**: User description: "The towers do not placed right to the cells. Why this happened and how to fix?"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Towers Centered on Assigned Cells (Priority: P1)

As a user viewing the hexagonal world, I want every tower to be centered on its assigned hexagonal cell so that tower positions are visually clear and the grid remains a trustworthy spatial reference.

**Why this priority**: A tower that visibly straddles cell boundaries makes its coordinate and relationships ambiguous, undermining the primary spatial model.

**Independent Test**: Render representative layouts and compare each tower's footprint center with the center of its assigned cell. This delivers an unambiguous one-to-one visual mapping between towers and cells.

**Acceptance Scenarios**:

1. **Given** a completed layout containing towers, **When** the user views the grid from any supported camera angle, **Then** every tower is centered on the cell identified by its assigned hex coordinates.
2. **Given** a tower occupies a cell, **When** its footprint is compared with the cell boundaries, **Then** the tower has the same hex orientation as the grid and does not appear shifted toward an adjacent cell.
3. **Given** the same hierarchy and layout settings are loaded repeatedly, **When** each layout completes, **Then** every tower receives the same cell assignment and visible center each time.

---

### User Story 2 - Alignment During Visible Motion (Priority: P2)

As a user watching a force layout or layout transition, I want towers to remain associated with valid cell centers throughout visible motion so that they never appear to float between or cut across cells.

**Why this priority**: The reported defect is most visible while provisional force positions are displayed before the final cell-centered placement is reached.

**Independent Test**: Record every visible state from layout start through completion and verify that each rendered tower center corresponds to one valid grid cell at every sampled frame.

**Acceptance Scenarios**:

1. **Given** a force layout is running, **When** an intermediate state is displayed, **Then** every visible tower is centered on a valid cell rather than an arbitrary point between cells.
2. **Given** a tower changes from one assigned cell to another, **When** the change is presented, **Then** the tower is never shown resting at a fractional or mismatched cell position.
3. **Given** reduced motion is preferred, **When** the layout changes, **Then** towers move directly to their valid destination cells without an unnecessary animated transition.

---

### User Story 3 - Consistent Alignment Across Views and Layouts (Priority: P3)

As a user switching layouts, resizing the viewport, or moving the camera, I want tower and grid alignment to remain unchanged so that presentation changes do not alter spatial meaning.

**Why this priority**: Alignment must be a stable property of the world rather than an artifact of one layout mode, viewport size, or camera state.

**Independent Test**: Exercise every supported layout at representative desktop and mobile viewport sizes, then rotate, pan, zoom, and resize while checking that tower centers and assigned cell centers remain coincident.

**Acceptance Scenarios**:

1. **Given** towers are correctly aligned, **When** the user switches among supported layout modes, **Then** all visible towers remain aligned to valid cells before and after each switch.
2. **Given** towers are correctly aligned, **When** the viewport is resized or the camera is moved, **Then** no tower shifts relative to the grid.
3. **Given** an empty or single-tower hierarchy, **When** the world is displayed, **Then** the grid remains valid and any tower is centered on its assigned cell.

---

## Support and Validation Matrix

The following matrix is the concrete support boundary for this feature. Browser entries describe the repository's repeatable automated evidence profile, not native-device certification.

| Dimension | Supported values | Required validation coverage |
| --- | --- | --- |
| Layout mode | `flat`, `nested`, `packed`, `force-anchors` | Static center checks for the first three; `force-anchors` in normal `all-steps` and reduced-motion `final-only` presentation |
| Camera operation | Orbit rotate, pan, zoom/dolly, and Reset view | Each operation must preserve world-space tower/cell centers; use pointer controls on desktop and the configured touch gestures on phone/tablet |
| Portable viewport | Desktop `1024x720` CSS px, DPR 1, keyboard/pointer; phone `360x800`, DPR 1, touch; tablet `768x1024`, DPR 1, touch | Run the layout, camera, resize, keyboard, and reduced-motion checks in each profile |
| Visual viewport | Desktop `1440x900`, DPR 1; mobile `390x844`, DPR 3 | Run camera rotation, pan, zoom/dolly, Reset view, and resize checks in both profiles, using fixed visibility camera presets for orientation and perceived alignment |
| Browser profile | Playwright 1.61.1 bundled Chromium with WebGL and module-worker support; `desktop-chromium`, `phone-chromium`, `tablet-chromium`, plus the two visual Chromium profiles | Record the actual browser, OS, viewport, DPR, input mode, WebGL, and worker capability; local phone/tablet emulation is not native-device evidence |
| Data scale and states | Empty/prior-empty view, one rendered leaf tower, negative coordinates, inclusive radius boundary, invalid/out-of-bound data, and 500 rendered leaf towers with approximately 2,000 visible cells | Validate the alignment invariant, rollback behavior, uniqueness, and resource reuse at each state |
| Representative benchmark | 500 rendered leaf towers, approximately 2,000 visible cells, two warm-up runs and ten measured runs with a five-second visible-update window | Run on the reference condition of Windows 11 x64, Intel Core i7-1360P, 32 GB RAM, AC power, hardware-accelerated WebGL, no CPU throttling, and nonessential applications closed; record exact machine and browser metadata and do not treat a different shared/virtualized machine as passing evidence |

---

## Coordinate Domain and Validation

- Tower assignments use integer axial coordinates `(q, r)` and `s = -q - r`.
- The supported axial radius is 256, and a coordinate is valid exactly when `R(q, r) = max(abs(q), abs(r), abs(s)) <= 256` (equivalently, for integer coordinates, `(abs(q) + abs(r) + abs(q + r)) / 2 <= 256`).
- Non-finite, non-integer, duplicate, or out-of-bound coordinates, including any assignment with `R(q, r) > 256`, are invalid. The worker/runner MUST reject the complete layout before a presentation callback or scene mutation; the interface retains the prior valid world or an empty usable view.

### Edge Cases

- During rapid repeated layout changes, stale intermediate results must not place towers on cells belonging to an older layout.
- If two towers compete for the same destination cell, each tower must receive a unique valid cell before that state is presented.
- Negative and large hex coordinates must align to their corresponding visible cells as accurately as cells near the origin.
- Empty, one-tower, and maximum representative datasets must preserve the same alignment invariant.
- Invalid or non-finite placement data must not produce a visibly misplaced tower; the affected layout must fail cleanly while the interface remains usable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST use the assigned hex cell as the authoritative horizontal position of each tower whenever the tower is displayed as occupying the grid.
- **FR-002**: The visible center of every tower footprint MUST coincide with the visible center of its assigned hex cell.
- **FR-003**: Tower footprints and grid cells MUST share the same hexagonal orientation.
- **FR-004**: Every displayed tower assignment MUST use whole-number hex coordinates and MUST map to exactly one visible cell center.
- **FR-005**: During force-layout motion and layout transitions, the system MUST present each tower at a valid cell center in every visible state.
- **FR-006**: When a tower changes cells, the presentation MUST preserve an unambiguous current or destination cell assignment and MUST NOT leave the tower visibly resting between cells.
- **FR-007**: No two displayed towers MUST occupy the same cell in any visible layout state, including force motion and transitions.
- **FR-008**: Cell occupancy visuals MUST identify the same cell that contains the corresponding tower, including during visible layout updates.
- **FR-009**: Tower-to-cell alignment MUST remain unchanged by camera movement, zoom, viewport resizing, or switching among supported layout modes.
- **FR-010**: Stale or superseded layout results MUST NOT replace a newer valid tower-to-cell assignment.
- **FR-011**: Invalid placement data MUST be rejected without displaying a tower at a non-cell position, and the user MUST retain a usable prior or empty view.
- **FR-012**: Every displayed assignment MUST satisfy the exact inclusive axial-radius predicate `max(abs(q), abs(r), abs(-q-r)) <= 256`. An assignment outside this fixed radius MUST be rejected before presentation or scene mutation; FR-004 governs whole-number cell mapping, FR-007 governs uniqueness, and FR-011 governs invalid-placement rejection.

### Quality and Constraint Requirements *(mandatory)*

- **QR-001 - Domain neutrality**: Alignment behavior MUST depend only on stable entity identity, layout results, and hex coordinates; it MUST remain independent of the hierarchy's business domain and depth.
- **QR-002 - Determinism**: Identical normalized data and layout settings MUST produce identical tower cell assignments, centers, and the complete ordered visible frame/transition sequence, including every displayed step, assignment revision, and derived center, not only the final assignment.
- **QR-003 - Performance and scale**: With 500 rendered leaf towers and approximately 2,000 visible cells, on the representative benchmark condition in the support matrix, the implementation MUST present at least 60 complete visible updates per second over the fixed five-second measurement window and MUST present the first aligned settled scene no later than 1,000 ms after the validated result becomes available. These are hard acceptance limits, not advisory targets.
- **QR-004 - Accessibility and responsive use**: Correct alignment MUST hold at every portable and visual viewport profile in the support matrix; keyboard operation MUST remain available, touch camera operation MUST remain available on phone/tablet profiles, and visible motion MUST respect the user's reduced-motion preference.
- **QR-005 - Resilience**: Empty data, invalid coordinates, interrupted layout calculations including cancellation during active calculation, rapid layout changes, and scene rebuilds MUST not leave towers visibly detached from their assigned cells or make the interface unusable; cancellation MUST clean up owned workers, buffers, listeners, timers, and candidate scenes without committing partial state.

### Key Entities

- **Tower**: The visible representation of a leaf hierarchy entity only, identified by a stable entity ID and associated with one current cell assignment. Internal hierarchy entities are not Towers.
- **Layout Anchor**: A non-rendered internal hierarchy entity used for force calculation and relationship springs; it has no Tower footprint or cell assignment, although its continuous spring endpoint may be shown.
- **Hex Cell Assignment**: The authoritative association between a tower and a unique whole-number hex coordinate, including the corresponding visible center and assignment state.
- **Visible Layout State**: A coherent set of tower cell assignments presented together at one point during initialization, motion, transition, or completion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across all supported layout modes, 100% of settled towers have footprint centers coincident with their assigned cell centers within a visual tolerance of 1% of the cell center-to-center spacing.
- **SC-002**: In a frame-by-frame review of force motion and layout transitions, 100% of visible tower centers correspond to valid whole-number hex cells; zero sampled towers visibly rest between cells.
- **SC-003**: Repeating the same hierarchy and layout settings 20 times produces an identical complete ordered visible frame/transition sequence, including every assignment revision and visible tower center, in all 20 runs after request-specific identity is normalized out.
- **SC-004**: Every portable and visual viewport profile covering camera rotation, pan, zoom/dolly, Reset view, and resize produces zero tower-to-grid shifts.
- **SC-005**: On the representative benchmark condition with 500 rendered leaf towers and approximately 2,000 visible cells, every measured five-second window presents at least 60 complete visible updates per second, and every measured result-to-first-aligned-scene latency is at most 1,000 ms.
- **SC-006**: All acceptance scenarios pass for empty, single-tower, dense, and rapidly changing layouts, with no tower displayed at an invalid position.

## Assumptions

- The screenshot represents a force-layout or transition state in which provisional free-space positions are currently visible before final cell assignments are applied.
- The established pointy-top hex coordinate system, cell dimensions, and visual grid orientation remain the product standard.
- A rendered Tower is a leaf entity; internal entities are layout anchors only and are never assigned a Tower cell or footprint.
- This feature corrects tower placement and occupancy consistency; redesigning tower dimensions, grid styling, camera controls, or hierarchy layout goals is out of scope.
- Existing tower selection, hover, and relationship visuals remain available and must follow the corrected tower positions.
- The representative scale remains 500 rendered leaf Towers and 2,000 visible cells, consistent with the existing grid-field feature.
