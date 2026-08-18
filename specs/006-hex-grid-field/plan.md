# Implementation Plan: Hex Grid Field with Tower Snapping

**Branch**: `006-hex-grid-field` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-hex-grid-field/spec.md`

## Summary

The feature has two goals: (1) render a visible hexagonal grid field beneath all towers, and (2) ensure all towers snap to integer axial hex cells. Both mechanisms already exist in the codebase — the key work is making them consistent and visible.

**Current state**: `island.js:createIsland` renders empty cells as thin, translucent tiles at water level (opacity 0.12, height 0.035). `createForceIsland` renders NO empty cells at all. The snap-to-cell force already exists in `force-layout.js` and deterministic layouts already produce integer axial coordinates.

**Approach**: Extract a shared `createEmptyCellGrid` function used by both `createIsland` and `createForceIsland`. Increase empty cell visibility. Add empty cell grid to force mode. Existing hover highlighting already works for empty cells via `main.js:setTileState`.

## Technical Context

**Language/Version**: JavaScript (ES modules), Node.js 20.19+  
**Primary Dependencies**: Three.js, d3-force (already in project)  
**Storage**: N/A  
**Testing**: Vitest (unit), Playwright (browser)  
**Target Platform**: Desktop browsers with WebGL 2  
**Project Type**: Web application (Three.js visualization)  
**Performance Goals**: 60 fps with 2000 tiles + 500 towers, <2ms grid render overhead  
**Constraints**: Per-frame allocation avoided, GPU resources disposed on rebuild  
**Accessibility/Responsive Scope**: Keyboard navigation preserved, reduced-motion respected  
**Deterministic Inputs/Outputs**: Same data + config = identical grid extent and cell assignments  
**Resource Ownership**: Grid GPU resources owned by island handle, disposed on rebuild  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Domain-neutral model**: Grid is a generic coordinate reference — no domain assumptions. ✅
- **Separation and determinism**: Grid computation uses `hex.js` math, rendering uses Three.js — boundaries explicit. Identical inputs produce same grid. ✅
- **Performance and lifecycle**: 2000-tile scale defined, InstancedMesh batching used, GPU disposal via ownership ledger. ✅
- **Accessibility and resilience**: Empty/invalid states covered (empty scene renders grid), keyboard not affected. ✅
- **Quality and simplicity**: Smallest change: extract shared function, adjust material params, add to force path. ✅

## Project Structure

### Documentation (this feature)

```text
specs/006-hex-grid-field/
├── spec.md
├── plan.md              # This file
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (relevant changes)

```text
src/
├── island.js            # MODIFY: extract createEmptyCellGrid(), adjust visibility, add to force path
├── hex.js               # READ ONLY: reuse axialToPlane, HEX_SIZE
├── main.js              # READ ONLY: hover highlighting already works for empty cells
├── force-layout.js      # READ ONLY: snap force already exists
├── layout.js            # READ ONLY: deterministic layouts already snap
└── layout-runner.js     # READ ONLY: worker orchestration unchanged

tests/
├── island.test.js       # MODIFY: add tests for empty cell grid in both modes
└── hex.test.js          # READ ONLY
```

**Structure Decision**: Single flat `src/` project. Changes are confined to `island.js` (rendering) with no new files needed.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | All constitution principles satisfied | N/A |

## Design

### Shared `createEmptyCellGrid` Function

Extract the existing empty cell rendering logic from `createIsland` (lines 567-620) into a reusable function that both `createIsland` and `createForceIsland` call.

**Signature**:
```javascript
function createEmptyCellGrid(ownership, gridRadius, occupiedCells)
// Returns: { mesh, instances, baseColors }
```

**Logic**:
1. Iterate `q` from `-gridRadius` to `+gridRadius`, `r` from `max(-gridRadius, -q-gridRadius)` to `min(gridRadius, -q+gridRadius)` — same loop as current `island.js:568-574`
2. Skip cells in `occupiedCells` Set
3. Create `InstancedMesh` with adjusted material (see visibility changes)
4. Position each tile at `(x, WATER_LEVEL + 0.015, z)` using `axialToPlane`
5. Return mesh + instance metadata for hover integration

### Visibility Changes (FR-003, FR-006)

Current empty cell material:
- `opacity: 0.12` — too subtle
- `height: 0.035` — nearly invisible
- `color: 0xffffff` with `MeshBasicMaterial`

Updated empty cell material:
- `opacity: 0.18` — slightly more visible while staying subtle
- `height: 0.05` — still flat but more perceptible  
- `color: 0x4fa98c` — teal tint matching existing palette, consistent with water theme
- Keep `MeshBasicMaterial` (no lighting needed for reference grid)
- Keep `depthWrite: false` (prevent z-fighting with water)

### Force Mode Integration (FR-007)

In `createForceIsland`, after rendering occupied tiles:
1. Compute `gridRadius` from placements (max hex distance from origin)
2. Build `occupiedCells` Set from placement coordinates
3. Call `createEmptyCellGrid(ownership, gridRadius, occupiedCells)`
4. Add returned mesh to `root` group
5. Include returned instances in `interactiveTiles` array for hover

### Viewport-Dependent Grid Extent (FR-002)

The grid must extend to fill the visible viewport area, not just the tower bounding area.

**Implementation approach**:
1. Compute visible ground area from camera frustum intersection with ground plane (y = WATER_LEVEL)
2. Convert visible area bounds to axial coordinates (q, r)
3. Set `gridRadius` to cover the visible axial extent plus buffer
4. Update grid when camera moves (debounced to avoid per-frame rebuilds)
5. Use frustum culling to skip rendering cells outside view

**Performance considerations**:
- Recompute grid extent on camera move (throttled to 10Hz max)
- Use InstancedMesh with dynamic instance count
- Keep geometry/material, only update instance matrices and count
- Limit maximum grid radius (e.g., 100) to prevent excessive memory use

### Hover Highlighting (FR-011)

Existing `main.js:setTileState` already handles empty cell hover:
```javascript
if (object.userData.isEmpty) {
  tileColor.fromArray(object.userData.baseColors, instanceId * 3);
  if (isSelected) tileColor.lerp(selectedColor, 0.78);
  else if (isHovered) tileColor.lerp(hoverColor, 0.58);
  // ...
}
```

No changes needed — the empty cell instances already have `isEmpty: true` in their userData and `baseColors` array. The shared function must preserve this data structure.

### Lifecycle (FR-010)

No new lifecycle management needed. The shared function uses the existing `ownership` ledger — all GPU resources (geometry, material, mesh) are tracked and disposed when the island handle is disposed. This is already the pattern in `createIsland`.

### Performance (QR-003)

- Empty cells use `InstancedMesh` — single draw call for all tiles
- `CylinderGeometry` with 6 segments — lightweight
- No per-frame allocation — positions computed once at layout time
- In force mode, empty cells are static (don't update each frame) — only occupied tiles animate

### Edge Cases

- **Empty scene** (no towers): `gridRadius` defaults to 0, grid shows single center cell. Add minimum default radius (e.g., 3) when no placements exist.
- **Rapid layout switch**: Grid is rebuilt with the island handle — old grid disposed, new one created. No stale tiles.
- **Large datasets**: InstancedMesh handles 2000+ tiles efficiently. Grid radius scales with tower spread.

## Tasks

See `tasks.md` for the dependency-ordered task list generated by `/speckit-tasks`.
