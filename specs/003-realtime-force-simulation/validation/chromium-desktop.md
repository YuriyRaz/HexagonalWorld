# Chromium Desktop Validation

**Date**: 2026-08-03
**Project**: desktop-chromium
**Viewport**: 1024x720, deviceScaleFactor=1, isMobile=false, hasTouch=false
**Playwright**: 1.61.1
**Chromium**: HeadlessChrome/136.0.7103.25

## Browser/Playwright Version Detection

- `navigator.userAgent` matched `/Chrome\/\d+/` ✓
- Playwright config version: 1.61.1
- Project settings: viewport 1024x720, dpr=1, mobile=false, touch=false

## Keyboard Accessibility

| Test | Outcome | Details |
|---|---|---|
| `selects by keyboard within five actions, retains focus while busy, and advances on Tab` | PASS | Tabbed from `#school-count` to `#layout-algorithm` in ≤4 Tab presses. Focus indicator visible (outline or box-shadow). Pressed End to select force-anchors. Selector remained focused and enabled while busy. Tab advanced focus to `.generate-button`. |

## Pointer Accessibility

| Test | Outcome | Details |
|---|---|---|
| `supports touch selection` | SKIPPED | Desktop project has `hasTouch=false`; test skipped with message "This portable project does not emulate touch input." |

## Responsive Accessibility

| Test | Outcome | Details |
|---|---|---|
| `keeps controls reachable at project boundaries and short viewports` | TIMEOUT | Test timed out at 120s while evaluating `#algorithm-note` reachability after force layout committed at short viewport (1024x600). |

## Reduced Motion

| Test | Outcome | Details |
|---|---|---|
| `commits a static result when reduced motion is requested` | PASS | With `prefers-reduced-motion: reduce`, force-anchors committed a converged result. `activeResult.diagnostics.converged === true`, `busy === false`. After 300ms settling, `activeRootId` and `activeResult` unchanged — no intermediate animation. |

## Gesture-Negative

No gesture-negative tests defined for desktop profile. Touch-based gesture tests are skipped on desktop (hasTouch=false).

## Browser-Semantic

| Test | Outcome | Details |
|---|---|---|
| `offers force anchors with associated explanatory and live status semantics` | PASS | `#layout-status` has `role="status"` and `aria-live="polite"`. `#layout-algorithm` described by `algorithm-note` and `layout-status`. Status announces busy/success states. |
| `commits only the latest request` | PASS | Force started then superseded by flat layout. Final state is flat, no stale force result. |
| `exposes deterministic results across repeated rebuilds` | PASS | Three consecutive force-anchors runs produced identical `activeResult` (excluding requestId). Three distinct `activeRootId` values confirmed. |
| `restores legacy layouts without stale springs or duplicate roots` | PASS | After force-anchors, switching to flat/nested/packed removed springs, restored `worldChildCount=1`, `lineSegments=0`, `occupiedOpacity=1`. |

## Summary

| Category | Pass | Fail | Skip | Timeout |
|---|---|---|---|---|
| Keyboard | 1 | 0 | 0 | 0 |
| Pointer | 0 | 0 | 1 | 0 |
| Responsive | 0 | 0 | 0 | 1 |
| Reduced Motion | 1 | 0 | 0 | 0 |
| Gesture-Negative | 0 | 0 | 0 | 0 |
| Browser-Semantic | 4 | 0 | 0 | 0 |
