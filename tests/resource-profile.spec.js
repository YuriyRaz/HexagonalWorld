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
    test.setTimeout(120000);
    await openApp(page);

    const selector = page.locator('#layout-algorithm');
    const entities = buildSmallValidHierarchy();

    await page.evaluate((entities) => {
      window.__hexWorldTest.configureNextRequest({ entities });
    }, entities);
    await selector.selectOption(FORCE_MODE);
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__hexWorldTest.getState());
      return state.busy;
    }, { timeout: 60000 }).toBe(false);

    const baseline = await page.evaluate(() => {
      return window.__hexWorldTest.getRenderSummary();
    });

    for (let i = 0; i < 3; i++) {
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

    expect(current.worldChildCount).toBe(1);
    expect(current.lineSegments).toBe(baseline.lineSegments);
    expect(current.occupiedOpacity).toBe(0.5);

    const state = await page.evaluate(() => window.__hexWorldTest.getState());
    expect(state.busy).toBe(false);
  });

  test('reports real worker, timer, and listener diagnostics after force-anchors layout', async ({ page }) => {
    test.setTimeout(120000);
    await openApp(page);

    const selector = page.locator('#layout-algorithm');
    const entities = buildSmallValidHierarchy();

    // Switch to force-anchors and wait for layout
    await page.evaluate((entities) => {
      window.__hexWorldTest.configureNextRequest({ entities });
    }, entities);
    await selector.selectOption(FORCE_MODE);
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__hexWorldTest.getState());
      return state.busy;
    }, { timeout: 60000 }).toBe(false);

    // Verify diagnostics after force-anchors layout
    const diagnostics = await page.evaluate(() => window.__hexWorldTest.getDiagnostics());
    expect(diagnostics.workerMessages).toBeGreaterThan(0);
    expect(diagnostics.activeTimers).toBe(0);
    expect(diagnostics.listenerCounts.total).toBeGreaterThan(0);
    expect(diagnostics.rootCount).toBe(1);
    expect(diagnostics.state).toBe('retained-settled');

    // Run another layout and verify resource growth
    await page.evaluate((entities) => {
      window.__hexWorldTest.configureNextRequest({ entities });
    }, entities);
    await selector.selectOption(FORCE_MODE);
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.__hexWorldTest.getState());
      return state.busy;
    }, { timeout: 60000 }).toBe(false);

    const afterSecond = await page.evaluate(() => window.__hexWorldTest.getDiagnostics());
    expect(afterSecond.workerMessages).toBeGreaterThanOrEqual(diagnostics.workerMessages);
    expect(afterSecond.activeTimers).toBe(0);
    expect(afterSecond.rootCount).toBe(1);
  });
});
