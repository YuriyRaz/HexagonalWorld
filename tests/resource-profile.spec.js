import { expect, test } from 'playwright/test';
import { buildSmallValidHierarchy } from './fixtures/hierarchies.js';

const FORCE_MODE = 'force-anchors';

async function openApp(page) {
  await page.goto('./?testDiagnostics=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#layout-algorithm')).toBeVisible();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 15000 });
}

test.describe('Resource Profiling & Lifecycle', () => {
  test('keeps force grid geometry, material, and mesh counts stable across viewport updates', { tag: ['@tower-cell-alignment'] }, async ({ page }) => {
    await openApp(page);
    const selector = page.locator('#layout-algorithm');
    const entities = buildSmallValidHierarchy();
    await page.evaluate((value) => window.__hexWorldTest.configureNextRequest({ entities: value }), entities);
    await selector.selectOption(FORCE_MODE);
    await expect.poll(() => page.evaluate(() => window.__hexWorldTest.getState().busy), { timeout: 60000 }).toBe(false);
    const before = await page.evaluate(() => window.__hexWorldTest.getAlignmentDiagnostics());
    const trace = await page.evaluate(() => window.__hexWorldTest.forceSession.trace());
    const revisions = trace.filter((frame, index) => index === 0 || frame.assignmentRevision !== trace[index - 1].assignmentRevision);
    expect(revisions.length).toBeGreaterThan(1);
    for (const frame of trace) {
      expect(frame.resourceCounts).toEqual(trace[0].resourceCounts);
      expect(frame.resourceIdentity.occupiedMesh).toBe(trace[0].resourceIdentity.occupiedMesh);
      expect(frame.resourceIdentity.occupiedGeometry).toBe(trace[0].resourceIdentity.occupiedGeometry);
      expect(frame.resourceIdentity.occupiedMaterial).toBe(trace[0].resourceIdentity.occupiedMaterial);
      expect(frame.resourceIdentity.emptyGeometry).toBe(trace[0].resourceIdentity.emptyGeometry);
      expect(frame.resourceIdentity.emptyMaterial).toBe(trace[0].resourceIdentity.emptyMaterial);
    }
    for (let index = 1; index < trace.length; index += 1) {
      if (trace[index].resourceIdentity.emptyMesh !== trace[index - 1].resourceIdentity.emptyMesh) {
        expect(trace[index].gridCapacity).toBeGreaterThan(trace[index - 1].gridCapacity);
      }
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => {
      const camera = window.__hexWorldTest.getCameraState();
      window.__hexWorldTest.setCameraState({ ...camera, position: { x: 35, y: 28, z: 42 } });
    });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__hexWorldTest.getAlignmentDiagnostics());
    expect(after.resourceCounts).toEqual(before.resourceCounts);
    expect(after.towers).toEqual(before.towers);
    expect(after.resourceIdentity.occupiedGeometry).toBe(before.resourceIdentity.occupiedGeometry);
    expect(after.resourceIdentity.occupiedMaterial).toBe(before.resourceIdentity.occupiedMaterial);
    expect(after.resourceIdentity.emptyGeometry).toBe(before.resourceIdentity.emptyGeometry);
    expect(after.resourceIdentity.emptyMaterial).toBe(before.resourceIdentity.emptyMaterial);
  });

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
    await page.waitForTimeout(100);

    const baseline = await page.evaluate(() => {
      return {
        render: window.__hexWorldTest.getRenderSummary(),
        memory: window.__hexWorldTest.getDiagnostics().rendererMemory,
        alignment: window.__hexWorldTest.getAlignmentDiagnostics(),
      };
    });

    for (let i = 0; i < 3; i++) {
      await page.evaluate((entities) => window.__hexWorldTest.configureNextRequest({ entities }), entities);
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
      await page.waitForTimeout(100);
      const forceSnapshot = await page.evaluate(() => ({
        render: window.__hexWorldTest.getRenderSummary(),
        memory: window.__hexWorldTest.getDiagnostics().rendererMemory,
        alignment: window.__hexWorldTest.getAlignmentDiagnostics(),
      }));
      expect(forceSnapshot.render.worldChildCount).toBe(1);
      expect(forceSnapshot.memory).toEqual(baseline.memory);
      expect(forceSnapshot.alignment.resourceCounts).toEqual(baseline.alignment.resourceCounts);
    }

    // 3. Post-execution resource verification
    const current = await page.evaluate(() => {
      return window.__hexWorldTest.getRenderSummary();
    });

    expect(current.worldChildCount).toBe(1);
    expect(current.lineSegments).toBe(baseline.render.lineSegments);
    expect(current.occupiedOpacity).toBe(0.5);

    const state = await page.evaluate(() => window.__hexWorldTest.getState());
    expect(state.busy).toBe(false);

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    const tornDown = await page.evaluate(() => ({
      state: window.__hexWorldTest.getState(),
      render: window.__hexWorldTest.getRenderSummary(),
      diagnostics: window.__hexWorldTest.getDiagnostics(),
    }));
    expect(tornDown.state.activeRootId).toBeNull();
    expect(tornDown.render.worldChildCount).toBe(0);
    expect(tornDown.diagnostics.activeTimers).toBe(0);
    expect(tornDown.diagnostics.rootCount).toBe(0);
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
    await page.evaluate(() => window.__hexWorldTest.forceRebuild());
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
