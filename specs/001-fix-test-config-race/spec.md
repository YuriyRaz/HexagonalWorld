# Feature Specification: Fix Test Config Race Condition

**Feature Branch**: `001-fix-test-config-race`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Fix the test config consumption race condition in rebuildIsland() that causes the failure scenario test to time out after ~7 iterations"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Failure Scenario Test Passes Reliably (Priority: P1)

The automated test suite iterates over 14 failure scenarios, each configuring a failure config and expecting the system to announce the error code. The test must complete all 14 scenarios within the timeout without race conditions between config setup and rebuild triggers.

**Why this priority**: The test is currently broken — it passes 7 scenarios then times out. This blocks CI and makes it impossible to verify that failure handling works correctly across all scenarios.

**Independent Test**: Run the full test suite and verify the failure scenario test completes all 14 scenarios without timing out.

**Acceptance Scenarios**:

1. **Given** the test is set up with a failure config, **When** the algorithm selector is changed to trigger a rebuild, **Then** the failure config is consumed by that rebuild and the error code appears in application state.
2. **Given** the test selector is already on the target value (force-anchors), **When** a failure config is configured and a rebuild is needed, **Then** the rebuild is triggered regardless of whether the selector value changed.
3. **Given** 14 failure scenarios are run sequentially, **When** each scenario sets up its config and triggers a rebuild, **Then** each scenario's failure config is consumed by its own rebuild (not a previous or subsequent one).

---

### Edge Cases

- What happens when the selector is already on the target value before a rebuild is triggered?
- How does the system handle rapid sequential config changes without intervening rebuilds?
- What happens when a rebuild completes and clears state before the next scenario's config is set?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST ensure that each rebuild triggered by a user action consumes only the config that was set for that specific rebuild.
- **FR-002**: System MUST provide a way to trigger a rebuild even when the selector value has not changed (force rebuild).
- **FR-003**: System MUST NOT clear test config as a side effect of rebuilds triggered by unrelated actions.
- **FR-004**: Test infrastructure MUST ensure config is set before the rebuild trigger fires, preventing config from being consumed by a stale rebuild.

### Quality and Constraint Requirements *(mandatory)*

- **QR-001 - Determinism**: Given the same sequence of config setup and rebuild triggers, the system MUST produce the same error codes and state transitions every time.
- **QR-002 - Performance and scale**: The test suite with 14 failure scenarios MUST complete within 120 seconds total.
- **QR-003 - Resilience**: The system MUST handle config being set while a rebuild is already in progress without losing the config or producing incorrect error codes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The failure scenario test completes all 14 scenarios within 120 seconds.
- **SC-002**: Each failure scenario produces the expected error code in application state.
- **SC-003**: No test scenario fails due to config being consumed by a stale rebuild.
- **SC-004**: The full test suite passes consistently across multiple consecutive runs (no flakiness).

## Assumptions

- The existing test infrastructure overhead is acceptable and does not need to be restructured.
- The fix should be minimal and targeted — either in the test helper (e.g., forcing a rebuild after config setup) or in the application code (e.g., not clearing config on unrelated rebuilds).
- The selector value not firing a change event when set to the same value is expected browser behavior and should not be changed.
- Both application code and test code are in scope for this fix.
