# Chromium Mobile Emulation Validation

**Date**: 2026-08-03
**Playwright**: 1.61.1
**Chromium**: HeadlessChrome/136.0.7103.25

## Profile Settings

### Phone (phone-chromium)

| Setting | Value |
|---|---|
| viewport.width | 360 |
| viewport.height | 800 |
| deviceScaleFactor | 1 |
| isMobile | true |
| hasTouch | true |

### Tablet (tablet-chromium)

| Setting | Value |
|---|---|
| viewport.width | 768 |
| viewport.height | 1024 |
| deviceScaleFactor | 1 |
| isMobile | true |
| hasTouch | true |

## Touch Capability Evidence

| Test | Phone | Tablet | Details |
|---|---|---|---|
| `supports touch selection where the project provides touch input` | PASS | PASS | Both phone and tablet profiles have `hasTouch=true`. `selector.tap()` dispatched, force-anchors selected and committed successfully. |

## Viewport Evidence

| Test | Phone | Tablet | Details |
|---|---|---|---|
| `asserts detected browser and Playwright profile settings per project` | PASS | PASS | `window.innerWidth` matches profile viewport. `visualViewport.width` matches. `devicePixelRatio` matches profile dpr. `isMobile=true`, `hasTouch=true` confirmed in project use. |

| Test | Phone | Tablet | Details |
|---|---|---|---|
| `keeps controls reachable at project boundaries and short viewports` | PASS | TIMEOUT | Phone: `#layout-algorithm` and `.generate-button` reachable at 360x800 and 360x568. Tablet: timed out during force layout at short viewport (768x600). |

## Reduced Motion

| Test | Phone | Tablet | Details |
|---|---|---|---|
| `commits a static result when reduced motion is requested` | PASS | PASS | Both profiles: force-anchors committed converged result with `diagnostics.converged=true`. `activeRootId` stable after 300ms. |

## Browser-Semantic

| Test | Phone | Tablet | Details |
|---|---|---|---|
| `offers force anchors with associated explanatory and live status semantics` | PASS | PASS | ARIA `role="status"`, `aria-live="polite"`, `aria-describedby` all present and correct. |
| `commits only the latest request` | PASS | PASS | Latest layout (flat) committed; stale force result prevented. |
| `exposes deterministic results across repeated rebuilds` | PASS | PASS | Three force-anchors runs produced identical results across 3 distinct root IDs. |
| `restores legacy layouts without stale springs or duplicate roots` | PASS | PASS | Springs removed, `worldChildCount=1`, legacy layouts restored identically. |

## Explicit Non-Native-Evidence Labeling

All mobile results in this document are produced by **Playwright Chromium viewport and touch emulation** on a desktop host. They do **not** represent native Android, iOS, or hardware device behavior. Touch events are emulated via Playwright's `tap()` and `hasTouch` configuration, not from actual digitizer input. Viewport metrics are set by Playwright's device emulation, not by a physical mobile display. These results validate the application's responsive and touch-emulation compatibility, not native mobile performance or behavior.

## Summary

| Category | Phone Pass | Phone Fail | Tablet Pass | Tablet Fail |
|---|---|---|---|---|
| Touch | 1 | 0 | 1 | 0 |
| Viewport | 2 | 0 | 1 | 0 |
| Reduced Motion | 1 | 0 | 1 | 0 |
| Browser-Semantic | 4 | 0 | 4 | 0 |
| Responsive | 1 | 0 | 0 | 1 |
