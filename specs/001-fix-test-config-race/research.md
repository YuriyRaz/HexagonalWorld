# Research: Fix Test Config Race Condition

**Date**: 2026-07-22

## Problem Analysis

The test at `tests/app.spec.js:286` iterates over 14 failure scenarios. Each scenario:
1. Switches selector to `'packed'` (establishes known previous world)
2. Calls `configureNextRequest()` with failure config
3. Selects `'force-anchors'` (triggers `rebuildIsland()`)
4. Expects `lastErrorCode` to match

### Root Cause: Config Not Consumed

When step 3 calls `selectOption('force-anchors')` and the selector is **already** on `force-anchors` (from the previous scenario's error state), the browser does not fire a `change` event. `rebuildIsland()` is never called. The `nextConfig` sits unconsumed. `lastErrorCode` stays at its previous value.

### Why It Passes 7 Then Fails

The first 7 scenarios work because each ends with the selector on `force-anchors`. The next scenario's `selectOption('packed')` triggers a rebuild (value changes), which clears any stale config. Then `configureNextRequest()` sets the new config, and `selectOption('force-anchors')` triggers another rebuild (value changes again). Two rebuilds per scenario.

By scenario 8, accumulated `page.evaluate` round-trip overhead (~10-13s per scenario) exceeds the 120s timeout.

### Two Fixes Needed

1. **Force rebuild mechanism**: When the selector is already on the target value, the test must still trigger `rebuildIsland()`.
2. **Reduce overhead**: Minimize `page.evaluate` round-trips per scenario to stay within timeout.

## Fix Approach: Test API `forceRebuild()` + Consolidated State

### Decision: Add `window.__hexWorldTest.forceRebuild()` to the app

**Rationale**: The cleanest fix is to expose a `forceRebuild()` method on the test API that calls `rebuildIsland()` directly, bypassing the `<select>` change event. This:
- Does not change production behavior (test API only)
- Makes the test's intent explicit (force a rebuild, not "change the selector")
- Eliminates the race condition entirely (no reliance on change events)

### Alternative: Have test always toggle selector away then back

**Rejected because**: This adds an extra rebuild per scenario (the "toggle away" rebuild), increasing overhead and making the test slower — counter to the timeout fix.

### Alternative: Expose `rebuildIsland()` directly on test API

**Rejected because**: `rebuildIsland` is an `async function` with side effects. Wrapping it in a named `forceRebuild()` method provides a cleaner API boundary and avoids exposing internal function names.

## Reduced Overhead Strategy

### Decision: Consolidate `page.evaluate` calls

Current per-scenario overhead:
- `configureNextRequest()`: 1 round-trip
- `getState()` (previous): 1 round-trip
- `waitForActiveMode()`: 3-5 round-trips (polling)
- `expect.poll(lastErrorCode)`: 5-10 round-trips
- `getState()` (verify): 1 round-trip

**Fix**: After `forceRebuild()`, poll `lastErrorCode` directly in a single `page.evaluate` (already done by `expect.poll`). The key savings come from:
1. Eliminating `waitForActiveMode()` after the packed rebuild (use `forceRebuild()` instead of selector toggle)
2. Using `expect.poll` with a single `page.evaluate` call (already the case)

### Alternative: Batch all state into one `page.evaluate`

**Rejected because**: The `expect.poll` mechanism already calls `page.evaluate` efficiently. The real overhead is the number of polling iterations, not the round-trip count. The fix should focus on making the rebuild trigger deterministic, not on batching.

## Implementation Plan

### Changes to `src/main.js`

1. Add `forceRebuild` to `window.__hexWorldTest` test API:
   ```js
   window.__hexWorldTest.forceRebuild = () => rebuildIsland();
   ```

### Changes to `tests/app.spec.js`

1. Add `forceRebuild()` helper:
   ```js
   async function forceRebuild(page) {
     await page.evaluate(() => window.__hexWorldTest.forceRebuild());
   }
   ```

2. In the failure scenario loop, replace the selector-based rebuild trigger with `forceRebuild()`:
   - After `configureNextRequest()`, call `forceRebuild()` instead of `selector.selectOption(FORCE_MODE)`
   - Keep the `selectOption('packed')` for establishing the previous world (this is a value change, so it works)

3. Optionally reduce `waitForActiveMode()` polling overhead by checking state less frequently.

## Validation

Run `npm run test:e2e -- --grep "announces failures"` and verify:
- All 14 scenarios pass
- Total time under 120 seconds
- No flakiness across 3 consecutive runs
