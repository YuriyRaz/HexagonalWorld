import { expect, test } from 'playwright/test';
import {
  buildDuplicateIdHierarchy,
  buildSixThousandLinkHierarchy,
  buildSmallValidHierarchy,
  buildVisibilityFixture,
} from './fixtures/hierarchies.js';

const FORCE_MODE = 'force-anchors';
const BUSY_TEXT = /рассчит|вычисл|формир|строим/i;
const SUCCESS_TEXT = /готов|заверш|постро|создан|актив/i;
const RETAINED_TEXT = /не удалось|ошиб|сохран|предыдущ/i;

const DEVICE_PROFILES = {
  desktop: { viewport: { width: 1024, height: 720 }, shortHeight: 600 },
  phone: { viewport: { width: 360, height: 800 }, shortHeight: 568 },
  tablet: { viewport: { width: 768, height: 1024 }, shortHeight: 600 },
};

/*
 * Minimal deterministic browser-test contract expected from the application:
 *
 * window.__hexWorldTest.configureNextRequest({
 *   entities?, delayMs?, hangGuardMs?,
 *   failure?: { code, stage?, details? },
 * })
 *
 * window.__hexWorldTest.getState() -> {
 *   productionHangGuardMs, latestRequestId, requestedMode, activeMode, busy,
 *   lastErrorCode, activeRootId, activeResult
 * }
 *
 * Configuration is consumed by one request. activeRootId changes only on a
 * committed replacement; activeResult is a structured-clone-safe LayoutResult.
 */

async function openApp(page) {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#layout-algorithm')).toBeVisible();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 15_000 });
}

async function expectTestApi(page) {
  const contract = await page.evaluate(() => ({
    exists: typeof window.__hexWorldTest === 'object' && window.__hexWorldTest !== null,
    configure: typeof window.__hexWorldTest?.configureNextRequest,
    state: typeof window.__hexWorldTest?.getState,
  }));

  expect(contract).toEqual({ exists: true, configure: 'function', state: 'function' });
}

async function configureNextRequest(page, configuration) {
  await page.evaluate((value) => window.__hexWorldTest.configureNextRequest(value), configuration);
}

async function getState(page) {
  return page.evaluate(() => window.__hexWorldTest.getState());
}

async function waitForActiveMode(page, mode) {
  await expect.poll(async () => {
    const state = await getState(page);
    return state.busy ? null : state.activeMode;
  }).toBe(mode);
}

async function forceRebuild(page) {
  await page.evaluate(() => window.__hexWorldTest.forceRebuild());
}

async function waitForSuccess(page, mode = FORCE_MODE) {
  await waitForActiveMode(page, mode);
  await expect(page.locator('#layout-status')).toContainText(SUCCESS_TEXT);
}

async function selectForce(page, configuration = {}) {
  await configureNextRequest(page, {
    entities: buildSmallValidHierarchy(),
    ...configuration,
  });
  await page.locator('#layout-algorithm').selectOption(FORCE_MODE);
}

function deterministicResult(state) {
  const { requestId: _requestId, ...result } = state.activeResult;
  return result;
}

async function expectReachable(locator, viewport) {
  const receivesHit = await locator.evaluate((element) => {
    try {
      const r = element.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;

      const isInteractive = ['SELECT', 'INPUT', 'BUTTON', 'A'].includes(element.tagName);
      if (!isInteractive) return true;

      const cx = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
      const cy = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);

      const form = element.closest('.generator-form');
      const originalFormPointerEvents = form ? form.style.pointerEvents : '';
      if (form) {
        form.style.pointerEvents = 'auto';
      }

      const hit = document.elementFromPoint(cx, cy);
      const ok = hit === element || element.contains(hit) || hit?.contains(element) === true;

      if (form) {
        form.style.pointerEvents = originalFormPointerEvents;
      }
      return ok;
    } catch (err) {
      return false;
    }
  });
  expect(receivesHit).toBe(true);
}

test.describe('US1 portable force-directed application', { tag: ['@us1', '@portable'] }, () => {
  test('offers force anchors with associated explanatory and live status semantics', async ({ page }) => {
    await openApp(page);
    await expectTestApi(page);

    const selector = page.locator('#layout-algorithm');
    const forceOption = selector.locator(`option[value="${FORCE_MODE}"]`);
    const status = page.locator('#layout-status');

    await expect(forceOption).toHaveCount(1);
    await expect(forceOption).toContainText(/force|силов/i);
    await expect(selector.locator('option').last()).toHaveAttribute('value', FORCE_MODE);
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toHaveAttribute('aria-live', 'polite');

    const describedBy = (await selector.getAttribute('aria-describedby'))?.split(/\s+/) ?? [];
    expect(describedBy).toEqual(expect.arrayContaining(['algorithm-note', 'layout-status']));

    const state = await getState(page);
    expect(state.productionHangGuardMs).toBe(60_000);

    await selectForce(page, { delayMs: 100 });
    await expect(page.locator('#algorithm-note')).toContainText(/якор/i);
    await expect(page.locator('#algorithm-note')).toContainText(/пружин/i);
    await expect(page.locator('#algorithm-note')).toContainText(/прозрач/i);
  });

  test('selects by keyboard within five actions, retains focus while busy, and advances on Tab', async ({ page }) => {
    await openApp(page);
    await expectTestApi(page);

    const selector = page.locator('#layout-algorithm');
    const form = page.locator('#generator-form');
    const status = page.locator('#layout-status');
    const beforeFocus = await selector.evaluate((element) => {
      const style = getComputedStyle(element);
      return { borderColor: style.borderColor, boxShadow: style.boxShadow };
    });

    await configureNextRequest(page, { entities: buildSmallValidHierarchy(), delayMs: 1500 });
    await page.locator('#school-count').focus();
    for (let action = 0; action < 4; action += 1) await page.keyboard.press('Tab');
    await expect(selector).toBeFocused();

    const focusedStyle = await selector.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });
    const hasOutline = focusedStyle.outlineStyle !== 'none'
      && focusedStyle.outlineWidth > 0
      && focusedStyle.outlineColor !== 'transparent';
    expect(
      hasOutline
      || focusedStyle.boxShadow !== 'none'
      || focusedStyle.borderColor !== beforeFocus.borderColor,
    ).toBe(true);

    await page.keyboard.press('End');
    await expect(selector).toHaveValue(FORCE_MODE);
    await expect(status).toContainText(BUSY_TEXT);
    await expect(form).toHaveAttribute('aria-busy', 'true');
    await expect(selector).toBeEnabled();
    await expect(selector).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.locator('.generate-button')).toBeFocused();
    await waitForSuccess(page);
    await expect(form).not.toHaveAttribute('aria-busy', 'true');
  });

  test('supports touch selection where the project provides touch input', async ({ page }, testInfo) => {
    const hasTouch = testInfo.project.use.hasTouch === true;
    test.skip(!hasTouch, 'This portable project does not emulate touch input.');
    testInfo.annotations.push({ type: 'input', description: 'touch' });

    await openApp(page);
    await expectTestApi(page);
    const selector = page.locator('#layout-algorithm');

    await configureNextRequest(page, { entities: buildSmallValidHierarchy(), delayMs: 80 });
    await selector.tap();
    await selector.selectOption(FORCE_MODE);

    await expect(selector).toHaveValue(FORCE_MODE);
    await waitForSuccess(page);
  });

  test('keeps controls reachable at project boundaries and short viewports', async ({ page }, testInfo) => {
    const deviceClass = testInfo.project.name.split('-')[0];
    const profile = DEVICE_PROFILES[deviceClass];
    expect(profile, `Portable device profile for ${testInfo.project.name}`).toBeTruthy();
    testInfo.annotations.push({ type: 'device-class', description: deviceClass });

    await openApp(page);
    await expectTestApi(page);
    expect(page.viewportSize()).toEqual(profile.viewport);
    await page.waitForTimeout(100);
    await expectReachable(page.locator('#layout-algorithm'), profile.viewport);
    await expectReachable(page.locator('.generate-button'), profile.viewport);

    const shortViewport = { width: profile.viewport.width, height: profile.shortHeight };
    await page.setViewportSize(shortViewport);
    await page.waitForTimeout(200);
    await expectReachable(page.locator('#layout-algorithm'), shortViewport);
    await expectReachable(page.locator('.generate-button'), shortViewport);

    await selectForce(page, { delayMs: 180 });
    await page.waitForTimeout(50);
    await expect(page.locator('#layout-status')).toContainText(BUSY_TEXT);
    await waitForSuccess(page);
    await page.waitForTimeout(800);
    await expectReachable(page.locator('#algorithm-note'), shortViewport);
  });

  test('commits a static result when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page);
    await expectTestApi(page);

    await selectForce(page, { delayMs: 80 });
    await waitForSuccess(page);
    const committed = await getState(page);

    expect(committed.activeResult.mode).toBe(FORCE_MODE);
    expect(committed.activeResult.diagnostics.converged).toBe(true);
    expect(committed.busy).toBe(false);

    await page.waitForTimeout(300);
    const afterSettling = await getState(page);
    expect(afterSettling.activeRootId).toBe(committed.activeRootId);
    expect(afterSettling.activeResult).toEqual(committed.activeResult);
  });

  test('commits only the latest request', async ({ page }) => {
    await openApp(page);
    await expectTestApi(page);
    const selector = page.locator('#layout-algorithm');

    await selectForce(page, { delayMs: 250 });
    await expect(page.locator('#layout-status')).toContainText(BUSY_TEXT);
    await selector.selectOption('flat');
    await waitForSuccess(page, 'flat');

    const latest = await getState(page);
    expect(latest.requestedMode).toBe('flat');
    expect(latest.lastErrorCode).toBeNull();

    await page.waitForTimeout(350);
    const afterStaleResult = await getState(page);
    expect(afterStaleResult.activeRootId).toBe(latest.activeRootId);
    expect(afterStaleResult.activeResult).toEqual(latest.activeResult);
    await expect(selector).toHaveValue('flat');
  });

  test('exposes deterministic results across repeated rebuilds', async ({ page }) => {
    await openApp(page);
    await expectTestApi(page);
    const selector = page.locator('#layout-algorithm');
    const results = [];
    const rootIds = new Set();

    for (let rebuild = 0; rebuild < 3; rebuild += 1) {
      if (rebuild > 0) {
        await selector.selectOption('packed');
        await waitForActiveMode(page, 'packed');
      }
      await selectForce(page);
      await waitForSuccess(page);
      const state = await getState(page);
      results.push(deterministicResult(state));
      rootIds.add(state.activeRootId);
    }

    expect(rootIds.size).toBe(3);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  test('announces failures and retains the previous committed world', async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page);
    await expectTestApi(page);

    const failures = [
      { name: 'empty hierarchy', expectedCode: 'EMPTY_HIERARCHY', configuration: { entities: [] } },
      {
        name: 'invalid hierarchy',
        expectedCode: 'INVALID_HIERARCHY',
        configuration: { entities: buildDuplicateIdHierarchy() },
      },
      {
        name: 'active-link overscale',
        expectedCode: 'UNSUPPORTED_SCALE',
        configuration: { entities: buildSixThousandLinkHierarchy() },
      },
      {
        name: 'radius overscale',
        expectedCode: 'UNSUPPORTED_SCALE',
        configuration: {
          entities: buildSmallValidHierarchy(),
          failure: { code: 'UNSUPPORTED_SCALE', stage: 'result', details: { gridRadius: 257 } },
        },
      },
      {
        name: 'non-finite state',
        expectedCode: 'NON_FINITE_STATE',
        configuration: { failure: { code: 'NON_FINITE_STATE', stage: 'worker' } },
      },
      {
        name: 'assignment invariant',
        expectedCode: 'ASSIGNMENT_INVARIANT',
        configuration: { failure: { code: 'ASSIGNMENT_INVARIANT', stage: 'worker' } },
      },
      {
        name: 'non-convergence',
        expectedCode: 'NOT_CONVERGED',
        configuration: { failure: { code: 'NOT_CONVERGED', stage: 'worker' } },
      },
      {
        name: 'unsupported environment',
        expectedCode: 'UNSUPPORTED_ENVIRONMENT',
        configuration: { failure: { code: 'UNSUPPORTED_ENVIRONMENT', stage: 'preflight' } },
      },
      {
        name: 'worker startup',
        expectedCode: 'WORKER_START_FAILED',
        configuration: { failure: { code: 'WORKER_START_FAILED', stage: 'startup' } },
      },
      {
        name: 'worker message',
        expectedCode: 'WORKER_MESSAGE_FAILED',
        configuration: { failure: { code: 'WORKER_MESSAGE_FAILED', stage: 'message' } },
      },
      {
        name: 'production 60s guard with a controlled 50ms hang',
        expectedCode: 'TIMEOUT',
        configuration: {
          hangGuardMs: 50,
          failure: { code: 'TIMEOUT', stage: 'hang' },
        },
      },
      {
        name: 'WebGL unavailable',
        expectedCode: 'WEBGL_UNAVAILABLE',
        configuration: { failure: { code: 'WEBGL_UNAVAILABLE', stage: 'preflight' } },
      },
      {
        name: 'render failure',
        expectedCode: 'RENDER_FAILED',
        configuration: { failure: { code: 'RENDER_FAILED', stage: 'render' } },
      },
      {
        name: 'internal failure',
        expectedCode: 'INTERNAL_ERROR',
        configuration: { failure: { code: 'INTERNAL_ERROR', stage: 'runner' } },
      },
    ];

    for (const { name, expectedCode, configuration } of failures) {
      await test.step(name, async () => {
        const selector = page.locator('#layout-algorithm');

        const previous = await getState(page);
        await configureNextRequest(page, {
          entities: buildSmallValidHierarchy(),
          ...configuration,
        });
        await forceRebuild(page);

        await expect.poll(async () => (await getState(page)).lastErrorCode).toBe(expectedCode);
        const failed = await getState(page);
        expect(failed.productionHangGuardMs).toBe(60_000);
        expect(failed.busy).toBe(false);
        expect(failed.activeRootId).toBe(previous.activeRootId);
        expect(failed.activeResult).toEqual(previous.activeResult);
        await expect(page.locator('#layout-status')).toContainText(RETAINED_TEXT);
        await expect(selector).toBeEnabled();
      });
    }
  });

  test('supports spring rendering and visual presets under visual projects', { tag: ['@us2', '@visual'] }, async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;
    const isVisual = projectName.startsWith('visual-');
    test.skip(!isVisual, 'This test only runs under visual projects.');

    const isMobile = projectName.includes('mobile');
    const fixture = buildVisibilityFixture();

    await openApp(page);
    await expectTestApi(page);

    // 1. Configure request with visibility fixture
    await configureNextRequest(page, {
      entities: fixture.entities,
      layoutResult: fixture.layoutResult,
    });

    const selector = page.locator('#layout-algorithm');
    await selector.selectOption(FORCE_MODE);
    await waitForSuccess(page);

    // Verify spring status in the UI
    const status = page.locator('#layout-status');
    await expect(status).toContainText(/связей: 4|springs: 4/i);

    const zeroSpringLayoutResult = { ...fixture.layoutResult, springs: [] };
    await configureNextRequest(page, {
      entities: fixture.entities,
      layoutResult: zeroSpringLayoutResult,
    });
    await forceRebuild(page);
    await waitForSuccess(page);
    await expect(status).toContainText(/связей: 0|springs: 0/i);

    await configureNextRequest(page, {
      entities: fixture.entities,
      layoutResult: fixture.layoutResult,
    });
    await forceRebuild(page);
    await waitForSuccess(page);
    await expect(status).toContainText(/связей: 4|springs: 4/i);

    // 2. Camera preset setup
    const originalCamera = await page.evaluate(() => window.__hexWorldTest.getCameraState());

    const cameraPreset = isMobile ? fixture.cameras.mobile : fixture.cameras.desktop;
    const distance = cameraPreset.distance;
    const regions = isMobile ? fixture.probeRegions.mobile : fixture.probeRegions.desktop;

    const target = { x: 3.3, y: 0, z: 0 };
    const elevationRad = 30 * Math.PI / 180;
    const azimuthRad = 32 * Math.PI / 180;

    const dy = distance * Math.sin(elevationRad);
    const hDist = distance * Math.cos(elevationRad);
    const dx = hDist * Math.sin(azimuthRad);
    const dz = hDist * Math.cos(azimuthRad);

    const position = { x: target.x + dx, y: target.y + dy, z: target.z + dz };

    await page.evaluate((state) => window.__hexWorldTest.setCameraState(state), {
      position,
      target,
      fov: 34,
    });
    const appliedCamera = await page.evaluate(() => window.__hexWorldTest.getCameraState());
    expect(appliedCamera.position.x).toBeCloseTo(position.x, 5);
    expect(appliedCamera.position.y).toBeCloseTo(position.y, 5);
    expect(appliedCamera.position.z).toBeCloseTo(position.z, 5);
    expect(appliedCamera.target.x).toBeCloseTo(target.x, 5);
    expect(appliedCamera.target.y).toBeCloseTo(target.y, 5);
    expect(appliedCamera.target.z).toBeCloseTo(target.z, 5);
    expect(appliedCamera.fov).toBeCloseTo(34, 5);

    // Wait for render stabilization
    await page.waitForTimeout(500);

    // Get screen coordinates of the hover and selection targets
    const tileCoords = await page.evaluate((fixture) => {
      const positions = window.__hexWorldTest.getTilePositions();
      const getCoordFor = (entityId) => {
        const pos = positions.find(p => p.entityId === entityId);
        if (!pos) return null;
        return window.__hexWorldTest.projectToScreen(pos.x, pos.y, pos.z);
      };

      const hoverCoords = getCoordFor(fixture.probeEntityIds.hover);
      const selectionCoords = getCoordFor(fixture.probeEntityIds.selection);

      return {
        hover: hoverCoords,
        selection: selectionCoords,
      };
    }, fixture);

    expect(tileCoords.hover).not.toBeNull();
    expect(tileCoords.selection).not.toBeNull();

    // 3. In-browser sequence to avoid heavy image data serialization
    const testResults = await page.evaluate(async (params) => {
      const { regions, tileCoords } = params;
      const canvas = document.querySelector('#world');

      const dispatchPointerEvent = (type, clientX, clientY) => {
        canvas.setPointerCapture = () => {};
        canvas.releasePointerCapture = () => {};
        const event = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'mouse',
          clientX,
          clientY,
          button: 0,
          pointerId: 1,
        });
        canvas.dispatchEvent(event);
      };

      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      const getPixels = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };

      const getPixelAt = (data, x, y) => {
        const idx = (y * canvas.width + x) * 4;
        return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
      };

      const getLuminance = (p) => {
        const lin = (val) => {
          const s = val / 255;
          return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * lin(p.r) + 0.7152 * lin(p.g) + 0.0722 * lin(p.b);
      };

      const getContrast = (p1, p2) => {
        const l1 = getLuminance(p1);
        const l2 = getLuminance(p2);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };

      const checkContrast = (data, testRegion, refRegion) => {
        let maxContrast = 0;
        for (let dy = 0; dy < 5; dy++) {
          for (let dx = 0; dx < 5; dx++) {
            const pTest = getPixelAt(data, testRegion.x + dx, testRegion.y + dy);
            const pRef = getPixelAt(data, refRegion.x + dx, refRegion.y + dy);
            const contrast = getContrast(pTest, pRef);
            if (contrast > maxContrast) {
              maxContrast = contrast;
            }
          }
        }

        return maxContrast;
      };

      // 1. Resting State: springs visible
      dispatchPointerEvent('pointermove', 0, 0);
      await delay(200);
      const dataVisible = getPixels();

      // 2. Resting State: springs hidden
      window.__hexWorldTest.setSpringsVisible(false);
      await delay(200);
      const dataHidden = getPixels();
      // Restore springs visible
      window.__hexWorldTest.setSpringsVisible(true);
      await delay(200);

      // 3. Hover State (hover over the left tile corresponding to hoverRegions)
      dispatchPointerEvent('pointermove', tileCoords.selection.x, tileCoords.selection.y);
      await delay(200);
      const dataHover = getPixels();
      // Clear hover
      dispatchPointerEvent('pointerleave', 0, 0);
      await delay(200);

      // 4. Selection State (click on the right tile corresponding to selectionRegions)
      dispatchPointerEvent('pointermove', tileCoords.hover.x, tileCoords.hover.y);
      await delay(200); // Let updateHover resolve so hoveredTile is set
      dispatchPointerEvent('pointerdown', tileCoords.hover.x, tileCoords.hover.y);
      dispatchPointerEvent('pointerup', tileCoords.hover.x, tileCoords.hover.y);
      await delay(200);
      dispatchPointerEvent('pointermove', 0, 0);
      await delay(200);
      const dataSelection = getPixels();

      // Deselect
      dispatchPointerEvent('pointermove', 0, 0);
      dispatchPointerEvent('pointerdown', 0, 0);
      dispatchPointerEvent('pointerup', 0, 0);
      await delay(200);

      // Occlusion: difference in opaque-occlusion region <= 5 for each channel
      let maxDiff = 0;
      const occlude = regions.opaqueOcclusionRegions[0];
      for (let dy = 0; dy < 5; dy++) {
        for (let dx = 0; dx < 5; dx++) {
          const p1 = getPixelAt(dataVisible, occlude.x + dx, occlude.y + dy);
          const p2 = getPixelAt(dataHidden, occlude.x + dx, occlude.y + dy);
          const diff = Math.max(Math.abs(p1.r - p2.r), Math.abs(p1.g - p2.g), Math.abs(p1.b - p2.b));
          if (diff > maxDiff) maxDiff = diff;
        }
      }

      return {
        springContrast: checkContrast(dataVisible, regions.visibleSpringRegions[0], regions.adjacentBackgroundRegions[0]),
        hoverContrast: checkContrast(dataHover, regions.hoverRegions[0], regions.hoverBackgroundRegions[0]),
        selectionContrast: checkContrast(dataSelection, regions.selectionRegions[0], regions.selectionBackgroundRegions[0]),
        opaqueOcclusionMaxDiff: maxDiff,
      };
    }, { regions, tileCoords });

    // Restore camera state
    await page.evaluate((state) => window.__hexWorldTest.setCameraState(state), originalCamera);
    const restoredCamera = await page.evaluate(() => window.__hexWorldTest.getCameraState());
    expect(restoredCamera.position.x).toBeCloseTo(originalCamera.position.x, 5);
    expect(restoredCamera.position.y).toBeCloseTo(originalCamera.position.y, 5);
    expect(restoredCamera.position.z).toBeCloseTo(originalCamera.position.z, 5);
    expect(restoredCamera.target.x).toBeCloseTo(originalCamera.target.x, 5);
    expect(restoredCamera.target.y).toBeCloseTo(originalCamera.target.y, 5);
    expect(restoredCamera.target.z).toBeCloseTo(originalCamera.target.z, 5);
    expect(restoredCamera.fov).toBeCloseTo(originalCamera.fov, 5);

    expect(testResults.springContrast).toBeGreaterThanOrEqual(3.0);
    expect(testResults.hoverContrast).toBeGreaterThanOrEqual(3.0);
    expect(testResults.selectionContrast).toBeGreaterThanOrEqual(3.0);
    expect(testResults.opaqueOcclusionMaxDiff).toBeLessThanOrEqual(5);
  });
});
