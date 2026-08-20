# Contract: Drag Interaction & Force Worker Communication

## Overview

Defines contract for pointer drag events, Three.js raycast plane intersection, `OrbitControls` toggle, and Worker message handling for drag-based real-time layout recalculations.

## 1. UI Interaction Contract

### Pointer Handlers
- `onPointerDown(event)`:
  - Raycasts from camera against interactive tower objects.
  - If a tower is hit, stores `startScreenPos` and records target `entityId`.
- `onPointerMove(event)`:
  - If `active` is true or drag threshold (>= 4px) is passed:
    - Sets `active = true`.
    - Sets `controls.enabled = false`.
    - Raycasts pointer onto horizontal drag plane $Y = Y_{\text{towerBase}}$.
    - Computes `(newX, newZ)`.
    - Dispatches `DRAG_MOVE` message to layout runner/worker.
- `onPointerUp(event)` / `onPointerCancel(event)`:
  - If `active` is true:
    - Dispatches `DRAG_END` to layout runner/worker.
    - Sets `controls.enabled = true`.
    - Resets `DragSessionState`.

### Keyboard Handlers
- `onKeyDown(event)` when a tower is selected:
  - Keys `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown` (or with `Shift` for larger steps).
  - Calculates updated `(x, z)` position.
  - Triggers `DRAG_MOVE` and immediate physics tick.

## 2. Layout Worker Protocol Extension

### Messages Sent to Worker
```typescript
interface DragStartPayload {
  type: 'DRAG_START';
  id: string;
  x: number;
  z: number;
}

interface DragMovePayload {
  type: 'DRAG_MOVE';
  id: string;
  x: number;
  z: number;
}

interface DragEndPayload {
  type: 'DRAG_END';
  id: string;
  x: number;
  z: number;
  unpin?: boolean;
}
```

### Messages Received from Worker
Worker continues broadcasting existing tick updates (`TICK` / `POSITIONS` array) so render loop updates node positions seamlessly.
