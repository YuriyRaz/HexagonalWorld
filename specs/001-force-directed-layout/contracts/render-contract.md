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
  showSprings: true,
  springLevel: 0
}
```

Validation before allocation:

- Every placement has one visual payload and no payload is joined twice.
- Placement cells are unique integer axial coordinates within supported radius.
- `springs.length` is zero when `showSprings` is false. Hierarchy-edge cardinality is already validated by layout/runner boundaries; when springs are enabled, rendering creates exactly one segment per supplied validated spring and accepts an empty array.
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
- `dispose()` releases every geometry and material owned by the island exactly once and is idempotent.

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
| `force-anchors` | 0.5 | Disabled | One batched `LineSegments` object |
| `force-groups` | 0.5 | Disabled | None |

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

For each bundled Chromium, Firefox, and WebKit visual project:

- Every assigned control-spring segment whose only intervening geometry is a force-mode tower remains distinguishable.
- A segment behind assigned opaque geometry fails the depth test and is occluded.
- Existing tower color, height, hover, and selection meanings remain recognizable.
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
  -> remove previous root
  -> dispose previous handle
```

If WebGL is unavailable, report `WEBGL_UNAVAILABLE`. If candidate creation or commit fails, report `RENDER_FAILED`, announce the mapped localized message, and retain the previous root and interaction references.
