import { expect, test } from 'playwright/test';
import { arch, cpus, platform, release, totalmem } from 'node:os';

import { buildAlignmentBenchmarkHierarchy } from './fixtures/hierarchies.js';

const WARMUP_RUNS = 2;
const MEASURED_RUNS = 10;
const WINDOW_MS = 5000;
const MIN_UPDATES_PER_SECOND = 60;
const MAX_ALIGNED_LATENCY_MS = 1000;

async function waitForIdle(page, mode) {
  await expect.poll(async () => page.evaluate(() => {
    const state = window.__hexWorldTest.getState();
    return state.busy ? null : state.activeMode;
  }), { timeout: 300000 }).toBe(mode);
}

async function runForce(page, selector, entities) {
  await page.evaluate((value) => window.__hexWorldTest.configureNextRequest({ entities: value }), entities);
  await selector.selectOption('force-anchors');
  await waitForIdle(page, 'force-anchors');
}

test('500-Tower aligned presentation meets every five-second update and settlement budget', { tag: ['@benchmark'] }, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'benchmark-desktop-chromium', 'Reference benchmark evidence is desktop-only.');
  test.setTimeout(600000);
  await page.goto('./?testDiagnostics=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loading')).toBeHidden({ timeout: 15000 });

  const selector = page.locator('#layout-algorithm');
  const entities = buildAlignmentBenchmarkHierarchy();
  for (let run = 0; run < WARMUP_RUNS; run += 1) {
    await runForce(page, selector, entities);
    await selector.selectOption('packed');
    await waitForIdle(page, 'packed');
  }

  const metadata = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      viewport: `${innerWidth}x${innerHeight}`,
      dpr: devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency,
      webglRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      moduleWorker: typeof Worker === 'function',
    };
  });
  metadata.host = {
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? 'unavailable',
    logicalProcessors: cpus().length,
    totalMemoryBytes: totalmem(),
  };
  metadata.referenceCondition = {
    os: 'Windows 11 x64',
    cpu: 'Intel Core i7-1360P',
    memory: '32 GB',
    power: 'AC',
    webgl: 'hardware-accelerated',
    throttling: 'none',
  };
  metadata.matchesDetectableReference = platform() === 'win32'
    && arch() === 'x64'
    && /i7-1360P/i.test(metadata.host.cpu)
    && totalmem() >= 30 * 1024 ** 3
    && !/swiftshader|software/i.test(metadata.webglRenderer);
  testInfo.annotations.push({ type: 'reference-condition', description: JSON.stringify(metadata) });
  console.log(`Benchmark metadata: ${JSON.stringify(metadata)}`);

  const windows = [];
  for (let run = 0; run < MEASURED_RUNS; run += 1) {
    await runForce(page, selector, entities);
    await page.evaluate(() => window.__hexWorldTest.startRenderMeasurement());
    await page.waitForTimeout(WINDOW_MS);
    const final = await page.evaluate(() => ({
      measurement: window.__hexWorldTest.stopRenderMeasurement(),
      diagnostics: window.__hexWorldTest.getDiagnostics(),
      alignment: window.__hexWorldTest.getAlignmentDiagnostics(),
    }));
    const updatesPerSecond = (final.measurement.count - 1) * 1000
      / (final.measurement.lastAt - final.measurement.firstAt);
    const latencyMs = final.diagnostics.firstAlignedSceneLatencyMs;
    const visibleCellCount = final.alignment.towers.length + final.alignment.emptyCellCount;
    const measurement = { run: run + 1, updatesPerSecond, latencyMs, visibleCellCount };
    console.log(`Benchmark window: ${JSON.stringify(measurement)}`);

    expect(final.alignment.towers).toHaveLength(500);
    expect(new Set(final.alignment.occupiedCells).size).toBe(500);
    expect(visibleCellCount).toBe(1951);
    expect(updatesPerSecond).toBeGreaterThanOrEqual(MIN_UPDATES_PER_SECOND);
    expect(latencyMs).toBeLessThanOrEqual(MAX_ALIGNED_LATENCY_MS);
    windows.push(measurement);

    if (run < MEASURED_RUNS - 1) {
      await selector.selectOption('packed');
      await waitForIdle(page, 'packed');
    }
  }

  console.log(JSON.stringify({ metadata, windows }, null, 2));
});
