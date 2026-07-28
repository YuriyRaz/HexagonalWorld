# Feature Specification: Realtime Force Simulation Visualization

**Feature Branch**: `003-realtime-force-simulation`
**Created**: 2026-07-24
**Status**: Draft
**Input**: User description: "Make force directed method to be realtime calculated, I wanted to see how debug strings chage the positions under the action of forces."

## Clarifications

### Session 2026-07-27

- Q: Which browser validation environments are supported for this feature? → A: The locally available Playwright Chromium projects: 1024x720 desktop, 360x800 phone viewport with touch emulation, and 768x1024 tablet viewport with touch emulation. Native Android hardware/browser/OS validation, ADB/CDP, Firefox, Safari, branded Chrome release certification, and Chrome on iOS are out of scope.
- Q: What initial-view latency applies at representative and maximum supported scale? → A: At most 1 second for 1,200 displayed leaves and at most 2 seconds for 4,800 displayed leaves; internal force anchors are excluded from the displayed count and use the fixture composition defined by QR-003.
- Q: How is a force calculation considered stabilized? → A: Finish early after deterministic movement, assignment stability, and assigned-center thresholds remain satisfied for the required consecutive steps, with a fixed maximum step count.
- Q: How much of the force evolution must be displayed? → A: Without reduced motion, use D3-demo-style frame pacing: display every completed force step once and in order, wait for it to paint before calculating the next visible step, and show the current and final step count.
- Q: How are interaction-latency samples divided across available input methods? → A: Measure ten Playwright Chromium desktop-keyboard runs, ten desktop-pointer runs, and ten emulated-phone-touch runs as separate local-host cohorts; each cohort must independently meet the latency limit, and mobile-emulation results must not be described as native-device performance.
- Q: How is reduced-motion success measured? → A: Use automated checks that show no intermediate motion, preserve accessible start and final status, retain inspectable final springs, and produce the same deterministic final result.
- Q: Should this feature prepare for future tower dragging? → A: Add and test a generic request-scoped force-control seam now, but keep tower drag gestures and UI in a separate future feature.
- Q: How should future dragging resume after the layout has converged? → A: Keep the converged worker and full-precision force session alive so a later force-control command can reheat and resume the exact settled simulation.
- Q: When is the retained settled force session terminated? → A: Terminate it when the user switches away from force-directed mode; rebuilding data, superseding it with a newer request, or page teardown also uses the existing termination path.
- Q: How does an accepted future force-control command restart movement? → A: Start a new interaction epoch, reset the alpha schedule and convergence streak, prevent convergence while a leaf remains fixed, and begin a fresh cooling and maximum-step budget on release while global displayed steps remain contiguous.
- Q: How must force convergence relate to final hex-cell placement? → A: Unique hex-cell assignment participates in the force evolution; convergence requires stable assignments and actual leaf coordinates at their assigned centers, so raw simulation and displayed final coordinates match with no post-convergence projection or snap.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Watch Forces Move the Layout (Priority: P1)

When a user selects the force-directed layout, the world begins showing the calculation immediately. The towers and debug springs move through intermediate positions so the user can observe the graph evolving over time under the forces instead of seeing only the final stabilized arrangement.

**Why this priority**: Seeing the calculation is the purpose of the feature. A final-only result does not let users understand or debug the relationships driving the layout.

**Independent Test**: Select force-directed mode on a hierarchy with visibly separated groups, capture the world during calculation, and verify that intermediate tower positions and the endpoints of their debug springs change before the layout settles.

**Acceptance Scenarios**:

1. **Given** a valid hierarchy, reduced motion is not requested, and force-directed mode is selected, **When** calculation begins, **Then** initial force step 0 and a calculating status are shown within 1 second for 1,200 displayed entities or within 2 seconds for 4,800 displayed entities rather than waiting for the final result; with reduced motion, the calculating status meets the same latency target while intermediate force states remain suppressed.
2. **Given** reduced motion is not requested and the force-directed calculation has not stabilized, **When** one force step completes, **Then** that step is displayed once and in order with the towers, corresponding debug springs, and visible completed-step count updated together before the next visible step is calculated.
3. **Given** deterministic movement thresholds and cell-assignment stability remain satisfied for the required consecutive steps, **When** the final force frame is shown, **Then** movement stops, the status reports the convergence step, every tower's actual simulation position equals its unique assigned cell center, and no later projection or snap changes the displayed arrangement.

---

### User Story 2 - Keep the Application Usable During Calculation (Priority: P2)

While the force-directed view is changing, the user can still understand what is happening and use the surrounding controls. The user can switch to another layout without waiting for the current simulation to finish.

**Why this priority**: A live visualization is only useful if it does not make the application feel frozen or prevent recovery from an unwanted calculation.

**Independent Test**: Start a force-directed calculation in the Playwright desktop and 360x800 phone touch-emulation profiles, verify status updates and keyboard focus remain usable, then select another layout before stabilization and verify that the live calculation is cancelled cleanly.

**Acceptance Scenarios**:

1. **Given** a force-directed calculation is active, **When** the user reads the layout status or moves keyboard focus through the controls, **Then** the status identifies the calculation as active and the controls remain reachable and responsive.
2. **Given** a force-directed calculation is active, **When** the user selects another layout, **Then** the active calculation stops, its intermediate springs and positions are removed, and only the newly selected layout can replace the world.
3. **Given** the user starts another force-directed calculation immediately after cancelling one, **When** the new calculation produces frames, **Then** no frames or debug springs from the cancelled calculation appear in the new view.

---

### User Story 3 - Preserve Trustworthy Results and Motion Preferences (Priority: P3)

The user receives the same stable arrangement for the same input and settings, while people who prefer reduced motion can still inspect the result and calculation state without continuous movement.

**Why this priority**: Observability must not make the layout unpredictable or create an inaccessible experience.

**Independent Test**: Run the same input twice and compare the stabilized results, then repeat with reduced motion enabled and verify that the user receives a stable result, status information, and relationship diagnostics without forced animation.

**Acceptance Scenarios**:

1. **Given** identical normalized data and layout settings, **When** the force-directed calculation is run multiple times, **Then** the stabilized tower positions and debug spring set are identical.
2. **Given** the user has enabled reduced motion, **When** force-directed mode is selected, **Then** the user receives the calculation status and final relationship diagnostics without continuous intermediate animation being imposed.
3. **Given** the input is empty, invalid, unsupported, or the calculation cannot stabilize, **When** the failure is detected, **Then** the previous valid world remains visible and the user receives an understandable status message.

### Edge Cases

- A hierarchy with one displayed entity or no active relationships shows a valid result and does not create unnecessary debug springs.
- A calculation that reaches equilibrium near the earliest eligible step may show only a short moving sequence but still reports its state correctly.
- When multiple leaves prefer the same cell, assignment conflicts are resolved deterministically while every leaf retains a unique target and tower motion remains part of the displayed force evolution.
- Rapidly switching layouts or repeatedly rebuilding does not leave duplicate towers, stale springs, or an old result overwriting the latest selection.
- Switching away from force-directed mode terminates and releases any retained settled force session before a different layout becomes authoritative.
- A long-running or stalled calculation is stopped by the existing safety behavior without replacing the previous valid world.
- A large supported hierarchy continues to provide intermediate updates without making controls unusable.
- A browser or local validation profile that cannot support the required visualization reports the limitation and preserves the previous valid world.
- A cyclic hierarchy is rejected as invalid at the normalization/layout boundary before a force session mutates the displayed world; its message identifies the cycle and states that the previous world remains displayed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Selecting force-directed mode MUST start a calculation that can expose intermediate layout states before stabilization.
- **FR-002**: Selecting force-directed mode MUST expose step 0 plus calculating status in normal motion, or calculating status without an intermediate force state in reduced motion, within the startup budgets defined by QR-003.
- **FR-003**: When reduced motion is not requested and the calculation is unsettled, every completed force step MUST be displayed exactly once and in order, with no later step calculated for display until the preceding step has been painted. QR-003 defines the required presentation cadence.
- **FR-003a**: Without reduced motion, the interface MUST display the current completed-step count during calculation. In every presentation mode, it MUST report the final step count when convergence or the maximum step count is reached; per-step changes MUST NOT trigger assistive live announcements, while start and terminal status MUST remain announced.
- **FR-004**: Debug springs MUST use the positions from the same intermediate state as their endpoints, so each displayed spring remains connected to the entities or virtual anchors represented by that state.
- **FR-005**: The live force-directed view MUST display each active relationship with exactly one corresponding debug spring at scene height `y = 0`. Springs MUST remain transparent, depth-tested, non-depth-writing, and excluded from raycasting; force towers MUST retain their established translucency and selection/hover distinction.
- **FR-006**: The calculation MUST finish early only when deterministic movement thresholds, assignment stability, and target-center error thresholds remain satisfied for the configured consecutive-step count. If the fixed maximum step count is reached without convergence, the calculation MUST fail according to FR-011.
- **FR-006a**: Throughout force evolution, every leaf MUST retain one unique assigned hex cell. Assignments MAY change only through deterministic conflict resolution. The active assigned center MUST influence an uncontrolled leaf's movement during subsequent force steps; while a valid force-control command fixes a leaf, command-owned coordinates temporarily override target attraction without removing its assignment, and assigned-center influence resumes after release.
- **FR-006b**: In every successful terminal force frame, each leaf's authoritative full-precision simulation coordinates MUST equal the center of its unique assigned cell. Transported/rendered tower and leaf-spring coordinates MUST be the direct Float32 representation of that same center, with no independently calculated replacement position. The system MUST NOT apply a post-convergence projection or snap.
- **FR-007**: The final result for identical normalized data and layout settings MUST be reproducible across repeated calculations, even though intermediate frames are displayed live.
- **FR-008**: While intermediate states are displayed, the layout algorithm selector, generator form and submit action, reset-camera button, canvas selection, and existing camera controls MUST remain enabled and responsive. The essential feature journey consists of selecting force mode, generating/rebuilding data, reading calculation/progress/relationship status, and restoring the canonical camera; it MUST be complete through semantic keyboard-reachable controls with visible focus. Canvas object selection and free camera orbit/zoom are non-essential exploratory enhancements; reset-camera is their keyboard-accessible recovery alternative. All listed controls MUST remain usable at the required desktop, 360x800 phone-emulation, and 768x1024 tablet-emulation viewport sizes.
- **FR-009**: Selecting another layout MUST cancel or supersede the active force-directed calculation, remove its intermediate visual elements, and prevent any stale result from replacing the newly selected layout.
- **FR-010**: Reduced-motion preferences MUST be respected by suppressing continuous intermediate animation while still providing status feedback and an inspectable final relationship view.
- **FR-011**: Empty, invalid (including cyclic hierarchy), unsupported, stalled, and otherwise failed calculations MUST preserve the previous valid world. The normalization/layout boundary MUST reject a cycle before creating or mutating a force session. The user-facing message MUST identify the failure category and state that the previous world remains displayed; cyclic-input messages MUST identify the cycle, and unsupported-platform messages MUST identify the missing platform or capability.
- **FR-012**: Rebuilding or replacing the live view MUST remove obsolete visual elements so that no duplicate towers or debug springs remain.
- **FR-013**: This feature MUST NOT expose tower dragging or any other user gesture that mutates simulation state; existing tower selection and camera controls MUST retain their current meaning.
- **FR-014**: After a successful force result commits, the worker MUST enter a retained settled state that preserves the full-precision node, link, and convergence state needed to resume the same simulation. The committed stable world remains authoritative until a future accepted force-control command starts a new provisional interaction epoch. Switching away from force-directed mode, rebuilding data, superseding the request, or page teardown MUST terminate and release the retained session.
- **FR-015**: Applying the first valid fixed-position command in `retained-settled` state MUST start a new interaction epoch, reset the deterministic alpha schedule and convergence streak, and preserve a globally contiguous displayed-step sequence. Further commands MAY apply in `held` or `interaction-cooling` state. Commands during initial calculation or before scene-commit confirmation MUST be rejected. The session MUST NOT converge while any leaf remains fixed by an interaction command. Releasing the final fixed leaf MUST begin a fresh cooling and maximum-step budget for that epoch.

### Quality and Constraint Requirements *(mandatory)*

- **QR-001 - Domain neutrality**: The live calculation MUST operate on valid acyclic hierarchical entities with stable identifiers and explicit relationships; it MUST NOT depend on a particular business domain or impose a fixed hierarchy-depth cap. Public normalization and layout boundaries MUST deterministically reject cyclic parent-child input as invalid under FR-011. Verification includes nested hierarchies through depth 16 as a scale case, not as a product limit.
- **QR-002 - Determinism**: Identical normalized data and layout settings MUST produce identical assignment changes, convergence step, stabilized positions, occupied cells, and debug spring relationships, regardless of whether intermediate states were displayed.
- **QR-003 - Performance and scale**: A displayed entity means one rendered leaf/tower; internal force anchors are excluded. Using force seed `0x5eed003`, the representative fixture contains exactly 1,200 displayed leaves, 300 internal anchors, 19,200 leaf-to-ancestor memberships, 1,499 tree relationships/springs, and maximum depth 16. The maximum fixture contains exactly 4,800 displayed leaves, 1,200 internal anchors, 76,800 memberships, 5,999 relationships/springs, and maximum depth 16. Without reduced motion, initial force step 0 plus calculating status MUST be visible within 1 second for the representative fixture and within 2 seconds for the maximum fixture; with reduced motion, calculating status MUST meet the same limits without an intermediate force state. For the representative normal-motion fixture, active intermediate states MUST be visible at least 5 times per second while unsettled and at least 95% of consecutive displayed-step gaps MUST be no more than 200 ms. Interaction latency MUST use the representative fixture in three separate local Playwright Chromium cohorts: ten desktop-keyboard runs, ten desktop-pointer runs, and ten emulated-phone-touch runs. The nearest-rank p95 action-to-next-painted-frame delay for each cohort MUST independently remain at or below 100 ms. Full force calculation p95 MUST be no more than 2 seconds for the representative fixture and 8 seconds for the maximum fixture; after a maximum-fixture stable commit, median rendered frame time MUST be no more than 33.3 ms. All profile timing executes on the same local desktop host; phone/tablet measurements characterize viewport and input emulation only and MUST NOT be reported as native mobile-device performance.
- **QR-004 - Accessibility and responsive use**: Status changes MUST be available to assistive technology, controls MUST remain keyboard and touch usable from a 360-pixel-wide viewport, and reduced-motion preferences MUST prevent forced continuous movement without hiding the final result or relationship meaning.
- **QR-004a - Local validation profiles**: Verification MUST use the existing Playwright Chromium desktop project at 1024x720, phone project at 360x800 with touch emulation, and tablet project at 768x1024 with touch emulation. Evidence MUST record the run date, detected Chromium and Playwright versions, viewport, device scale factor, mobile-context setting, and touch capability for each profile. Native Android hardware, Android Chrome/OS behavior, ADB/CDP, branded Chrome release certification, and native mobile assistive-technology acceptance are outside scope. Emulated-mobile evidence MUST be labeled as local Chromium viewport/touch emulation rather than native-device evidence.
- **QR-005 - Resilience**: A dropped, malformed, superseded, or failed intermediate state MUST not crash the application, corrupt the current world, or leave visual elements that no longer belong to the active calculation.
- **QR-006 - Interaction extensibility**: The force calculation boundary MUST provide a request-scoped, ordered command seam for future controls that fix or release a leaf position by stable entity ID between force steps. The seam MUST accept commands only in `retained-settled`, `held`, or `interaction-cooling` state; MUST reject initial-running, pre-commit, stale, invalid, non-leaf, failed, cancelled, and disposed-session commands; MUST reject fixed positions whose fractional axial distance exceeds the supported radius of 256; MUST NOT accept pointer, camera, DOM, or rendering objects; and MUST leave no-command behavior and results unchanged.

### Performance Measurement Protocol

- Every timing cohort excludes two warmup runs and contains ten measured runs. Browser timestamps MUST come from the browser clock.
- Startup timing begins immediately before dispatching the user action that selects force-directed mode. Normal-motion startup ends on the first painted frame containing step 0 plus calculating status; reduced-motion startup ends on the first paint containing calculating status and MUST record zero intermediate force frames.
- Full-calculation timing uses the same start event and ends on the first paint after the exact terminal frame has produced the committed stable island. Worker convergence alone does not end this measurement.
- Cadence includes every unsettled painted step after step 0 through the terminal frame. Gaps are differences between consecutive logical-paint timestamps; no frame may be omitted from the trace.
- The keyboard cohort focuses the reset-camera button and activates it with `Enter`; the pointer cohort clicks that button; the Playwright phone-profile touch cohort taps it through the touchscreen API. Action latency starts at the corresponding trusted input event and ends at the next painted application frame while the representative force calculation remains active.
- Maximum-fixture post-commit frame time is measured over 300 consecutive `requestAnimationFrame` intervals after discarding the first post-commit interval; the median of those 300 intervals MUST be no more than 33.3 ms.
- The blocking local-profile matrix is: normal/reduced startup at representative and maximum fixtures on desktop, emulated phone, and emulated tablet; normal-motion full-calculation at representative and maximum fixtures on all three profiles; normal-motion cadence at the representative fixture on all three profiles; maximum-fixture post-commit frame time on all three profiles; desktop keyboard and pointer latency at the representative fixture; and emulated-phone touch latency at the representative fixture. Maximum-fixture cadence, representative-fixture post-commit frame time, tablet input latency, and reduced-motion full/cadence/frame metrics are not separate measurements because reduced motion uses the same calculation kernel and only changes presentation. All three profiles run in local Playwright Chromium and establish no native-device performance claim.

### Key Entities *(include if feature involves data)*

- **Live Calculation Session**: The active force-directed calculation, identified by its input and selection context, that can be superseded or completed.
- **Intermediate Layout State**: A time-ordered snapshot of entity and virtual-anchor positions plus the relationships used to draw the current diagnostic view.
- **Debug Spring**: A visual representation of one active relationship, whose endpoints follow the corresponding entities or anchors in the same intermediate state.
- **Stable Layout Result**: The completed, reproducible arrangement that becomes the authoritative result after the live calculation settles.
- **Calculation Status**: The user-facing state describing whether the calculation is starting, active, complete, cancelled, or failed.
- **Calculation Progress**: The current completed-step count, deterministic convergence streak, required streak, maximum step count, and terminal reason shown for the active session.
- **Force Control Command**: A future-facing, request-scoped calculation command with a monotonic sequence, stable leaf entity ID, and either fixed simulation-plane coordinates or a release action; no current user gesture creates one.
- **Retained Settled Session**: The converged worker-owned full-precision force state preserved after the stable result commits so a future force-control command can resume the same simulation without reconstructing it from quantized final cells.
- **Interaction Epoch**: A deterministic reheat-and-cool interval created by accepted force-control commands, with its own epoch step, convergence streak, and post-release maximum-step budget while preserving the session's global displayed-step numbering.
- **Assigned Hex Target**: The unique integer cell currently owned by a leaf during force evolution; its center influences movement, assignment changes are deterministic, and its center equals the leaf's actual coordinates at successful convergence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of measured normal-motion and reduced-motion startup runs, the applicable 1,200-entity or 4,800-entity startup budget in QR-003 passes; reduced-motion evidence additionally records zero presented intermediate force states.
- **SC-002**: The representative 1,200-entity normal-motion trace passes both QR-003 cadence measures and contains no missing, duplicate, reordered, or coalesced global step.
- **SC-003**: In every captured frame from each of ten runs of the representative deterministic moving-conflict trace, every displayed debug spring connects the current positions of its designated endpoints, with exactly one spring per active relationship and no stale or duplicated spring after the update.
- **SC-004**: A ten-run trace comparison with identical normalized data and settings passes every deterministic field listed in QR-002.
- **SC-005**: Each QR-003 interaction cohort independently passes its nearest-rank p95 budget while every FR-008 control remains enabled and responsive; desktop evidence uses the configured 1024x720 Playwright Chromium project. The phone project uses a configured 360x800 viewport with touch emulation and records `window.innerWidth === 360` plus `visualViewport.width` within one CSS pixel of 360. This is local responsive/touch evidence, not native-phone acceptance.
- **SC-006**: In 100% of layout switches during an active calculation, the cancelled session produces no later visible update and the selected replacement layout is the only committed result.
- **SC-007**: In 100% of automated reduced-motion checks across the Playwright Chromium desktop, emulated-phone, and emulated-tablet profiles, no intermediate force-step motion is presented, start and terminal status remain available through browser semantics/accessibility-tree inspection, one visible final spring remains for every active relationship, test diagnostics expose those spring endpoints, and the final result equals the result produced from identical inputs without motion suppression. Native mobile screen-reader behavior remains outside scope.
- **SC-008**: In 100% of automated desktop, phone-emulation, and tablet-emulation checks, visible explanatory text identifies moving lines as force relationships influencing layout and terminal status explicitly identifies that calculation has settled at the final displayed step. This is a semantic-clarity proxy, not a user-comprehension study.
- **SC-009**: In 100% of tested normal-motion calculations, displayed step numbers are contiguous from the initial state through the terminal force state and each number corresponds to exactly one displayed force state. In every presentation mode, completion status reports the step at which convergence or the maximum was reached.
- **SC-010**: Automated contract checks confirm that valid force-control commands are applied only to their committed retained or interaction-epoch request and only between force steps, that initial-running/pre-commit/out-of-radius commands are rejected without mutation, that a retained session resumes from its preserved full-precision state, and that calculations receiving no commands retain identical step traces and final results.
- **SC-011**: In 100% of tested mode switches, rebuilds, superseding requests, and teardown paths, the retained force worker, listeners, command state, and full-precision simulation resources are released exactly once and late commands cannot affect the replacement world.
- **SC-012**: Automated interaction-epoch contract checks confirm that fixing a leaf resets alpha and convergence, prevents convergence while held, updates neighboring simulation nodes, and that releasing the final fixed leaf begins a deterministic cooling budget whose accepted command transcript reproduces the same epoch trace and terminal result.
- **SC-013**: In 100% of successful terminal force frames, every leaf's full-precision simulation position equals its assigned cell center, every transported/rendered tower and leaf spring source equals `Math.fround` of that same center, and no subsequent scene state independently changes those positions before a new request or future force-control command.

## Assumptions

- The existing force-directed mode, virtual anchors, debug springs, unique-cell ownership, and exact-center terminal constraint remain the baseline; legacy post-calculation placement does not apply to force mode.
- The phrase "debug strings" refers to the existing debug spring relationship lines.
- A live frame is an intermediate state produced by the calculation; the feature does not require recording, replaying, or persisting every frame.
- Default force parameters remain unchanged, but stabilization uses deterministic early-convergence thresholds plus a fixed maximum step count; user editing of force strength, spring length, damping, thresholds, or related parameters is out of scope.
- Tower drag gestures, pointer-to-world projection, camera/gesture arbitration, drag previews, and accessible manipulation controls remain outside this feature; only the generic force-control and deterministic interaction-epoch calculation seam is included.
- Unique hex-cell assignment and attraction to assigned centers are part of the force evolution itself; final cell positions are not produced by a post-calculation assignment or rendering-only transformation.
- The final stabilized layout remains the authoritative world state and must be deterministic even when intermediate states are displayed.
- External participant studies and native-device validation are outside this feature's executable acceptance scope; semantic clarity is validated through visible copy and browser semantics under SC-008.
- The safety guard allows 60 seconds of visible active calculation time; hidden intervals do not consume that budget. The 256-step deterministic cooling limit and FR-011 fallback behavior remain authoritative, and QR-003 explicitly defines every scale and timing target used by this feature.
