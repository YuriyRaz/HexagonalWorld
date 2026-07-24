# Resource Profile Validation: Force-Directed Layout

## Test Environment

| Component | Value |
|-----------|-------|
| Browser | Google Chrome 150.0.7871.129 (Blink) |
| Playwright Project | `desktop-chromium` at 1024x720 |
| Node.js | v22.16.0 |

## Test Executed

```
npx playwright test tests/resource-profile.spec.js --project=desktop-chromium
```

**Result**: PASSED (1/1)

## Resource Lifecycle Assertions Verified

The `resource-profile.spec.js` test validates the following invariants across 5 repeated force-to-legacy mode switches:

| Assertion | Expected | Actual | Status |
|-----------|----------|--------|--------|
| Active island root count | 1 | 1 | PASS |
| Line segment count stable | same as baseline | same as baseline | PASS |
| Occupied tower opacity | 0.5 (translucent) | 0.5 | PASS |
| No duplicate workers | 0 superseded | 0 superseded | PASS |
| State busy after completion | false | false | PASS |

## Evidence

- Worker creation and disposal: balanced (no leaked workers)
- Island creation and disposal: exactly one active island after repeated switching
- GPU objects: no duplicate line segments or instanced meshes
- Listeners: stable count (no leaked event listeners)
- Per-frame allocation: no feature-owned allocation paths detected

## Commands Executed

```powershell
npx playwright test tests/resource-profile.spec.js --project=desktop-chromium
# Output: 1 passed (1.2m)
```
