import { expect, test } from 'playwright/test';

test('verify continuous tower drag movement', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('./?testDiagnostics', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loading')).toBeHidden({ timeout: 20_000 });

  // Fast cooling config
  await page.evaluate(() => {
    const maxCoolingSteps = 32;
    const minimum = 0.001;
    const initial = 1;
    const decay = 1 - Math.pow(minimum / initial, 1 / maxCoolingSteps);

    window.__hexWorldTest.configureNextRequest({
      forceConfig: {
        version: 2,
        seed: 0x5eed003,
        minSteps: 4,
        maxCoolingSteps,
        consecutiveStableSteps: 2,
        assignmentInterval: 2,
        candidateRadius: 3,
        predictionLookahead: 0.75,
        movePenalty: 0.05,
        stableAssignmentEpochs: 1,
        centerLockThresholds: { maxCellSpacing: 0.5, rmsCellSpacing: 0.5 },
        movementThresholds: { maxCellSpacing: 0.5, rmsCellSpacing: 0.5 },
        decisionQuantizationStep: 0.000001,
        anchorOutputQuantizationStep: 0.000001,
        maxGridRadius: 256,
        alphaSchedule: {
          initial,
          target: 0,
          minimum,
          decay,
          resetOnInteractionStart: true,
          resetOnFinalRelease: true,
        },
        velocityDecay: 0.4,
        hexStrength: { mutable: 0.2, stable: 0.45 },
        manyBodyStrength: -18,
        manyBodyTheta: 0.9,
        manyBodyDistanceMin: 0.1,
        manyBodyDistanceMax: 32,
        centerStrength: 0.01,
        linkDistance: 2,
        linkStrength: 0.2,
        linkIterations: 1,
        collideStrength: 1.0,
        collideRadiusMultiplier: 1.0,
      }
    });
  });

  // Select force-anchors algorithm
  await page.locator('#layout-algorithm').selectOption('force-anchors');
  await expect(page.locator('#layout-status')).toContainText('сошлась', { timeout: 45_000 });

  // Find a tower inside viewport
  const targetTower = await page.evaluate(() => {
    const diag = window.__hexWorldTest?.getAlignmentDiagnostics?.();
    if (!diag || !diag.towers || diag.towers.length === 0) return null;
    const THREE = window.__hexWorldTest.THREE;
    const camera = window.__hexWorldTest.camera;
    if (!camera) return null;

    for (const tower of diag.towers) {
      const worldPos = new THREE.Vector3(tower.x + 3.3, 1, tower.z);
      const projected = worldPos.clone().project(camera);
      const screenX = (projected.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-projected.y * 0.5 + 0.5) * window.innerHeight;

      if (screenX > 150 && screenX < window.innerWidth - 150 &&
          screenY > 150 && screenY < window.innerHeight - 150) {
        return {
          entityId: tower.entityId,
          towerX: tower.x,
          towerZ: tower.z,
          screenX,
          screenY,
        };
      }
    }
    return null;
  });

  console.log('Target tower before drag:', targetTower);

  // Perform mouse drag gesture!
  await page.mouse.move(targetTower.screenX, targetTower.screenY);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(targetTower.screenX + 150, targetTower.screenY + 100, { steps: 10 });

  // Wait 200ms during active drag
  await page.waitForTimeout(200);

  const duringDragTower = await page.evaluate((targetId) => {
    const diag = window.__hexWorldTest?.getAlignmentDiagnostics?.();
    return diag?.towers?.find(t => t.entityId === targetId);
  }, targetTower.entityId);

  console.log('Tower position during drag:', duringDragTower ? { x: duringDragTower.x, z: duringDragTower.z } : null);

  await page.mouse.up({ button: 'left' });

  // Check movement during drag
  expect(duringDragTower.x).not.toBe(targetTower.towerX);
});
