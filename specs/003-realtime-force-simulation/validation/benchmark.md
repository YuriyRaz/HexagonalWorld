# Benchmark Validation: Local Profile Raw Samples

**Date**: 2026-08-03
**Project**: benchmark-desktop-chromium
**Playwright**: 1.61.1, Chromium HeadlessChrome/136.0.7103.25
**Viewport**: 1024x720, deviceScaleFactor=1
**Environment note**: Slow environment detected (warmup > 5000 ms); thresholds relaxed 10x per test logic.

## Test Run Summary

Command: `npx playwright test tests/layout.benchmark.spec.js --project=benchmark-desktop-chromium --reporter=line`

### Representative (1200 leaves)

| Metric | Raw Value | Relaxed Limit | Result |
|---|---|---|---|
| Warmup Time | 70854 ms | — | slow-env detected |
| p95 Build Time | 66335.63 ms | 200000 ms (10x) | **FAIL** (exceeded even relaxed limit) |
| p95 Tab Latency | 1.60 ms | 1000 ms (10x) | PASS |
| Median Frame Time | 7.80 ms | 333 ms (10x) | PASS |
| Measured Runs | 1 | — | slow-env |
| Threshold Multiplier | 10x | — | — |

**Failure detail**: `expect(p95BuildTime).toBeLessThan(f.threshold * multiplier)` — received 66335.63, expected < 200000.

### Current Maximum (4800 leaves)

| Metric | Raw Value | Relaxed Limit | Result |
|---|---|---|---|
| Warmup Time | 70162 ms | — | slow-env detected |
| p95 Build Time | 67408.41 ms | 80000 ms (10x) | PASS |
| p95 Tab Latency | 6.10 ms | 1000 ms (10x) | PASS |
| Median Frame Time | 561.00 ms | 333 ms (10x) | **FAIL** (exceeded even relaxed limit) |
| Measured Runs | 1 | — | slow-env |
| Threshold Multiplier | 10x | — | — |

**Failure detail**: `expect(medianFrameTime).toBeLessThan(33.3 * multiplier)` — received 561, expected < 333.

### Structural Maximum (4800 leaves)

| Metric | Raw Value | Relaxed Limit | Result |
|---|---|---|---|
| Warmup Time | — | — | — |
| p95 Build Time | — | — | ERROR |
| p95 Tab Latency | — | — | ERROR |
| Median Frame Time | — | — | ERROR |

**Failure detail**: `page.evaluate: Execution context was destroyed, most likely because of a navigation` during `runForceAndWait` polling. The test aborted before collecting measurement samples.

## Nearest-Rank Calculations

With only 1 measured run per fixture (slow-env path), the p95 nearest-rank is the single sample itself:

- **Representative**: p95 build = 66335.63 ms (rank = ceil(0.95 × 1) = 1; sorted[0])
- **Current Maximum**: p95 build = 67408.41 ms (rank = ceil(0.95 × 1) = 1; sorted[0])
- **Structural Maximum**: No valid samples collected.

## Raw Console Output

```
--- Representative (1200 leaves) Results ---
p95 Build Time: 66335.63 ms (limit: 200000)
p95 Tab Latency: 1.60 ms (limit: 1000)
Median Frame Time: 7.80 ms (limit: 333)
[slow-env] warmup=70854ms — thresholds relaxed 10x

--- Current Maximum (4800 leaves) Results ---
p95 Build Time: 67408.41 ms (limit: 80000)
p95 Tab Latency: 6.10 ms (limit: 1000)
Median Frame Time: 561.00 ms (limit: 333)
[slow-env] warmup=70162ms — thresholds relaxed 10x
```
