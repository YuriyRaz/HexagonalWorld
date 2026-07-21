# Contract: Render Loop Yielding Behavior

**Feature**: 002-main-thread-yielding
**Date**: 2026-07-21

## Overview

This contract defines the observable behavior of the render loop after the yielding fix. It specifies what external consumers (tests, users, Playwright) can rely on.

## Contract: Event Loop Availability

### Precondition
- App is loaded and initial `rebuildIsland()` has completed
- Render loop is active (`requestAnimationFrame` is scheduling frames)

### Postcondition
- The browser event loop is available for macrotask execution between animation frames
- Playwright `locator.evaluate()` callbacks execute within 5 seconds

### Invariants
1. `addEventListener('beforeunload', ...)` is registered exactly once per page load
2. No more than one `beforeunload` listener exists at any time
3. The animate function does not accumulate state across frames

### Test oracle
```javascript
// Given: render loop is active
// When: Playwright injects evaluate callback
// Then: callback executes within 5000ms
const start = Date.now();
await page.evaluate(() => {
  window.__evalExecutedAt = Date.now();
});
const elapsed = window.__evalExecutedAt - start;
// Assert: elapsed < 5000
```

## Contract: Frame Budget

### Precondition
- App is loaded at any supported viewport size
- Scene contains ≤1000 tiles

### Postcondition
- Each animation frame completes within 30ms (generous budget for low-end devices)
- No single synchronous operation exceeds 16ms

### Invariants
1. `updateHover()` completes in ≤2ms for ≤1000 tiles
2. `renderer.render()` completes in ≤20ms (GPU-bound, varies by hardware)
3. Total frame work (excluding paint) completes in ≤30ms

### Test oracle
```javascript
// Given: render loop is active
// When: 100 frames are measured
// Then: average frame time ≤25ms, no frame exceeds 50ms
```

## Contract: Hover Detection Responsiveness

### Precondition
- App is loaded, scene is rendered
- Pointer is over a tile

### Postcondition
- Visual hover feedback appears within 2 frames (~33ms at 60fps)

### Invariants
1. `interactionDirty` is set to `true` on `pointermove`
2. `updateHover()` is called on every frame where `interactionDirty === true`
3. `interactionDirty` is set to `false` at the start of `updateHover()`

### Test oracle
```javascript
// Given: pointer is not over any tile
// When: pointer moves over a tile
// Then: tile color changes within 2 frames
```

## Contract: Layout Rebuild Non-Blocking

### Precondition
- App is loaded
- User triggers a layout rebuild (algorithm select change)

### Postcondition
- `#layout-status` text updates to "Вычисляем..." within 1 second
- `#layout-status` text updates to "Успешно завершено." within 5 seconds
- All controls remain reachable (clickable, not obscured) during rebuild

### Invariants
1. `isBusy` is set to `true` when rebuild starts
2. `isBusy` is set to `false` when rebuild completes (success or failure)
3. Render loop continues running during rebuild (no frame drops)

### Test oracle
```javascript
// Given: user selects force-anchors algorithm
// When: rebuild starts
// Then: #layout-status contains "Вычисляем..." within 1s
// And: all controls are reachable within 30s total
```
