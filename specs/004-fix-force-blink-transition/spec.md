# Feature Specification: Fix Force-Directed Blink Transition

**Feature Branch**: `004-fix-force-blink-transition`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "force directed mode shows the live graph for a few seconds but then it's blinking and user see static but almost different picture"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seamless Transition from Live to Final View (Priority: P1)

When the force-directed simulation finishes, the transition from the live animated view to the stable final view should be visually seamless. The user should not see a blink, flicker, or any abrupt change in the displayed arrangement. The final positions must exactly match the last animated positions.

**Why this priority**: The current blinking transition breaks user trust in the visualization and makes the final result appear incorrect or corrupted. A seamless transition is essential for the force-directed mode to be usable.

**Independent Test**: Select force-directed mode, wait for the simulation to stabilize, and verify that no visual blink or position shift occurs during the transition from live to final view.

**Acceptance Scenarios**:

1. **Given** force-directed mode is active and the simulation is animating, **When** the simulation converges and the final frame is displayed, **Then** the transition to the stable committed view occurs without any visible blink, flicker, or position shift; the last animated frame and the first stable frame are visually indistinguishable.
2. **Given** the simulation has converged and the final frame is applied to the live island, **When** the stable island is committed, **Then** the tower positions, spring endpoints, translucency, and camera view remain identical to the last animated frame.
3. **Given** the user has reduced-motion preferences enabled, **When** the final-only mode completes and the stable island is committed, **Then** the transition occurs without any visual discontinuity.

---

### User Story 2 - Consistent Visual Appearance Between Live and Final (Priority: P2)

The live animated view and the stable final view should render towers with identical visual properties (opacity, color, height, depth) so that the user perceives the same scene before and after the transition.

**Why this priority**: Even without a blink, if the live and final views render towers differently (e.g., different opacity or missing visual layers), the user will perceive the final result as "almost different" from what they watched animate.

**Independent Test**: Capture a frame during animation and a frame after commitment with identical simulation positions; compare the visual properties of each tower across both frames.

**Acceptance Scenarios**:

1. **Given** a force-directed simulation is animating, **When** a specific tower position is captured mid-animation, **Then** the same tower at the same position in the stable committed view has identical color, opacity, height, and depth.
2. **Given** a force-directed simulation has converged, **When** the stable island is created from the terminal frame, **Then** every tower's rendered appearance matches its appearance in the last live frame with no change in translucency, shadow, or color.

---

### User Story 3 - Stable Camera Across Transition (Priority: P3)

The camera position and orientation should remain stable during the transition from the live view to the final view. No unexpected camera movement should occur when the simulation finishes.

**Why this priority**: Camera jumps during the transition compound the perception that the result is "different" and can disorient the user.

**Independent Test**: Record camera position before and after the transition; verify no movement occurs.

**Acceptance Scenarios**:

1. **Given** the force-directed simulation is animating and the user has not moved the camera, **When** the simulation converges and the stable island is committed, **Then** the camera position, target, and zoom level remain unchanged.
2. **Given** the user has adjusted the camera during the simulation, **When** the stable island is committed, **Then** the user's camera adjustment is preserved without any reset or jump.

---

### Edge Cases

- What happens when the simulation converges very quickly (within a few steps) and the live view barely animates before transitioning?
- What happens when the user switches layouts during the exact frame when the simulation is transitioning from live to final?
- What happens when `prefers-reduced-motion` is enabled and the simulation runs in `final-only` mode?
- There is no convergence-lock step; the transition is triggered manually via a debug button. The last `onStep` frame is the terminal frame.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The force-directed simulation MUST NOT automatically stop or commit to a static/stable island when convergence is reached. The calculation must run continuously unless manually cancelled or superseded.
- **FR-002**: The UI MUST display real-time convergence status (e.g., "Calculating" or "Converged") and streak closeness to convergence.
- **FR-003**: The UI MUST show the number of steps passed to achieve convergence (if it has converged).
- **FR-004**: The camera position, target, and zoom MUST remain fully interactive during the entire continuous simulation without resetting.
- **FR-005**: No transition to a legacy layout presentation (with opaque towers and shadows) or disposal/recreation of Three.js objects shall occur; the simulation remains in the force layout visualization mode.
- **FR-006**: When `prefers-reduced-motion` is enabled, the layout worker MUST still calculate and animate continuously rather than outputting a single static frame.
- **FR-007**: If a layout change or rebuild is requested, the continuous layout calculation MUST be cancelled cleanly.
- **FR-008**: The simulation lifecycle MUST NOT leave orphaned Three.js objects or leak GPU memory.

### Quality and Constraint Requirements *(mandatory)*

- **QR-001 - Domain neutrality**: The fix MUST operate at the rendering and orchestration layer without introducing domain-specific assumptions about the hierarchy or data model.
- **QR-002 - Determinism**: The final committed positions MUST remain identical to the converged simulation positions; the fix MUST NOT alter the simulation logic, convergence criteria, or final placement.
- **QR-003 - Performance and scale**: The transition MUST complete within a single frame budget (≤ 16.7 ms at 60 fps) for the representative 1,200-entity fixture. The fix MUST NOT introduce per-frame allocation or new GPU resource creation during the transition.
- **QR-004 - Accessibility and responsive use**: The transition MUST be transparent to assistive technology; status messages MUST continue to reflect the correct calculation state before, during, and after the transition.
- **QR-005 - Resilience**: A failed or interrupted transition MUST preserve the last valid world state and report an error status without crashing the application.

### Key Entities

- **Live Force Island**: The Three.js scene group containing translucent hexagonal towers and spring line segments, updated incrementally by simulation frames.
- **Stable Force Island**: The state of the force island after promotion — the same Three.js scene group and mesh instances as the live island, with animation stopped and the stable flag set.
- **Transition Frame**: The single render frame in which the live island is replaced by or promoted to the stable island without visual discontinuity.
- **Retired Flag (`retired`)**: A boolean set to `true` on the live island handle during promotion. A retired handle rejects further `applyStep()` calls and future `promote()` calls. The handle remains in the scene and retains its meshes; it is only disposed when a layout switch or rebuild replaces it. This flag distinguishes a promoted-stable handle from one that was created stable initially.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of tested force-directed simulations, the calculation continues to execute steps and animate without automatic stoppage, freeze, or transition to another island.
- **SC-002**: The UI displays the convergence status, streak count, and the exact step number when convergence occurs, and updates dynamically.
- **SC-003**: The camera remains fully interactive during the entire continuous layout run, and no camera jumps or resets occur.
- **SC-004**: No GPU resource leaks (geometries, materials, textures) are introduced over long-running continuous calculations, as verified by resource counts.
- **SC-005**: The calculated layout coordinates remain completely deterministic and repeatable for the same input and layout configuration.

## Assumptions

- The existing force-directed simulation logic, convergence criteria, and final placement algorithm are correct and unchanged by this fix.
- The issue is isolated to the rendering transition layer and does not involve the simulation worker or frame delivery protocol.
- The live island and stable island currently use the same `createForceIsland` function with different stability flags; the visual difference perceived by the user is caused by the transition discontinuity, not by fundamentally different rendering.
- The `fitWorldView` call after the transition is suppressed during commit; no camera adjustment occurs at transition time.
- The `paintReceipt` mechanism via `requestAnimationFrame` is correct and does not introduce frame delays that cause the blink; the blink is caused by the scene object replacement.
- Reduced-motion behavior and `final-only` mode are not the primary affected paths but MUST remain seamless after the fix.

## Clarifications

### Session 2026-08-04

- Q: What happens when terminal frame positions differ from last onStep frame (convergence-lock step)? → A: No convergence-lock step; transition is triggered manually by a debug button; last onStep frame is the terminal frame.
- Q: Should the fix reuse live mesh instances (promote in-place) or create new stable meshes and swap atomically? → A: Promote live meshes in-place; no new objects created during transition.
- Q: Should fitWorldView be suppressed during the commit transition? → A: Yes, suppress fitWorldView entirely during commit; the camera must not move.

### Session 2026-08-05

- Q: Should the simulation stop on convergence and promote to a stable island? → A: No, remove the promotion/commit behavior entirely. The calculation should not be forced to stop, and the UI should only display the convergence status, streak closeness, and the step count to converge.
