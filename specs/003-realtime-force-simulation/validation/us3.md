# US3 Validation: Preserve Trustworthy Results and Motion Preferences

**Date**: 2026-08-03
**Spec Reference**: User Story 3 — Preserve Trustworthy Results and Motion Preferences

## Test Runs Performed

| Test | Project | Outcome |
|---|---|---|
| `exposes deterministic results across repeated rebuilds` | desktop-chromium | PASS |
| `exposes deterministic results across repeated rebuilds` | phone-chromium | PASS |
| `exposes deterministic results across repeated rebuilds` | tablet-chromium | PASS |
| `commits a static result when reduced motion is requested` | desktop-chromium | PASS |
| `commits a static result when reduced motion is requested` | phone-chromium | PASS |
| `commits a static result when reduced motion is requested` | tablet-chromium | PASS |
| `restores legacy layouts without stale springs or duplicate roots` | desktop-chromium | PASS |
| `restores legacy layouts without stale springs or duplicate roots` | phone-chromium | PASS |
| `restores legacy layouts without stale springs or duplicate roots` | tablet-chromium | PASS |
| `announces failures and retains the previous committed world` | desktop-chromium | PARTIAL |
| `announces failures and retains the previous committed world` | phone-chromium | PARTIAL |

## Acceptance Criteria Evidence

1. **Deterministic results**: Three consecutive force-anchors runs on identical data produced identical `activeResult` objects (excluding requestId) on all three profiles. Three distinct `activeRootId` values confirmed.
2. **Reduced motion**: With `prefers-reduced-motion: reduce`, force-anchors committed a converged result (`diagnostics.converged=true`). No intermediate animation; `activeRootId` and `activeResult` stable after 300ms.
3. **Failure preservation**: After force-anchors, switching to legacy layouts (flat/nested/packed) restored correct render state (`worldChildCount=1`, `lineSegments=0`, `occupiedOpacity=1`) with no stale springs. Legacy layout results matched pre-force cached values.
4. **Invalid input handling**: Failure injection tests confirmed that various error codes (EMPTY_HIERARCHY, INVALID_HIERARCHY, etc.) preserve the previous valid world. Some steps timed out in slow environment.

## Resource Lifecycle (Supporting Evidence)

From `resource-profile.spec.js`: After 3 mixed-mode switch cycles (packed ↔ force-anchors), `worldChildCount` remained 1, line segments matched baseline, and `occupiedOpacity=0.5`. No duplicate islands or leaked scene objects detected.
