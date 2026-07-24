import { expect, test } from 'playwright/test';
import {
  buildRepresentativeHierarchy,
  buildCurrentMaximumHierarchy,
  buildStructuralMaximumHierarchy
} from './fixtures/hierarchies.js';

const FORCE_MODE = 'force-anchors';

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

test.describe('Force-Directed Layout Performance Benchmark', { tag: ['@benchmark'] }, () => {
  const fixtures = [
    { name: 'Representative (1200 leaves)', builder: buildRepresentativeHierarchy, threshold: 2000 },
    { name: 'Current Maximum (4800 leaves)', builder: buildCurrentMaximumHierarchy, threshold: 8000 },
    { name: 'Structural Maximum (4800 leaves)', builder: buildStructuralMaximumHierarchy, threshold: 8000 }
  ];

  for (const f of fixtures) {
    test(f.name, async ({ page }) => {
      test.setTimeout(600000); // 10 minutes max
      await openApp(page);

      const selector = page.locator('#layout-algorithm');

      // 1. Warmups (2 times)
      for (let w = 0; w < 2; w++) {
        await page.evaluate((entities) => {
          window.__hexWorldTest.configureNextRequest({ entities });
        }, f.builder());
        await selector.selectOption(FORCE_MODE);
        // Wait for busy -> completed
        await expect.poll(async () => {
          const state = await page.evaluate(() => window.__hexWorldTest.getState());
          return state.busy;
        }, { timeout: 60000 }).toBe(true);
        await expect.poll(async () => {
          const state = await page.evaluate(() => window.__hexWorldTest.getState());
          return state.busy;
        }, { timeout: 60000 }).toBe(false);

        // Reset to legacy packed layout
        await selector.selectOption('packed');
        await expect.poll(async () => {
          const state = await page.evaluate(() => window.__hexWorldTest.getState());
          return state.busy;
        }, { timeout: 60000 }).toBe(false);
      }

      // 2. Measured runs (3 times — reduced from 10 for slow hardware; p95 = rank 3)
      const buildTimes = [];
      const tabLatencies = [];
      const allFrameDeltas = [];

      for (let run = 0; run < 3; run++) {
        // Setup request parameters
        await page.evaluate((entities) => {
          window.__hexWorldTest.configureNextRequest({ entities });
        }, f.builder());

        // Setup page instrumentation for requestAnimationFrame measuring
        await page.evaluate(() => {
          window.__benchmarkData = {
            frameDeltas: [],
            tabStart: null,
            tabLatency: null,
            lastFrameTime: performance.now()
          };
          
          // Track post-commit animation frames
          function tick() {
            const now = performance.now();
            window.__benchmarkData.frameDeltas.push(now - window.__benchmarkData.lastFrameTime);
            window.__benchmarkData.lastFrameTime = now;
            window.__benchmarkFrameId = requestAnimationFrame(tick);
          }
          window.__startPostCommitTracking = () => {
            window.__benchmarkData.lastFrameTime = performance.now();
            tick();
          };
          window.__stopPostCommitTracking = () => {
            cancelAnimationFrame(window.__benchmarkFrameId);
          };

          // Control response Tab latency instrumentation
          window.__instrumentTabResponse = () => {
            const el = document.getElementById('layout-algorithm');
            el.addEventListener('keydown', (e) => {
              if (e.key === 'Tab') {
                const keydownTime = performance.now();
                requestAnimationFrame(() => {
                  const frameTime = performance.now();
                  window.__benchmarkData.tabLatency = frameTime - keydownTime;
                });
              }
            }, { once: true });
          };
        });

        const startTime = performance.now();
        await selector.selectOption(FORCE_MODE);
        
        // Setup Tab instrumentation once selector focused and busy begins
        await page.evaluate(() => window.__instrumentTabResponse());

        // Press Tab once when busy begins
        await selector.focus();
        await page.keyboard.press('Tab');

        // Wait for calculation and commit to complete
        await expect.poll(async () => {
          const state = await page.evaluate(() => window.__hexWorldTest.getState());
          return state.busy;
        }, { timeout: 60000 }).toBe(false);

        const endTime = performance.now();
        buildTimes.push(endTime - startTime);

        // Fetch Tab latency
        const latency = await page.evaluate(() => window.__benchmarkData.tabLatency);
        if (latency !== null) {
          tabLatencies.push(latency);
        }

        // Track post-commit frames for 5 seconds
        await page.evaluate(() => window.__startPostCommitTracking());
        await page.waitForTimeout(5000);
        await page.evaluate(() => window.__stopPostCommitTracking());

        const deltas = await page.evaluate(() => window.__benchmarkData.frameDeltas);
        allFrameDeltas.push(...deltas);

        // Reset to packed mode before next run
        await selector.selectOption('packed');
        await expect.poll(async () => {
          const state = await page.evaluate(() => window.__hexWorldTest.getState());
          return state.busy;
        }, { timeout: 60000 }).toBe(false);
      }

      const p95BuildTime = calculateNearestRankP95(buildTimes);
      const p95TabLatency = calculateNearestRankP95(tabLatencies);
      const medianFrameTime = calculateMedian(allFrameDeltas);

      console.log(`--- ${f.name} Results ---`);
      console.log(`p95 Build Time: ${p95BuildTime.toFixed(2)} ms`);
      console.log(`p95 Tab Latency: ${p95TabLatency.toFixed(2)} ms`);
      console.log(`Median Frame Time: ${medianFrameTime.toFixed(2)} ms`);

      // Check assertions
      expect(p95BuildTime).toBeLessThan(f.threshold);
      expect(p95TabLatency).toBeLessThan(100);
      expect(medianFrameTime).toBeLessThan(33.3);
    });
  }
});
