# Quickstart: Validate Realtime Force Simulation

## Prerequisites

- Node.js 20.19+ or 22.12+
- `npm install`
- Playwright's locally installed Chromium browser
- Existing desktop, 360x800 phone touch-emulation, 768x1024 tablet touch-emulation, and benchmark projects from `playwright.config.js`

## References

- [Data model](./data-model.md)
- [Force session contract](./contracts/force-session-contract.md)
- [Worker/runner protocol](./contracts/worker-protocol.md)
- [Render transaction](./contracts/render-contract.md)

## 1. Pure Contracts

```bash
npm test
```

Expected outcomes:

- Every leaf owns one unique target from step 0 through every assignment epoch.
- Assignments change deterministically and influence the following force tick without teleporting towers.
- Leaves and anchors repel; fixing a leaf moves at least one neighbor.
- Center lock occurs in numbered ticks; terminal node, target center, frame, placement, tower, and spring source agree.
- Serialization performs no final assignment or coordinate mutation.
- No-command and accepted-command-transcript runs are deterministic.
- Initial success retains one idle worker; controls, later epochs, and all cleanup paths satisfy contracts.

## 2. Manual Force Evolution

```bash
npm run dev
```

Open the locally available development browser and select force-directed mode.

Expected outcomes:

- Step 0 and every later normal-motion step appear contiguously.
- Towers and springs move continuously; assignment changes do not cause a rendering jump.
- Progress shows global/cooling steps, assignment stability, and convergence streak.
- Terminal towers are already centered in unique cells before completion.
- Stable scene replacement does not move a tower or leaf spring endpoint.
- Existing click selection and camera drag/touch behavior remain unchanged; no tower drag exists.

## 3. Retained Session Test Seam

After an initial stable commit, use the test API rather than a UI gesture to submit valid and invalid fix/release controls.

Expected outcomes:

- Exactly one worker is retained, with zero autonomous ticks/messages/timer while idle.
- Commands are rejected before scene commit confirmation and accepted afterward.
- First fixation starts a new epoch, reheats, resets convergence, and keeps global steps contiguous.
- Each held command boundary produces one neighbor-updating tick without consuming cooling budget.
- Final release starts cooling step 1 with a fresh 256-step/active-time budget.
- Epoch settlement produces an exact-center result and returns to retained idle after commit confirmation.
- No command is exposed through current pointer, touch, keyboard, or accessibility UI.

## 4. Retained Lifecycle

Exercise mode switch, force rebuild, data regeneration, newer request, simulated commit failure, worker error, and page teardown.

Expected outcomes:

- Each path releases the retained worker, listeners, buffers, command/epoch deferreds, and full-precision state exactly once.
- Late frames/controls cannot affect the replacement world.
- A worker error after stable commit leaves the committed world visible but disables retained control capability.
- Repeated settle/rebuild/switch cycles show no worker/GPU/listener growth.

## 5. Reduced Motion And Hidden Tabs

Enable reduced motion before a run and during a test interaction epoch; also hide/restore a normal-motion tab with one frame outstanding.

Expected outcomes:

- Reduced calculation uses identical assignments/convergence/result without intermediate visual steps.
- Mid-epoch suppression restores stable rollback content until the epoch commits.
- New epochs resample current motion preference.
- Hidden playback resumes the exact frame with no catch-up, false timeout, or missing step.

## 6. Local Chromium Validation

```bash
npm run test:e2e
```

The existing Playwright projects run desktop, 360x800 phone touch-emulation, and 768x1024 tablet touch-emulation profiles in local Chromium. Mobile-profile evidence covers responsive layout, touch event paths, browser semantics, and reduced motion only; it does not establish Android browser, OS, hardware, performance, or native assistive-technology acceptance.

Validate contiguous geometry, exact terminal equality, current gesture regressions, progress/accessibility, reduced motion, retained-worker ownership, and every release path.

## 7. Performance

```bash
npm run benchmark:layout
```

Blocking evidence:

- Step 0/status <=1,000 ms at 1,200 towers and <=2,000 ms at 4,800 towers.
- Representative normal-motion trace has >=5 steps/sec and >=95% gaps <=200 ms.
- Ten desktop-keyboard, ten desktop-pointer, and ten Playwright emulated-phone-touch samples each have local-host nearest-rank p95 <=100 ms.
- Full completion p95 <=2,000 ms/8,000 ms and post-commit median frame <=33.3 ms.
- Retained idle emits zero ticks/messages/timers; repeated lifecycle cycles do not grow active resources.

Profile failed worker tick, assignment epoch, transport, matrix/spring application, render, input, or retained lifecycle phase before adding optimization. Never skip steps, weaken assignment/equality, or coalesce accepted controls to pass timing.

## 8. Final Gate

After benchmark remediation and usability validation:

```bash
npm test
npm run test:e2e
npm run benchmark:layout
npm run build
```

Native Android validation is outside scope. Mobile-emulation evidence must remain labeled as local Chromium viewport/touch emulation. Record the existing Vite chunk warning separately.
