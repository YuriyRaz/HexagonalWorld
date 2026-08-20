# Data Model: Interactive Tower Dragging

## Entities & Interfaces

### 1. `DragSessionState`

Tracks active pointer drag state in the UI/render loop.

| Field | Type | Description |
|-------|------|-------------|
| `active` | `boolean` | Whether a drag operation is currently in progress |
| `entityId` | `string` | Unique model ID of the tower being dragged |
| `pointerId` | `number` | Active pointer ID (mouse or touch pointer) |
| `startScreenPos` | `{ x: number, y: number }` | Initial pointer position on screen |
| `startWorldPos` | `{ x: number, y: number, z: number }` | Initial 3D world position of dragged tower |
| `currentWorldPos` | `{ x: number, y: number, z: number }` | Current projected 3D world position on layout plane |
| `dragPlane` | `THREE.Plane` | Horizontal plane ($Y = \text{baseElevation}$) used for raycast intersection |

### 2. `DragWorkerMessage`

Protocol messages between Main Thread UI and Layout Worker.

#### `DRAG_START`
- **Direction**: Main Thread -> Worker
- **Payload**:
  - `type`: `'DRAG_START'`
  - `id`: `string` (entity ID)
  - `x`: `number` (world X)
  - `z`: `number` (world Z)

#### `DRAG_MOVE`
- **Direction**: Main Thread -> Worker
- **Payload**:
  - `type`: `'DRAG_MOVE'`
  - `id`: `string` (entity ID)
  - `x`: `number` (world X)
  - `z`: `number` (world Z)

#### `DRAG_END`
- **Direction**: Main Thread -> Worker
- **Payload**:
  - `type`: `'DRAG_END'`
  - `id`: `string` (entity ID)
  - `releasePosition`: `{ x: number, z: number }`
  - `unpin`: `boolean` (whether to unpin node physics after drag end)

### 3. `KeyboardNudgeEvent`

Encapsulates accessible keyboard position updates.

| Field | Type | Description |
|-------|------|-------------|
| `entityId` | `string` | Currently selected tower ID |
| `deltaX` | `number` | Incremental horizontal step |
| `deltaZ` | `number` | Incremental vertical/depth step |

## State Transitions

```text
[ Idle / Default ]
       │
       │ (PointerDown on Tower / Key Nudge Start)
       ▼
[ Drag Pending / Threshold Check ]
       │
       │ (Move threshold exceeded)
       ▼
[ Active Drag / Pinned Physics ] ──(PointerMove / Arrow Keys)──> [ Update Position & Re-tick Physics ]
       │
       │ (PointerUp / Blur / Escape Key)
       ▼
[ Drag Complete / Unpin / Settle ]
       │
       ▼
[ Idle / Default ]
```
