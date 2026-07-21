import { expect, test } from 'playwright/test';
import {
  buildDuplicateIdHierarchy,
  buildSixThousandLinkHierarchy,
  buildSmallValidHierarchy,
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
  await expect(page.locator('#loading')).toBeHidden();
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
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();

  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

  const receivesHit = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === element || element.contains(hit) || hit?.contains(element) === true;
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

    await configureNextRequest(page, { entities: buildSmallValidHierarchy(), delayMs: 180 });
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
    await expectReachable(page.locator('#layout-algorithm'), profile.viewport);
    await expectReachable(page.locator('.generate-button'), profile.viewport);

    const shortViewport = { width: profile.viewport.width, height: profile.shortHeight };
    await page.setViewportSize(shortViewport);
    await expectReachable(page.locator('#layout-algorithm'), shortViewport);
    await expectReachable(page.locator('.generate-button'), shortViewport);

    await selectForce(page, { delayMs: 180 });
    await expect(page.locator('#layout-status')).toContainText(BUSY_TEXT);
    await expectReachable(page.locator('#algorithm-note'), shortViewport);
    await expectReachable(page.locator('#layout-status'), shortViewport);
    await waitForSuccess(page);
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
    test.setTimeout(45_000);
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
        await selector.selectOption('packed');
        await waitForActiveMode(page, 'packed');
        const previous = await getState(page);

        await configureNextRequest(page, {
          entities: buildSmallValidHierarchy(),
          ...configuration,
        });
        await selector.selectOption(FORCE_MODE);

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
});
