# Layout Worker And Runner Protocol

## Runner API

```js
runLayout(request) -> Promise<LayoutResult>
cancelActiveLayout(reason = 'superseded') -> void
dispose() -> void
```

The runner is created with `{ workerFactory, hangGuardMs }`. Production fixes `hangGuardMs` at `60000`; timeout tests dependency-inject exactly `50`. This runner-only value never enters `LayoutConfig` or the worker request and cannot affect successful layout output.

Every call receives a page-assigned monotonically increasing `requestId`. Existing modes resolve through the same promise API without a worker. The force-directed mode uses a fresh Vite module worker.

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
  request: LayoutRequest // mode is force-anchors
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

The worker verifies `requestId === result.requestId`. The runner revalidates ID, mode, cardinality, unique cells, integer radius no greater than 256, finite values, deterministic ordering, at most 5,999 springs, and the exact leaf/anchor immediate-parent spring chain before resolving. A missing or extra force-mode spring fails validation; excess spring count or radius is rejected without replacing the current world.

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
| `UNSUPPORTED_ENVIRONMENT` | Module workers unavailable or prohibited during preflight | false | Reject immediately; retain world |
| `WORKER_START_FAILED` | Worker constructor/startup error | false | Reject; retain world |
| `WORKER_MESSAGE_FAILED` | `error`, `messageerror`, malformed response, or result revalidation failure | false | Terminate worker; retain world |
| `TIMEOUT` | 60,000 ms production stuck-worker guard, or injected 50 ms test guard, expires | false | Remove listeners, clear timer, terminate worker exactly once; retain world |
| `CANCELLED` | New request or app teardown | true | Reject old promise, terminate worker |
| `INTERNAL_ERROR` | Unexpected runner failure | false | Clean up and retain world |

Before starting a worker, orchestration also preflights WebGL 2. Rendering/orchestration adds `WEBGL_UNAVAILABLE` when the required context cannot be created, or `RENDER_FAILED` after a valid layout result; those errors use the same `LayoutOperationError` shape but do not originate in the worker.

The safety guard is not equal to and is not derived from the performance thresholds. Measure on the documented Windows 11 reference workstation with Intel Core i7-1360P, 32 GB RAM, AC power, Playwright 1.61 bundled Chromium, 1440x900 viewport, DPR 1, no CPU throttling, and nonessential applications closed. After two warmups, ten measured builds per fixture use nearest-rank p95 (rank 10): full selection-to-commit time is at most 2 seconds for 1,200 towers and 8 seconds for 4,800 towers. For each busy-state response, wait until status is busy while the algorithm selector remains focused, press `Tab` once, and measure `keydown.timeStamp` to the first subsequent `requestAnimationFrame` callback; rank-10 p95 is at most 100 ms. For 4,800 towers, record one five-second post-commit animation-frame-delta window after each measured build, pool the ten windows, and require their median to be at most 33.3 ms. Full time includes worker startup, transport, calculation, validation, visual-resource creation, and commit. These statistics never abort an individual user run.

`main.js` owns a code-to-localized-message table and writes non-silent failures to the existing live region. The worker and pure layout modules never choose locale or UI wording.

## Force Request Lifecycle

```text
runLayout(N)
  -> reject/terminate active N-1 as silent CANCELLED
  -> verify WebGL 2 support or reject WEBGL_UNAVAILABLE
  -> verify module-worker support or reject UNSUPPORTED_ENVIRONMENT
  -> construct worker N
  -> start 60,000 ms production hang guard N (50 ms when injected by timeout tests)
  -> post calculate N

success/failure N
  -> verify N is latest
  -> revalidate complete response and spring chain
  -> clear hang guard
  -> remove worker handlers
  -> terminate worker N
  -> resolve, or reject typed error
```

Additional rules:

- Selecting an existing synchronous mode cancels any force worker first.
- The 60,000 ms production hang guard, or exactly 50 ms injected timeout-test guard, remains active through worker startup, structured clone, calculation, response receipt, and complete runner revalidation; elapsed time never determines algorithm output or implements performance acceptance.
- End-to-end performance measurement independently continues through candidate rendering and transactional commit.
- Success, failure, cancellation, startup failure, and app teardown remove worker handlers, clear the guard, and terminate the worker exactly once; `dispose()` is idempotent.
- The selector remains enabled and operable while a force request is active.
- An empty hierarchy, unsupported environment, startup failure, worker failure, hang-guard expiry, or render failure leaves the previous committed island active and produces one localized announcement unless silent.
