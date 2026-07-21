# Data Model: Render Loop State and Event Loop Interaction

**Feature**: 002-main-thread-yielding
**Date**: 2026-07-21

## Overview

This feature modifies the render loop's interaction with the browser event loop. The "data model" here describes the state transitions and timing contracts of the animate function.

## Render Loop State Machine

### States

| State | Description | Entry Condition | Exit Condition |
|-------|-------------|-----------------|----------------|
| **Idle** | No animation in progress | App startup, after frame completes | `requestAnimationFrame(animate)` scheduled |
| **Frame Active** | Executing per-frame work | `animate(time)` called by browser | Frame work complete, or frame budget exceeded |
| **Yielded** | Event loop available for macrotasks | Frame work yields or completes | Next `requestAnimationFrame` callback |

### Per-Frame Work Sequence

```
1. animate(time) called by browser
2. ├── animateCamera(time)          [~0.1ms]
3. ├── controls.update()            [~0.5ms]
4. ├── updateHover()                [0-2ms, only if interactionDirty]
5. ├── waterRings.forEach(...)      [~0.2ms]
6. ├── particles.rotation.y = ...   [~0.01ms]
7. ├── compassDial.style.transform  [~0.01ms]
8. └── renderer.render(scene, camera) [~5-15ms, GPU-bound]
9. requestAnimationFrame(animate)   [schedules next frame]
10. Frame complete → event loop available
```

### State Transitions (After Fix)

```
┌─────────┐     animate()      ┌──────────────┐
│  Idle   │ ──────────────────→ │ Frame Active │
└─────────┘                     └──────┬───────┘
                                       │
                            ┌──────────┴──────────┐
                            │ work ≤ 16ms?         │
                            │                      │
                       Yes  │                      │  No (budget exceeded)
                            ▼                      ▼
                   ┌────────────┐         ┌────────────┐
                   │  Rendered  │         │  Yielded   │
                   │  (paint)   │         │  (skip     │
                   └────────────┘         │  optional) │
                            │             └─────┬──────┘
                            ▼                   │
                   ┌────────────┐               │
                   │   Idle     │ ◀─────────────┘
                   └────────────┘
```

## Event Loop Starvation Model

### Before Fix

```
Frame N:   [---animate work---][---paint---]
Frame N+1: [---animate work---][---paint---]
Frame N+2: [---animate work---][---paint---]
            ↑
            beforeunload listener added here (every frame!)
            
After 60s: 3600+ listeners accumulated
Playwright evaluate: [waiting...][waiting...][TIMEOUT]
                       ↑ event loop blocked by listener iteration
```

### After Fix

```
Frame N:   [animate work][paint]
Frame N+1: [animate work][paint]
Frame N+2: [animate work][paint]
            ↑
            beforeunload listener registered once at startup
            
Playwright evaluate: [execute] ← event loop available between frames
```

## Key Invariants

1. **Listener Registration**: `addEventListener('beforeunload', ...)` must be called exactly once, at module scope, not inside `animate()`
2. **Frame Budget**: Total per-frame synchronous work must not exceed 16ms (one frame at 60fps)
3. **Dirty Flag**: `interactionDirty` must gate raycasting — no raycast when pointer hasn't moved
4. **Determinism**: For identical `tiles` array and `pointer` position, `updateHover()` must produce identical results regardless of frame timing

## Timing Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| Frame time (360×568, 500 tiles) | ≤30ms | `performance.now()` delta between `animate()` calls |
| Hover detection latency | ≤1 frame (~16ms) | Time from `pointermove` to visual feedback |
| Event loop availability | ≥1 opportunity per frame | Playwright evaluate must execute within 5s |
| Playwright test completion | ≤30s | Test timeout at 360×568 viewport |
