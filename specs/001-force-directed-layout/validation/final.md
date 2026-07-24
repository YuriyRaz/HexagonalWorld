# Final Release Validation Matrix

This file documents the final gate acceptance tests and release compatibility verification across the 6 prescribed Chrome/Blink engine-device combinations.

## Final Release Compatibility Matrix (6 Rows - Chrome Only)

| Row | Product/Engine | Device Class | Target OS/Device | Viewport (CSS px) | Input Mode | WebGL 2 | Module-Worker | Primary Scenario | Camera/Probe | Certification Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Google Chrome (current) | Desktop | Windows 10 (Local) | 1024x720 | Keyboard/Pointer | Pass | Pass | Pass | Pass | **PASSED** (Local Chrome v150.0.7871.129) |
| 2 | Google Chrome (current) | Phone | Android Phone | 360x800 | Touch | - | - | - | - | **BLOCKED**: No physical Android phone or emulator |
| 3 | Google Chrome (current) | Tablet | Android Tablet | 768x1024 | Touch/Pointer | - | - | - | - | **BLOCKED**: No physical Android tablet or emulator |
| 4 | Google Chrome (previous) | Desktop | Windows 10 | 1024x720 | Keyboard/Pointer | - | - | - | - | **BLOCKED**: Older Chrome versions unavailable |
| 5 | Google Chrome (previous) | Phone | Android Phone | 360x800 | Touch | - | - | - | - | **BLOCKED**: No physical Android phone or emulator |
| 6 | Google Chrome (previous) | Tablet | Android Tablet | 768x1024 | Touch/Pointer | - | - | - | - | **BLOCKED**: No physical Android tablet or emulator |

## Locally Feasible Quickstart Validation (T077)

- Command: `npm test`
  - Result: 99/99 passed
- Command: `npm run build`
  - Result: Passed with normal chunk-size warning
- Command: `npm run test:e2e -- --project=desktop-chromium`
  - Result: 9/9 passed (app.spec.js + resource-profile.spec.js)
- Command: `npm run benchmark:layout`
  - Result: **Not executed** — machine too slow for 12 runs × 3 fixtures; each force-layout commit exceeds 30s on this hardware
- Build ID: Chrome v150.0.7871.129, Node v22.16.0, Playwright 1.61.1
- Unresolved limitations: Benchmark thresholds (2s/8s) not validated locally due to hardware constraints; physical Android devices unavailable
