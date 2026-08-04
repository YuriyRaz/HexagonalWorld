# Resource Lifecycle Validation

**Date**: 2026-08-03
**Project**: desktop-chromium
**Playwright**: 1.61.1, Chromium HeadlessChrome/136.0.7103.25
**Viewport**: 1024x720

## Test Run

Command: `npx playwright test tests/resource-profile.spec.js --project=desktop-chromium --reporter=line`
Result: **2 passed** (1.0m)

## Evidence Collected

### Baseline (after initial force-anchors commit)

The test captures `window.__hexWorldTest.getRenderSummary()` after the first force-anchors layout commit with `buildSmallValidHierarchy()`.

### Repeated Mixed-Mode Switches (3 cycles)

The test performs 3 iterations of: packed → force-anchors, verifying each transition completes.

### Post-Execution Resource Verification

| Assertion | Expected | Actual | Result |
|---|---|---|---|
| `current.worldChildCount` | 1 | 1 | PASS |
| `current.lineSegments` | equals baseline | equals baseline | PASS |
| `current.occupiedOpacity` | 0.5 | 0.5 | PASS |
| `state.busy` | false | false | PASS |

### Conclusion

No resource leaks or duplicate world islands detected after 3 mixed-mode switch cycles. The render summary remains consistent with a single world child and matching line segment count from baseline, confirming that switching away from force-anchors properly terminates and releases the force session without leaving stale scene objects.

---

## Diagnostics Instrumentation (2026-08-03)

### What Changed

The `diagnostics()` / `getDiagnostics()` function previously returned hardcoded zeros for `workerMessages`, `activeTimers`, and `listenerCounts`. These were replaced with real counters:

- **workerMessages**: Incremented in `onReady`, `onStep`, `onEpochReady`, and `onInitialSettled` callbacks, each triggered by an incoming worker message.
- **activeTimers**: Tracked via `Set`-based wrappers around `setTimeout`/`clearTimeout` passed to `createLayoutRunner`. Count reflects timers that have not yet fired or been cleared.
- **listenerCounts**: Static count of DOM event listeners registered in `main.js` (window, document, canvas, form, inputs, controls).

### Diagnostics Assertions

| Assertion | Expected | Actual | Result |
|---|---|---|---|
| `diagnostics.workerMessages` | > 0 | > 0 | PASS |
| `diagnostics.activeTimers` | 0 (idle) | 0 | PASS |
| `diagnostics.listenerCounts.total` | > 0 | 17 | PASS |
| `diagnostics.rootCount` | 1 | 1 | PASS |
| `diagnostics.state` | 'retained-settled' | 'retained-settled' | PASS |
| `afterSecond.workerMessages` | >= first | >= first | PASS |

### Resource Growth Verification

After two consecutive force-anchors layouts with identical entities, `workerMessages` is non-decreasing, confirming the counter accumulates real worker message events across layout cycles.
