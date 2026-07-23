# US3 Validation

## Browser Scenarios

| Project | US3 scenario | Result |
|---|---|---|
| desktop-chromium | force -> flat/nested/packed restoration, retained-world failure, one active root | PASS |
| desktop-firefox | force -> flat/nested/packed restoration, retained-world failure, one active root | PASS |
| desktop-webkit | force -> flat/nested/packed restoration, retained-world failure, one active root | PASS |

Commands:

```text
npx playwright test tests/app.spec.js --project=desktop-chromium --grep "@us3"
npx playwright test tests/app.spec.js --project=desktop-firefox --project=desktop-webkit --grep "@us3"
npx playwright test tests/app.spec.js --project=desktop-chromium
```

Observed invariants:

- Legacy modes contain zero `LineSegments` spring objects.
- Legacy occupied materials restore `opacity: 1`, `transparent: false`, and `depthWrite: true`.
- Force mode contains one spring object with `opacity: 0.5` towers.
- Every committed state contains exactly one world child.
- Legacy placements and statistics remain deterministic across force-to-legacy restoration.
- Invalid hierarchy failures retain the previous root and result.
- Superseded force work is cancelled before legacy synchronous dispatch.

## Unit And Build Checks

| Check | Result |
|---|---|
| `node tests/island.test.js` | 6/6 passed |
| `npm test` | 99/99 passed |
| `npm run build` | Passed; Vite emitted only the existing chunk-size warning |
