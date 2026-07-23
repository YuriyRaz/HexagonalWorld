# Data Model: Fix Test Config Race Condition

**Date**: 2026-07-22

## Entities

### Test Configuration (`nextConfig`)

Represents a one-shot configuration injected by the test harness for a single rebuild.

| Field | Type | Description |
|-------|------|-------------|
| `entities` | Array | Optional. Test entity hierarchy to use instead of generated school data |
| `failure` | Object | Optional. `{ code, stage?, details? }` — forces a specific error during layout |
| `delayMs` | Number | Optional. Injects a delay into the force layout (for timing tests) |

**Lifecycle**: Set via `configureNextRequest()` → Consumed by `rebuildIsland()` → Cleared to `null`

### Application State (exposed via `getState()`)

| Field | Type | Description |
|-------|------|-------------|
| `productionHangGuardMs` | Number | Hang guard timeout (always 60,000) |
| `latestRequestId` | Number | Counter incremented on each rebuild call |
| `requestedMode` | String | The algorithm mode requested by the user |
| `activeMode` | String | The algorithm mode of the currently committed world |
| `busy` | Boolean | Whether a rebuild is in progress |
| `lastErrorCode` | String | Error code from the most recent failed rebuild, or `null` |
| `activeRootId` | String | ID of the currently committed island root |
| `activeResult` | Object | Structured-clone-safe layout result of the committed world |

### State Transitions

```
[Idle] → rebuildIsland() called → [Busy]
  ├─ config consumed, nextConfig = null
  ├─ lastErrorCode = null
  └─ mode = algorithmSelect.value

[Busy] → layout completes → [Idle]
  ├─ If success: activeRootId updated, activeResult updated
  └─ If error: lastErrorCode set, previous world retained

[Busy] → rebuildIsland() called again → [Busy] (new request supersedes old)
  ├─ Old request's requestId !== current counter → early return
  └─ Only the latest request clears `busy`
```

### Key Invariant

**One config per rebuild**: `nextConfig` is consumed exactly once by `rebuildIsland()`. If `rebuildIsland()` is called without a config being set, it uses empty `{}` and proceeds with default data. If a config is set but `rebuildIsland()` is never called, the config sits unconsumed (this is the bug).
