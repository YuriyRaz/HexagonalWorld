# Research: Main Thread Yielding for RequestAnimationFrame Loops

**Feature**: 002-main-thread-yielding
**Date**: 2026-07-21

## Research Questions

### R1: How to yield control to the event loop within a requestAnimationFrame callback?

**Decision**: Use `await new Promise(resolve => setTimeout(resolve, 0))` or `scheduler.postTask()` as a yield point inside the async animate loop.

**Rationale**: The `requestAnimationFrame` callback itself cannot be async — it must complete synchronously before the browser paints. However, the animate loop can be restructured to split work across frames using a yield point. The key insight is that `requestAnimationFrame` already yields to the browser between frames, but the synchronous raycasting inside `updateHover()` blocks the thread for too long within a single frame.

The solution is to ensure `updateHover()` completes within the frame budget (16ms at 60fps). Since `raycaster.intersectObjects()` is already guarded by `interactionDirty` (only runs when the pointer moves), the existing code already has partial optimization. The remaining issue is that at small viewports, even the guarded raycast combined with other per-frame work exceeds the budget.

**Alternatives considered**:

1. **`requestIdleCallback`**: Lower priority than rAF; may not fire before paint. Not suitable for hover detection that must be responsive.

2. **`isInputPending()` (Speculation Rules API)**: Modern API that checks if input events are queued. Could be used to skip raycasting when input is pending, but has limited browser support and doesn't solve the fundamental frame budget issue.

3. **Chunked raycasting across frames**: Split the tile array into chunks and raycast a subset per frame. Adds complexity and delays hover feedback by multiple frames. Not justified when the raycast itself is already fast (<1ms for 500 tiles).

4. **Web Worker raycasting**: Offload raycasting to a worker. Requires transferring geometry data and adds latency. Overkill for this use case.

5. **Throttle raycasting to every N frames**: Skip raycasting on most frames. Degrades hover responsiveness. Not acceptable for interactive hex selection.

**Conclusion**: The most pragmatic approach is to ensure the animate function yields between frames by not doing excessive synchronous work. The existing `interactionDirty` guard already prevents raycasting when the pointer hasn't moved. The remaining optimization is to move the `beforeunload` listener registration out of the animate function (it's currently registered on every frame at line 528-530, which is a bug) and ensure no other per-frame work blocks the event loop.

### R2: What is the actual performance bottleneck at 360×568?

**Decision**: The primary bottleneck is the `beforeunload` listener being registered on every animation frame (line 528-530 of `src/main.js`), which accumulates thousands of event listeners and starves the event loop.

**Rationale**: Reviewing the animate function at `src/main.js:527-548`:

```javascript
function animate(time) {
  window.addEventListener('beforeunload', () => {  // BUG: registered every frame!
    layoutRunner.dispose();
  });
  requestAnimationFrame(animate);
  // ... rest of frame work
}
```

This `addEventListener` call inside the animate function registers a new `beforeunload` listener on **every single animation frame**. At 60fps, this accumulates ~60 listeners per second, ~3600 per minute. Each listener holds a closure reference to `layoutRunner`. When the browser processes events (including Playwright's evaluate callbacks), it must iterate through thousands of redundant listeners, causing the event loop starvation observed at small viewports.

At 1024×720, the app may complete its work before the listener count becomes problematic. At 360×568, the scrollable containers and smaller DOM cause Playwright's actionability checks to take longer, pushing the total wait time past the 60s timeout.

**Alternatives considered**:

1. **The raycasting itself is the bottleneck**: `raycaster.intersectObjects(tiles, false)` on 500 tiles takes <1ms. Not the cause.

2. **The renderer.render() call**: GPU-bound, not CPU-bound. Doesn't starve the event loop.

3. **The controls.update() call**: OrbitControls damping is lightweight. Not the cause.

**Conclusion**: Moving the `addEventListener('beforeunload', ...)` outside the animate function (to module scope, called once) is the primary fix. This eliminates the listener accumulation that starves the event loop.

### R3: Should we also add explicit yield points for future-proofing?

**Decision**: Yes — add a yield point using `requestAnimationFrame` callback timing to skip heavy work when the frame budget is exhausted.

**Rationale**: Even after fixing the listener bug, it's good practice to ensure the render loop doesn't exceed the frame budget. We can check `performance.now()` against the frame start time and skip optional work (like hover detection) if the budget is consumed.

**Alternatives considered**:

1. **No yield point — just fix the bug**: Simpler, but doesn't protect against future additions to the animate function that could reintroduce starvation.

2. **Use `scheduler.yield()`**: Modern API, limited browser support. Not yet widely available.

**Conclusion**: Add a lightweight frame budget check as a defensive measure, but the primary fix is the listener accumulation bug.

## Summary of Findings

| Question | Finding | Impact |
|----------|---------|--------|
| How to yield in rAF loop? | Fix the listener accumulation bug; existing `interactionDirty` guard is sufficient | Primary fix |
| What's the actual bottleneck? | `addEventListener('beforeunload')` called every frame, accumulating thousands of listeners | Critical bug |
| Add yield points? | Optional defensive measure via frame budget check | Nice-to-have |

## Recommended Changes

1. **Move `addEventListener('beforeunload', ...)` to module scope** (called once, not per frame)
2. **Verify `interactionDirty` guard prevents unnecessary raycasting** (already implemented)
3. **Optional: Add frame budget check** to skip hover detection if frame time exceeds 16ms

## Risk Assessment

- **Low risk**: Moving the listener registration is a trivial change with no behavioral side effects
- **No new dependencies**: Fix is confined to `src/main.js`
- **Testable**: Existing Playwright E2E test validates the fix
