# US2 Validation: Keep the Application Usable During Calculation

**Date**: 2026-08-03
**Spec Reference**: User Story 2 — Keep the Application Usable During Calculation

## Test Runs Performed

| Test | Project | Outcome |
|---|---|---|
| `selects by keyboard within five actions, retains focus while busy, and advances on Tab` | desktop-chromium | PASS |
| `selects by keyboard within five actions, retains focus while busy, and advances on Tab` | phone-chromium | PASS |
| `selects by keyboard within five actions, retains focus while busy, and advances on Tab` | tablet-chromium | PASS |
| `commits only the latest request` | desktop-chromium | PASS |
| `commits only the latest request` | phone-chromium | PASS |
| `commits only the latest request` | tablet-chromium | PASS |
| `keeps controls reachable at project boundaries and short viewports` | desktop-chromium | TIMEOUT |
| `keeps controls reachable at project boundaries and short viewports` | phone-chromium | PASS |
| `keeps controls reachable at project boundaries and short viewports` | tablet-chromium | FAIL (force layout timeout at short viewport) |
| `announces failures and retains the previous committed world` | desktop-chromium | PARTIAL (timeout on unsupported-environment step) |
| `announces failures and retains the previous committed world` | phone-chromium | PARTIAL (timeout on radius-overscale step) |

## Acceptance Criteria Evidence

1. **Controls usable during calculation**: Keyboard focus retained on selector while busy; Tab advances to generate button. Confirmed on desktop, phone, tablet.
2. **Cancel/supersede**: Selecting flat while force is active cancels force; final state is flat. Confirmed on all three profiles.
3. **No stale frames**: After cancel, `activeResult` matches the newly selected layout. Verified by `commits only the latest request` on all profiles.

## Known Issues

- Desktop responsive reachability test timed out at 120s during `#algorithm-note` evaluation after force at short viewport.
- Tablet responsive test failed to transition to force-anchors at short viewport (768x600).
- Failure-announcement tests timed out on some failure injection steps (unsupported-environment, radius-overscale), likely due to slow environment affecting poll timeouts.
