# US2 Validation

## Chromium Focused Projects

Command:

```text
npx playwright test tests/app.spec.js --project=visual-desktop-chromium --project=visual-mobile-chromium
```

Environment: Playwright 1.61.1, bundled Chromium 149.0.7827.55.

| Project | Spring contrast | Hover contrast | Selection contrast | Opaque RGB max diff | Result |
|---|---:|---:|---:|---:|---|
| visual-desktop-chromium | 4.1145 | 4.6306 | 4.4578 | 0 | PASS |
| visual-mobile-chromium | 4.1145 | 4.6306 | 4.4578 | 0 | PASS |

Both projects also passed the zero-spring success case, exact camera application, camera restoration, spring status/accessibility assertions, and predefined 5x5 device-pixel probes.

## Object And Build Checks

| Check | Result |
|---|---|
| `node tests/island.test.js` | 5/5 passed |
| `npm test` | 98/98 passed |
| `npm run build` | Passed; Vite emitted only the existing chunk-size warning |
