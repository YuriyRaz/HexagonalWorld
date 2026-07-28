# Retained Worker And Runner Protocol

## Runner API

```js
runLayout(request, options?) -> Promise<LayoutResult>
confirmSessionResultCommitted(requestId, epoch = 0) -> void
submitForceControl({ requestId, action, entityId, x?, y? }) -> Promise<ControlReceipt>
waitForEpochSettlement(requestId, epoch) -> Promise<EpochSettlement>
cancelActiveLayout(reason = 'superseded') -> void
setPresentationPaused(paused) -> void
suppressActivePresentation() -> void
dispose() -> void
```

`runLayout()` preserves existing final-Promise behavior. Initial success does not terminate the force worker. Current UI invokes no control API; contract tests may.

Runner owns command sequencing. The first forwarded command for a request is sequence 1, and callers never provide `commandSeq`. Runner-local rejection for malformed input, wrong/stale request, initial-running, pre-commit, cancelled, failed, or disposed state consumes no sequence. Once a valid caller command is forwarded, runner increments its next sequence exactly once. Worker semantic rejection of that expected sequence advances only its processed watermark, so the next runner sequence remains valid. A worker structural/duplicate/gap/wrong-request response is a protocol failure that destroys the session rather than attempting a later sequence.

Each forwarded command owns a 60-second visible-active-time receipt guard. Hidden intervals pause the guard. A matching receipt settles and clears it exactly once. Timeout rejects the caller with `CONTROL_TIMEOUT`, destroys retained interaction capability and all pending command/epoch waiters, preserves the committed world, and releases the captured session; cancellation, worker failure, supersession, and disposal reject it with their typed reason and clear the same ownership.

## Presentation Options

```js
{
  presentation: 'all-steps' | 'final-only',
  onReady(topology, stepZero) -> Promise<PresentationReceipt>,
  onStep(frame) -> Promise<PresentationReceipt>,
  onInitialSettled(settlement) -> void,
  onEpochReady(metadata, frame) -> Promise<PresentationReceipt>,
  onEpochSettled(settlement) -> void | Promise<void>
}
```

Normal motion alternates exact step frames and logical paint receipts. Reduced motion executes identical calculation without intermediate frames. Global step remains contiguous across epochs. Runner invokes `onInitialSettled` synchronously after validating success and before resolving `runLayout()` so main can capture the topology-bearing terminal settlement while the Promise remains backward-compatible as `LayoutResult`.

`topology` contains `{ requestId, nodeIds, nodeKinds, relations }`. `nodeIds` and `nodeKinds` are equal-length canonical arrays; each relation is `{ sourceIndex, targetIndex, relationshipId }` and indexes those arrays. IDs are unique nonempty strings, kinds are `leaf` or `anchor`, indexes are safe integers in range, and relationship IDs are unique. Both endpoints and all ordering are validated before rendering allocation.

`PresentationReceipt` is `{ requestId, globalStep, buffer }`, where `buffer` is the exact outstanding transferable position `ArrayBuffer` for that request and step. A malformed identity, detached/wrong buffer, duplicate receipt, or receipt when no frame is outstanding fails the active operation without advancing the session.

`InitialSettlement` is the `EpochSettlement` shape below with `epoch: 0`. `EpochReadyMetadata` is `{ requestId, epoch, globalStep, topology }`; its accompanying frame is the first validated frame of that epoch and uses the Force Step Frame schema from `data-model.md`. Observer exceptions reject the affected operation, preserve the previously committed world, and trigger captured-session cleanup.

## Calculation Messages

Main starts one request-scoped worker session. Worker sends `ready` step 0, contiguous `step` frames, then `success` or `failure`. A frame includes global/epoch/cooling steps, assignment/convergence metrics, applied command watermark, positions, and terminal result when converged.

`painted` returns the exact outstanding position buffer. `suppress` returns it without presentation when reduced motion latches. One buffer/frame is outstanding at most; batching, gaps, replacement, and coalescing are invalid.

Initial success has the following shape; `terminalFrame` repeats terminal metadata for stable construction but is not presented as a second visible step:

```js
{
  type: 'success',
  requestId,
  globalStep,
  result,
  terminalFrame: { requestId, globalStep, epoch, epochStep, coolingStep, positions, terminal: 'converged', result }
}
```

The top-level and nested `result` originate from the same result object before structured cloning and MUST be deeply equal after receipt. The worker transfers a dedicated reusable terminal snapshot buffer after any all-steps paint buffer has been returned. Final-only mode sends the same success shape. Runner is the sole buffer owner and exposes read-only settlement views to observers/waiters; consumers MUST NOT mutate or transfer positions. Runner/main retain this terminal snapshot until stable commit succeeds or fails. Successful `confirmSessionResultCommitted()` sends `{ type: 'session-result-committed', requestId, epoch, terminalBuffer }`, transferring the exact snapshot buffer back before the worker resumes retained settlement. Cancellation/commit failure releases the main-side buffer and terminates the session without requiring a return transfer.

## Control Messages

Main to worker:

```js
{
  type: 'force-control',
  requestId,
  commandSeq,
  command: { action, entityId, x?, y? }
}
```

Worker receipt:

```js
{
  type: 'force-control-result',
  requestId,
  commandSeq,
  accepted,
  epoch,
  appliedAfterGlobalStep,
  fixedCount,
  error?
}
```

For `accepted: true`, `appliedAfterGlobalStep` is the global step immediately preceding the mandatory command-boundary tick and `error` is absent. For `accepted: false`, `appliedAfterGlobalStep` is `null`, `fixedCount` and `epoch` report unchanged state, and `error` is `{ code, details }`.

Commands queued behind an outstanding frame apply after its exact painted/suppress receipt and before the next tick. Every accepted command is preserved FIFO; rejection is typed and does not fail a healthy session.

Accepted-command backpressure is `apply command -> record appliedAfterGlobalStep -> run its mandatory command-boundary tick -> present or suppress that frame -> receive exact acknowledgement -> emit accepted receipt -> process the next queued command`. The boundary frame carries the accepted command watermark. A semantically rejected command emits its rejection receipt immediately and creates no tick/frame. Runner may queue later commands, but their worker application waits until the preceding accepted receipt has been emitted.

Later convergence sends:

```js
{
  type: 'epoch-success',
  requestId,
  epoch,
  globalStep,
  result,
  terminalFrame
}
```

`EpochSettlement` is `{ requestId, epoch, globalStep, topology, result, terminalFrame }`. Request/epoch/step identities must match the waiter and retained session; topology must be the validated canonical topology retained from `ready`; result placements and terminal-frame positions must pass exact terminal equality validation. `onInitialSettled`, `onEpochSettled`, and `waitForEpochSettlement` receive read-only views over runner-owned data. `terminalFrame` follows the same ownership and commit-release rule as initial success.

Every failure uses `{ type: 'failure', requestId, error: { code, details }, globalStep?, terminalFrame? }`. Step-256 non-convergence is a numbered terminal calculation state. In all-steps mode the worker sends `{ terminal: 'not-converged' }`, waits for its exact painted receipt, then sends the canonical failure envelope with `error.code: 'NOT_CONVERGED'`, terminal global step, and terminal frame; in final-only mode it sends that envelope directly without presenting the frame. The failure snapshot is never committed or rendered in final-only mode, exists only to validate/report the terminal step, and is released exactly once when failure handling preserves the previous world. Other failures omit `terminalFrame` when no valid numbered terminal state exists and put all machine-readable context under `error.details`.

## Session Lifecycle

```text
start request
  -> initial running / paint-gated steps
  -> success(result)
  -> runner resolves runLayout Promise, clears guard
  -> settled-awaiting-commit (commands rejected)
  -> confirmSessionResultCommitted
  -> retained-settled (idle, commands accepted)
  -> control starts held epoch
  -> one tick per accepted held command boundary
  -> final release starts interaction cooling with fresh guard/budget
  -> epoch-success
  -> commit confirmation returns retained-settled
```

Failure, cancellation, mode switch, rebuild, newer request, commit failure, worker error, `pagehide`, or disposal closes the captured session and releases worker/listeners/buffers/deferreds exactly once. A post-success worker error preserves the committed scene but removes retained interaction capability.

## Operation Versus Session Settlement

- Initial `success` is terminal for the `runLayout()` operation but nonterminal for the worker session.
- `settled-awaiting-commit` has no guard and rejects controls.
- Commit confirmation makes the worker command-eligible.
- Retained idle has no timer and no autonomous work.
- Final release starts a fresh 60-second active-time guard; hidden intervals do not consume it.
- Later epoch result remains provisional until future orchestration confirms its stable scene commit.
- Main handles `onEpochReady` and `onEpochSettled` as a complete scene transaction: preserve the committed rollback island, present a provisional epoch island when motion is allowed, validate/build/commit from the epoch terminal frame, then call `confirmSessionResultCommitted(requestId, epoch)`; failure restores rollback and destroys the epoch/session as specified.

## Command Ordering And Determinism

- Runner assigns/validates monotonically increasing command sequences.
- Worker reports exact applied-after global step.
- Commands accepted behind one frame apply only after that frame's receipt.
- No accepted command is coalesced, dropped, or reordered.
- Transcript excludes timestamps, RAF, visibility, pointer, and transport identity.
- Duplicate/gapped/stale/wrong-request/post-disposal commands reject without state mutation.

## Reduced Motion And Visibility

Initial final-only mode emits no intermediate frames. Mid-epoch reduction latches immediately, retires presentation, suppresses the outstanding or next intercepted frame, and continues the same epoch final-only. A new interaction epoch resamples current motion preference. Hidden all-steps playback retains one outstanding state and pauses its guard without catch-up.

## Ownership

- Worker owns retained force session, command queue, assignments, and reusable transport buffer.
- Runner owns worker/listeners/deferreds/sequences/guards until session destruction.
- Main owns presentation Promises, scene transaction, visibility/media listeners, and commit confirmation.
- Every callback checks captured session identity before mutation or cleanup.

## Required Evidence

- Initial success leaves exactly one retained worker and zero active operation timer.
- Commit failure terminates that worker; commit success enables controls.
- Accepted commands apply between ticks with receipts/watermarks.
- Epoch settlement resolves the matching waiter and retains the worker again after commit confirmation.
- Every specified destruction path terminates exactly once and late callbacks/commands cannot affect a replacement.
