# Island Rendering Contract

## Creation

```js
createIsland({
  visualPayloadByEntityId,
  layoutResult,
  presentation
}) -> IslandHandle
```

The factory consumes an already-computed layout and has no source-domain or algorithm implementation knowledge.

## Inputs

`visualPayloadByEntityId` maps every placed leaf ID to generic visual data:

```js
{
  entityId,
  title,
  metadataText,
  heightValue,
  colorGroupId,
  colorGroupOrder,
  colorVariantOrder
}
```

Source-domain values are converted by the source adapter before this boundary. Rendering does not inspect domain type names, source-specific IDs, or hierarchy parentage.

`layoutResult` follows [layout-contract.md](./layout-contract.md).

`presentation`:

```js
{
  occupiedOpacity: 0.5,
  showSprings: true
}
```

Validation before allocation:

- Every placement has one visual payload and no payload is joined twice.
- Placement cells are unique integer axial coordinates and `layoutResult.gridRadius` is an integer no greater than 256.
- `springs.length` is zero when `showSprings` is false. For the force mode, the supplied array exactly matches the validated immediate-parent anchor relations; rendering creates one segment per relation and accepts an empty array only when that expected relation set is empty.
- Force-mode `springs.length` is no greater than 5,999.
- All spring endpoints are finite.

## IslandHandle

```js
{
  root,
  interactiveTiles,
  water,
  waterRings,
  worldSize,
  stats,
  dispose()
}
```

Rules:

- `root` is built detached and committed transactionally.
- `interactiveTiles` contains occupied and empty tile meshes only.
- `stats` preserves the generic depth-indexed layout summary; UI adapters choose localized labels.
- `dispose()` releases every handle-owned geometry, material, buffer, object, and listener exactly once and is idempotent.

## Resource Ownership

- The factory owns every geometry, material, mesh, line object, and listener from the moment it is allocated until successful handle return.
- A factory `try/finally` cleanup path disposes every partial allocation before throwing `RENDER_FAILED`.
- On successful return, ownership of all island allocations transfers atomically to the handle.
- This feature introduces no shared island GPU resources and permits no resources to be excluded from the handle's disposal set.
- Application-global scene resources such as renderer, controls, lights, and ambient particles remain owned by the application and are never accepted or disposed by the island factory.

## Presentation Rules

| Mode | Tower opacity | Tower depth write | Springs |
|---|---:|---:|---|
| Existing layouts | 1 | Enabled | None |
| `force-anchors` | 0.5 | Disabled | One batched `LineSegments` object when active relations exist |

Spring rules:

- Every spring contributes exactly two vertices.
- Every vertex has world `y === 0`.
- One buffer represents every spring in the island.
- Material uses `depthTest: true` and `depthWrite: false`; rendering does not clear depth or force an always-on-top order.
- Opaque geometry may occlude springs. Force-mode towers are translucent and do not write depth, so spring segments remain distinguishable when their only intervening geometry is a tower.
- Springs cast/receive no shadows and never enter raycasting.

Hover and selection retain existing scale and color changes. Tower opacity remains at the active mode value.

## Visibility Validation Contract

The browser fixture assigns one control spring and applies, without modifying the user camera preset:

| Preset | Viewport | DPR | Vertical FOV | Target | Azimuth | Elevation | Distance |
|---|---:|---:|---:|---|---:|---:|---:|
| Desktop | 1440x900 | 1 | 34 degrees | Control-spring midpoint at `y = 0` | 32 degrees clockwise from +Z | 30 degrees | 43 world units |
| Mobile | 390x844 | 3 | 34 degrees | Same | 32 degrees clockwise from +Z | 30 degrees | 72 world units |

Run these presets in the six focused repeatable projects `visual-{desktop|mobile}-{chromium|firefox|webkit}`. Exercise the equivalent preset in current and previous stable Google Chrome/Blink and Mozilla Firefox/Gecko on applicable desktop and Android phone targets, and Apple Safari/WebKit on macOS and iPhone. Separately, run SC-012 selection/build/spring/restore coverage in all 18 release/device-class combinations, including Android tablet/hybrid for Chrome and Firefox and iPad for Safari, at boundary viewports 1024x720 desktop, 360x800 phone, and 768x1024 tablet/hybrid CSS px. The fixed visual presets do not replace those compatibility viewports.

For each focused visual project:

- The fixture defines paired 5x5 regions in screenshot device pixels after DPR for every visible spring cross-section and adjacent background, plus 5x5 hover, selection, and opaque-occlusion regions.
- Contrast uses WCAG relative luminance `(L1 + 0.05) / (L2 + 0.05)` after sRGB linearization. Every visible-spring, hover, and selection region contains at least one pixel at 3:1 or greater against its paired reference.
- Every pixel in an opaque-occlusion region differs from the corresponding pixel in an otherwise identical spring-disabled control frame by no more than 5 in each 8-bit RGB channel.
- Object-level assertions prove existing tower color and height mappings are unchanged.
- The user camera state before the fixture is restored after the assertion.

## Transactional Commit

```text
validated LayoutResult
  -> factory owns detached candidate allocations
  -> factory failure: dispose partial allocations, reject RENDER_FAILED
  -> successful IslandHandle return transfers ownership
  -> stale request: dispose candidate handle
  -> add candidate root
  -> swap active interaction references
  -> commit failure: restore prior references, remove/dispose candidate, retain prior root
  -> remove previous root
  -> dispose previous handle
```

If a WebGL 2 context is unavailable, report `WEBGL_UNAVAILABLE`. If candidate creation or commit fails, remove and dispose the candidate, restore or preserve prior interaction references, report `RENDER_FAILED`, announce the mapped localized message, and leave the previous root active and owned by its existing handle.
