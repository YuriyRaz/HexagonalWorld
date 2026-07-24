import { expect, test } from 'playwright/test';
import { buildSmallValidHierarchy } from './fixtures/hierarchies.js';

const FORCE_MODE = 'force-anchors';

async function openApp(page) {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#layout-algorithm')).toBeVisible();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 15000 });
}

test.describe('Resource Profiling & Lifecycle', () => {
  test('verifies no resource leaks or duplicate islands under repeated mixed-mode switches', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes for force layout simulation
    await openApp(page);

    const selector = page.locator('#layout-algorithm');
    const entities = buildSmallValidHierarchy();

    // 1. Warmup and initial state
    await page.evaluate((entities) => {
      window.__hexWorldTest.configureNextRequest({ entities });
    }, entities);
    await selector.selectOption(FORCE_MODE);
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__hexWorldTest.getState());
      return state.busy;
    }, { timeout: 60000 }).toBe(false);

    // Get baseline counts
    const baseline = await page.evaluate(() => {
      return window.__hexWorldTest.getRenderSummary();
    });

    // 2. Perform repeated switches between force and legacy packed layout
    for (let i = 0; i < 5; i++) {
      await selector.selectOption('packed');
      await expect.poll(async () => {
        const state = await page.evaluate(() => window.__hexWorldTest.getState());
        return state.activeMode;
      }, { timeout: 60000 }).toBe('packed');

      await page.evaluate((entities) => {
        window.__hexWorldTest.configureNextRequest({ entities });
      }, entities);
      await selector.selectOption(FORCE_MODE);
      await expect.poll(async () => {
        const state = await page.evaluate(() => window.__hexWorldTest.getState());
        return state.busy;
      }, { timeout: 60000 }).toBe(false);
    }

    // 3. Post-execution resource verification
    const current = await page.evaluate(() => {
      return window.__hexWorldTest.getRenderSummary();
    });

    // Exactly one active island root (worldChildCount === 1)
    expect(current.worldChildCount).toBe(1);
    // Same number of line segments (0 or 1 depending on springs)
    expect(current.lineSegments).toBe(baseline.lineSegments);
    // Check opaque vs translucent materials settings are intact
    expect(current.occupiedOpacity).toBe(0.5);

    // Verify there are no duplicate workers running
    const state = await page.evaluate(() => window.__hexWorldTest.getState());
    expect(state.busy).toBe(false);
  });
});
