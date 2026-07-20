# Layout Worker And Runner Protocol

## Runner API

```js
runLayout(request) -> Promise<LayoutResult>
cancelActiveLayout(reason = 'superseded') -> void
dispose() -> void
```

Every call receives a page-assigned monotonically increasing `requestId`. Existing modes resolve through the same promise API without a worker. Force modes use a fresh Vite module worker.

Promise outcomes:

- Success resolves one validated normalized `LayoutResult`.
- Failure rejects one `LayoutOperationError` with `{ requestId, code, details, silent }`.
- Superseding or disposing rejects the active promise with `code: 'CANCELLED'` and `silent: true` before the worker is terminated.
- A response whose ID is no longer active is ignored; it cannot settle another request or commit a world.

## Worker Transport

Messages are structured-cloneable plain objects. Visual payloads, localized strings, functions, DOM nodes, and Three.js objects are forbidden.

### Calculate Request

```js
{
  type: 'calculate',
  request: LayoutRequest // mode is force-anchors or force-groups
}
```

The worker accepts one calculate request in its lifetime. Replacement is the cancellation mechanism.

### Success Response

```js
{
  type: 'success',
  requestId: 17,
  result: LayoutResult
}
```

The worker verifies `requestId === result.requestId`. The runner revalidates ID, mode, cardinality, unique cells, radius, finite values, ordering, and spring invariants before resolving.

### Failure Response

```js
{
  type: 'failure',
  requestId: 17,
  error: {
    code: 'NOT_CONVERGED',
    details: {
      stableEpochs: 1,
      requiredStableEpochs: 3
    }
  }
}
```

Worker-originated codes:

- `UNKNOWN_MODE`
- `EMPTY_HIERARCHY`
- `INVALID_HIERARCHY`
- `UNSUPPORTED_SCALE`
- `NON_FINITE_STATE`
- `ASSIGNMENT_INVARIANT`
- `NOT_CONVERGED`
- `INTERNAL_ERROR`

Unexpected exceptions are caught at the worker boundary and serialized as `INTERNAL_ERROR` with production-safe diagnostic details. Stack traces may be logged in development but never become user-visible text.

## Runner-Originated Failures

| Code | Trigger | `silent` | Required behavior |
|---|---|---:|---|
| `UNSUPPORTED_ENVIRONMENT` | Module workers unavailable or prohibited before creation | false | Reject immediately; retain world |
| `WORKER_START_FAILED` | Worker constructor/startup error | false | Reject; retain world |
| `WORKER_MESSAGE_FAILED` | `error`, `messageerror`, malformed response, or result revalidation failure | false | Terminate worker; retain world |
| `TIMEOUT` | Independently configured stuck-worker safety guard expires | false | Terminate worker; retain world |
| `CANCELLED` | New request or app teardown | true | Reject old promise, terminate worker |
| `INTERNAL_ERROR` | Unexpected runner failure | false | Clean up and retain world |

Rendering adds `WEBGL_UNAVAILABLE` or `RENDER_FAILED` after a valid layout result; those errors use the same `LayoutOperationError` shape but do not originate in the worker.

The safety guard is not equal to and is not derived from the 2-second or 8-second benchmark thresholds. Those thresholds are nearest-rank acceptance statistics across ten measured builds and never abort an individual user run.

`main.js` owns a code-to-localized-message table and writes non-silent failures to the existing live region. The worker and pure layout modules never choose locale or UI wording.

## Force Request Lifecycle

```text
runLayout(N)
  -> reject/terminate active N-1 as silent CANCELLED
  -> verify worker support
  -> construct worker N
  -> start independent hang guard N
  -> post calculate N

success/failure N
  -> verify N is latest
  -> clear hang guard
  -> terminate worker N
  -> validate and resolve, or reject typed error
```

Additional rules:

- Selecting an existing synchronous mode cancels any force worker first.
- The hang guard covers worker startup, structured clone, calculation, and response validation; elapsed time never determines algorithm output or implements performance acceptance.
- End-to-end performance measurement independently continues through candidate rendering and transactional commit.
- App teardown rejects the active promise, terminates the worker, and clears timers/listeners.
- The selector remains enabled and operable while a force request is active.
- An empty hierarchy, unsupported environment, startup failure, worker failure, hang-guard expiry, or render failure leaves the previous committed island active and produces one localized announcement unless silent.
