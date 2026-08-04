import { expect, test } from 'playwright/test';
import {
  buildRepresentativeHierarchy,
  buildCurrentMaximumHierarchy,
  buildStructuralMaximumHierarchy
} from './fixtures/hierarchies.js';

const FORCE_MODE = 'force-anchors';
const POLL_TIMEOUT = 300000;
const WARMUP_RUNS = 2;
const MEASURED_RUNS = 10;
const FRAME_COLLECT_MS = 5000;
const STARTUP_MAX_MS = 2000;
const CADENCE_MIN_HZ = 5;
const CADENCE_MAX_GAP_MS = 200;
const CADENCE_MIN_PASS_RATE = 0.95;
const INTERACTION_MAX_MS = 100;

async function openApp(page) {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#layout-algorithm')).toBeVisible();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 15000 });
}

function calculateNearestRankP95(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length);
  return sorted[rank - 1];
}

function calculateMedian(samples) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

async function runForceAndWait(page, selector, entities) {
  await page.evaluate((e) => {
    window.__hexWorldTest.configureNextRequest({ entities: e });
  }, entities);
  await selector.selectOption(FORCE_MODE);
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__hexWorldTest.getState());
    return state.busy;
  }, { timeout: POLL_TIMEOUT }).toBe(true);
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__hexWorldTest.getState());
    return state.busy;
  }, { timeout: POLL_TIMEOUT }).toBe(false);
}

async function resetToPacked(page, selector) {
  await selector.selectOption('packed');
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__hexWorldTest.getState());
    return state.busy;
  }, { timeout: POLL_TIMEOUT }).toBe(false);
}

test.describe('Force-Directed Layout Performance Benchmark', { tag: ['@benchmark'] }, () => {
  const fixtures = [
    { name: 'Representative (1200 leaves)', builder: buildRepresentativeHierarchy, threshold: 2000 },
    { name: 'Current Maximum (4800 leaves)', builder: buildCurrentMaximumHierarchy, threshold: 8000 },
    { name: 'Structural Maximum (4800 leaves)', builder: buildStructuralMaximumHierarchy, threshold: 8000 }
  ];

  for (const f of fixtures) {
    test(f.name, async ({ page }, testInfo) => {
      test.setTimeout(600000);
      await openApp(page);

      const selector = page.locator('#layout-algorithm');
      const entities = f.builder();

      for (let i = 0; i < WARMUP_RUNS; i++) {
        await runForceAndWait(page, selector, entities);
        await resetToPacked(page, selector);
      }

      const buildTimes = [];
      const startupTimes = [];
      const tabLatencies = [];
      const resetKeyLatencies = [];
      const resetClickLatencies = [];
      const resetTapLatencies = [];
      const allFrameDeltas = [];
      const allCadenceTimestamps = [];

      for (let run = 0; run < MEASURED_RUNS; run++) {
        await page.evaluate(() => {
          window.__cadenceTimestamps = [];
          const target = document.getElementById('layout-progress');
          if (target) {
            const obs = new MutationObserver(() => {
              window.__cadenceTimestamps.push(performance.now());
            });
            obs.observe(target, { childList: true, subtree: true, characterData: true });
            window.__cadenceObserver = obs;
          }
        });

        await page.evaluate((e) => {
          window.__hexWorldTest.configureNextRequest({ entities: e });
        }, entities);

        await page.evaluate(() => {
          window.__benchmarkData = {
            frameDeltas: [],
            tabLatency: null,
            resetKeyLatency: null,
            resetClickLatency: null,
            resetTapLatency: null,
            lastFrameTime: performance.now()
          };
          function tick() {
            const now = performance.now();
            window.__benchmarkData.frameDeltas.push(now - window.__benchmarkData.lastFrameTime);
            window.__benchmarkData.lastFrameTime = now;
            window.__benchmarkFrameId = requestAnimationFrame(tick);
          }
          window.__startPostCommitTracking = () => {
            window.__benchmarkData.frameDeltas = [];
            window.__benchmarkData.lastFrameTime = performance.now();
            tick();
          };
          window.__stopPostCommitTracking = () => {
            cancelAnimationFrame(window.__benchmarkFrameId);
          };
          window.__instrumentTabResponse = () => {
            const el = document.getElementById('layout-algorithm');
            el.addEventListener('keydown', (e) => {
              if (e.key === 'Tab') {
                const keydownTime = performance.now();
                requestAnimationFrame(() => {
                  window.__benchmarkData.tabLatency = performance.now() - keydownTime;
                });
              }
            }, { once: true });
          };
          window.__instrumentResetKey = () => {
            const el = document.getElementById('reset-view');
            el.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                const t = performance.now();
                requestAnimationFrame(() => {
                  window.__benchmarkData.resetKeyLatency = performance.now() - t;
                });
              }
            }, { once: true });
          };
          window.__instrumentResetClick = () => {
            const el = document.getElementById('reset-view');
            el.addEventListener('click', () => {
              const t = performance.now();
              requestAnimationFrame(() => {
                window.__benchmarkData.resetClickLatency = performance.now() - t;
              });
            }, { once: true });
          };
          window.__instrumentResetTap = () => {
            const el = document.getElementById('reset-view');
            el.addEventListener('touchend', () => {
              const t = performance.now();
              requestAnimationFrame(() => {
                window.__benchmarkData.resetTapLatency = performance.now() - t;
              });
            }, { once: true });
          };
        });

        const step0Time = performance.now();
        await selector.selectOption(FORCE_MODE);

        await expect.poll(async () => {
          const state = await page.evaluate(() => window.__hexWorldTest.getState());
          return state.busy;
        }, { timeout: POLL_TIMEOUT }).toBe(true);
        startupTimes.push(performance.now() - step0Time);

        await page.evaluate(() => window.__instrumentTabResponse());
        await selector.focus();
        await page.keyboard.press('Tab');

        await expect.poll(async () => {
          const state = await page.evaluate(() => window.__hexWorldTest.getState());
          return state.busy;
        }, { timeout: POLL_TIMEOUT }).toBe(false);
        buildTimes.push(performance.now() - step0Time);

        const tabLatency = await page.evaluate(() => window.__benchmarkData.tabLatency);
        if (tabLatency !== null) tabLatencies.push(tabLatency);

        await page.evaluate(() => {
          if (window.__cadenceObserver) window.__cadenceObserver.disconnect();
        });
        const cadenceTs = await page.evaluate(() => window.__cadenceTimestamps);
        allCadenceTimestamps.push(...cadenceTs);

        await page.evaluate(() => window.__startPostCommitTracking());
        await page.waitForTimeout(FRAME_COLLECT_MS);
        await page.evaluate(() => window.__stopPostCommitTracking());
        const deltas = await page.evaluate(() => window.__benchmarkData.frameDeltas);
        allFrameDeltas.push(...deltas);

        await page.evaluate(() => window.__instrumentResetKey());
        const resetBtn = page.locator('#reset-view');
        await resetBtn.focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(50);
        const rk = await page.evaluate(() => window.__benchmarkData.resetKeyLatency);
        if (rk !== null) resetKeyLatencies.push(rk);

        await page.evaluate(() => window.__instrumentResetClick());
        await resetBtn.click();
        await page.waitForTimeout(50);
        const rc = await page.evaluate(() => window.__benchmarkData.resetClickLatency);
        if (rc !== null) resetClickLatencies.push(rc);

        const hasTouch = await page.evaluate(() => 'ontouchstart' in window);
        if (hasTouch) {
          await page.evaluate(() => window.__instrumentResetTap());
          await resetBtn.tap();
          await page.waitForTimeout(50);
          const rt = await page.evaluate(() => window.__benchmarkData.resetTapLatency);
          if (rt !== null) resetTapLatencies.push(rt);
        }

        if (run < MEASURED_RUNS - 1) {
          await resetToPacked(page, selector);
        }
      }

      const p95BuildTime = calculateNearestRankP95(buildTimes);
      const p95StartupTime = calculateNearestRankP95(startupTimes);
      const p95TabLatency = tabLatencies.length > 0 ? calculateNearestRankP95(tabLatencies) : 0;
      const p95ResetKey = resetKeyLatencies.length > 0 ? calculateNearestRankP95(resetKeyLatencies) : 0;
      const p95ResetClick = resetClickLatencies.length > 0 ? calculateNearestRankP95(resetClickLatencies) : 0;
      const p95ResetTap = resetTapLatencies.length > 0 ? calculateNearestRankP95(resetTapLatencies) : 0;
      const medianFrameTime = calculateMedian(allFrameDeltas);

      const cadenceGaps = [];
      for (let i = 1; i < allCadenceTimestamps.length; i++) {
        cadenceGaps.push(allCadenceTimestamps[i] - allCadenceTimestamps[i - 1]);
      }
      const gapsUnder = cadenceGaps.filter(g => g <= CADENCE_MAX_GAP_MS).length;
      const cadencePassRate = cadenceGaps.length > 0 ? gapsUnder / cadenceGaps.length : 0;
      const measuredHz = cadenceGaps.length > 0 ? 1000 / calculateMedian(cadenceGaps) : 0;

      console.log(`--- ${f.name} Results ---`);
      console.log(`p95 Build Time: ${p95BuildTime.toFixed(2)} ms (limit: ${f.threshold})`);
      console.log(`p95 Startup Time: ${p95StartupTime.toFixed(2)} ms (limit: ${STARTUP_MAX_MS})`);
      console.log(`p95 Tab Latency: ${p95TabLatency.toFixed(2)} ms (limit: ${INTERACTION_MAX_MS})`);
      console.log(`p95 Reset Key: ${p95ResetKey.toFixed(2)} ms (limit: ${INTERACTION_MAX_MS})`);
      console.log(`p95 Reset Click: ${p95ResetClick.toFixed(2)} ms (limit: ${INTERACTION_MAX_MS})`);
      console.log(`p95 Reset Tap: ${p95ResetTap.toFixed(2)} ms (limit: ${INTERACTION_MAX_MS})`);
      console.log(`Median Frame Time: ${medianFrameTime.toFixed(2)} ms (limit: 33.3)`);
      console.log(`Cadence: ${measuredHz.toFixed(1)} Hz, ${(cadencePassRate * 100).toFixed(1)}% gaps <= ${CADENCE_MAX_GAP_MS}ms`);

      expect(p95BuildTime).toBeLessThan(f.threshold);
      expect(p95StartupTime).toBeLessThan(STARTUP_MAX_MS);
      expect(p95TabLatency).toBeLessThan(INTERACTION_MAX_MS);
      expect(p95ResetKey).toBeLessThan(INTERACTION_MAX_MS);
      expect(p95ResetClick).toBeLessThan(INTERACTION_MAX_MS);
      expect(p95ResetTap).toBeLessThan(INTERACTION_MAX_MS);
      expect(medianFrameTime).toBeLessThan(33.3);
      expect(measuredHz).toBeGreaterThanOrEqual(CADENCE_MIN_HZ);
      expect(cadencePassRate).toBeGreaterThanOrEqual(CADENCE_MIN_PASS_RATE);
    });
  }
});
