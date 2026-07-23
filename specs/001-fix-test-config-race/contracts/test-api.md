# Test API Contract

**Date**: 2026-07-22

## `window.__hexWorldTest` API

The application exposes a test API on `window.__hexWorldTest` for Playwright E2E tests.

### `configureNextRequest(config)`

Sets a one-shot configuration consumed by the next `rebuildIsland()` call.

**Parameters**:
- `config.entities` — Array of entity objects (overrides generated data)
- `config.failure` — `{ code: string, stage?: string, details?: object }` (forces an error)
- `config.delayMs` — Number (injects delay into force layout)

**Behavior**: Stores config on `window.__hexWorldTest.nextConfig`. Cleared to `null` after consumption.

### `getState()`

Returns the current application state.

**Returns**:
- `productionHangGuardMs` — Number (60000)
- `latestRequestId` — Number
- `requestedMode` — String
- `activeMode` — String
- `busy` — Boolean
- `lastErrorCode` — String | null
- `activeRootId` — String
- `activeResult` — Object

### `forceRebuild()` *(new — added by this fix)*

Triggers `rebuildIsland()` directly, bypassing the `<select>` change event.

**Parameters**: None

**Behavior**: Calls `rebuildIsland()`, which consumes `nextConfig` if set.

**Use case**: When the selector is already on the target value and a change event won't fire.
