# Quickstart: Fix Test Config Race Condition

**Date**: 2026-07-22

## Prerequisites

- Node.js installed
- Project dependencies installed: `npm install`

## Validation Scenarios

### Scenario 1: All 14 failure scenarios pass within timeout

```bash
npm run test:e2e -- --grep "announces failures" --project=chromium-desktop
```

**Expected**: All 14 failure scenarios complete. Test passes. Total time under 120 seconds.

### Scenario 2: Full E2E suite still passes

```bash
npm run test:e2e
```

**Expected**: All E2E tests pass. No regressions.

### Scenario 3: Unit tests still pass

```bash
npm test
```

**Expected**: All unit tests pass. No regressions.

### Scenario 4: Build succeeds

```bash
npm run build
```

**Expected**: Build completes without errors.

## What to Verify

1. **No flakiness**: Run the failure scenario test 3 times consecutively — all must pass
2. **Timeout headroom**: The test should complete well under 120 seconds (target: under 60 seconds)
3. **Error codes match**: Each scenario's `lastErrorCode` equals its `expectedCode`
4. **Previous world retained**: After each failure, `activeRootId` and `activeResult` are unchanged from before the failure
5. **Status text correct**: The status element shows the "retained" message after each failure
