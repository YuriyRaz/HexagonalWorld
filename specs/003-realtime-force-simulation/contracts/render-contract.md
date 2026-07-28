# Live Render And Retained-Session Transaction Contract

## Factories

```js
createLiveIsland({ visualPayloadByEntityId, topology, initialFrame, presentation }) -> LiveIslandHandle
createIsland({ visualPayloadByEntityId, layoutResult, topology?, terminalFrame?, presentation }) -> IslandHandle
```

Both validate before allocation, build detached roots, own partial resources, and dispose partial failures. Validated `topology` and `terminalFrame` are required for force-mode stable construction and omitted for legacy layouts. Topology provides the canonical entity-index mapping used by terminal positions and spring endpoints.

## LiveIslandHandle

Own one occupied `InstancedMesh`, one dynamic `LineSegments` object, fixed payload/height/color/instance order, reusable math objects, and current node/spring metadata.

```js
{
  requestId,
  root,
  interactiveTiles,
  applyStep(frame),
  inspectCurrentFrame(),
  retire(),
  dispose()
}
```

`applyStep()` accepts only exact next global step for the active request. It validates all values first, then updates tower matrices/metadata, both spring endpoints from the same frame, bounds, and interaction styling in place. No production scene resource/backing array/per-instance record is allocated per step.

## Springs And Towers

- One relation equals one segment; exactly one line object exists when nonempty.
- Position attribute contains two vertices per relation at literal `y = 0`.
- Springs keep depth testing, no depth write, transparency, and no raycast.
- Force towers keep established translucency and selection/hover distinction.
- Assignment changes update targets/diagnostics but never teleport rendered towers.
- Terminal live leaves already equal exact assigned centers.

## Terminal Equality

Before stable island construction, validate for every leaf:

```text
authoritative full-precision node center == assigned axial cell center
Math.fround(authoritative center) == terminal frame position
terminal frame position == live tower matrix position == rendered leaf spring source
serialized placement identifies the same axial cell
```

The stable factory receives the force terminal frame alongside `LayoutResult`. It may rebuild empty-grid, water, and static resources, but it must consume the terminal frame's Float32 tower and leaf-spring coordinates directly; axial placements alone are insufficient to recreate force transforms. Scene replacement cannot create a visual position change.

## Initial Transaction

```text
retain previous stable world
  -> create/display live candidate from step 0
  -> present every step
  -> terminal exact-center frame
  -> validate result and build detached stable candidate
  -> commit stable candidate
  -> confirm worker session result committed
  -> dispose live and previous stable handles
  -> worker remains retained-settled and idle
```

If final construction/commit fails, dispose candidates, restore previous stable world, and cancel the settled-but-uncommitted worker.

## Future Interaction Epoch Boundary

This feature exposes no gesture, but retained observers support a test/future command epoch:

```text
accepted command on retained session
  -> committed stable world remains rollback authority
  -> first validated epoch frame creates/displays provisional live view
  -> force steps update towers/springs coherently
  -> exact-center epoch terminal frame
  -> validate/build/commit next stable world
  -> confirm epoch result committed
  -> worker returns retained-settled
```

Cancellation/failure restores the pre-epoch stable world. No late epoch frame targets a retired handle.

## Current UI Semantics

- Click still selects; left pointer/one-touch still controls camera according to existing controls.
- No tower drag, grab state, pointer capture, preview, or simulation-mutating accessible action is added.
- Semantic selection IDs survive movement/replacement when resolvable.
- Hover is reevaluated after moving frames and bounds remain current.
- Controls remain enabled while busy.

## Progress And Accessibility

Visible non-live progress reports global step, epoch, cooling step, assignment stability, convergence streak, and terminal reason. The polite status announces start and terminal events only. A future manipulation UI requires a separate accessible specification.

## Reduced Motion

Final-only calculation creates no live island. Mid-epoch suppression retires only presentation, restores the rollback stable world, and lets the retained session finish final-only. Stable commit equality and retained worker lifecycle remain unchanged.

## Test Observability

Opt-in diagnostics expose request/global/epoch/cooling steps, assignment revision/hash, node/tower coordinates, spring indexes/vertices/material flags, control watermark, root count, worker-retained state, and logical paint timestamp. Production does not record frame history.

`window.__hexWorldTest.forceSession` is the contract-only browser seam:

```js
{
  submit({ requestId, action, entityId, x?, y? }) -> Promise<ControlReceipt>,
  waitForEpoch(requestId, epoch) -> Promise<EpochSettlementSummary>,
  setNextCommitOutcome('success' | 'failure') -> void,
  trace() -> ForceTraceEntry[],
  clearTrace() -> void,
  diagnostics() -> {
    requestId, state, globalStep, epoch, coolingStep,
    retainedWorkerCount, workerMessages, activeTimers,
    listenerCounts, rootCount, lastControlReceipt
  }
}
```

Enable the seam only when the test harness loads the app with `?testDiagnostics=1`; otherwise `forceSession` is absent and no trace history is retained. The seam delegates to runner/main ownership, never accepts a caller command sequence, and rejects invalid/unavailable calls with `{ code, details }`. `EpochSettlementSummary` is `{ requestId, epoch, globalStep, terminalReason, placements, springs, assignmentHash }` with copied arrays and no transferable positions. `ForceTraceEntry` is a lossless copied test record of `{ requestId, globalStep, epoch, coolingStep, assignmentRevision, assignmentHash, positions, springs, paintedAt, terminal, controlWatermark }`; `trace()` returns all entries since `clearTrace()` in order and returns fresh copies. `setNextCommitOutcome('failure')` fails the next initial/epoch stable commit so rollback and release can be asserted. No production pointer, touch, keyboard, camera, selection, or accessibility action calls this seam.

## Required Evidence

- Normal-motion trace is contiguous across initial and test interaction epochs.
- Every frame has unique assignments and coherent tower/spring geometry.
- Terminal live and stable coordinates are identical with no snap.
- No current gesture submits a command.
- One worker remains idle after commit, then all session/GPU resources release exactly once on lifecycle termination.
