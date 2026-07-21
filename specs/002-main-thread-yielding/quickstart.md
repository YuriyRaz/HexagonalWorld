# Quickstart: Validating Main Thread Yielding Fix

**Feature**: 002-main-thread-yielding
**Date**: 2026-07-21

## Prerequisites

- Node.js installed
- Project dependencies installed (`npm install`)
- Playwright browsers installed (`npx playwright install`)

## Validation Scenarios

### Scenario 1: Playwright Test Passes at 360×568

**Purpose**: Verify the primary fix — the reachability test no longer times out at the small viewport.

**Commands**:
```bash
npm run build
npx playwright test tests/app.spec.js -g "keeps controls reachable" --project=chromium-360x568
```

**Expected outcome**: Test passes within 30 seconds (no timeout).

**What to watch for**:
- Test should complete in <30s (previously timed out at 60s)
- No `locator.evaluate` timeout errors in output

### Scenario 2: All E2E Tests Pass

**Purpose**: Verify no regressions at any viewport size.

**Commands**:
```bash
npm run test:e2e
```

**Expected outcome**: All tests pass, including:
- `keeps controls reachable at project boundaries and short viewports`
- All other `@us1` and `@portable` tagged tests

**What to watch for**:
- Zero test failures
- No timeout errors
- No new flaky tests

### Scenario 3: Build Succeeds

**Purpose**: Verify no syntax errors or build-breaking changes.

**Commands**:
```bash
npm run build
```

**Expected outcome**: Build completes without errors.

### Scenario 4: Manual Responsive Check

**Purpose**: Visually verify controls remain reachable at small viewport.

**Commands**:
```bash
npm run dev
```

Then open browser at 360×568 (Chrome DevTools device toolbar).

**Steps**:
1. Load the app — verify the hexagonal world renders
2. Select "force-anchors" from the layout algorithm dropdown
3. Verify `#layout-status` shows "Вычисляем..." immediately
4. Verify all controls (dropdown, generate button, status) are visible and not obscured
5. Wait for rebuild to complete — verify status shows "Успешно завершено."
6. Click on a hex tile — verify selection works (hover feedback appears)

**Expected outcome**: UI is fully responsive, no freezing, controls reachable throughout.

### Scenario 5: Beforeunload Listener Count

**Purpose**: Verify the listener accumulation bug is fixed.

**Commands**:
```bash
npm run dev
```

Then in browser console:
```javascript
// Check listener count after 60 seconds
setTimeout(() => {
  const count = getEventListeners(window).beforeunload?.length || 0;
  console.log('beforeunload listeners:', count);
  // Expected: 1 (not 3600+)
}, 60000);
```

**Expected outcome**: Only 1 `beforeunload` listener exists (registered once at module scope).

## Data Model Reference

See [data-model.md](data-model.md) for the render loop state machine and timing requirements.

## Contract Reference

See [contracts/render-loop.md](contracts/render-loop.md) for the observable behavior contracts being validated.
