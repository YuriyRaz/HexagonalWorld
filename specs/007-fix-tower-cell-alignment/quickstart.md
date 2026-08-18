# Quickstart: Validate Tower-to-Cell Alignment

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm
- Chromium installed for Playwright (`npx playwright install chromium` when needed)

The expected frame, renderer, and diagnostics behavior is defined in [contracts/alignment-frame-contract.md](./contracts/alignment-frame-contract.md). Entity and state invariants are defined in [data-model.md](./data-model.md).

## Setup

```bash
npm install
```

## Automated Validation

Run deterministic unit and protocol coverage:

```bash
npm test
```

Expected outcomes:

- Every force frame has unique integer `leafCells` matching its assignment hash.
- Tower matrices, instance metadata, leaf spring endpoints, and occupancy all identify the same cells.
- Invalid, stale, duplicate, and out-of-range assignments are rejected before scene mutation.
- Repeated assignment and viewport updates do not grow geometry or material counts.
- Twenty identical runs produce identical assignment revisions and visible centers.

Run the complete portable and visual browser coverage:

```bash
npm run test:e2e
```

The complete gate runs all five projects with one Playwright worker so software-WebGL hosts keep only one Chromium renderer active at a time.

Run the focused alignment scenarios during implementation:

```bash
npx playwright test tests/app.spec.js --workers=1 --project=desktop-chromium --project=phone-chromium --project=tablet-chromium --project=visual-desktop-chromium --project=visual-mobile-chromium --grep @tower-cell-alignment
```

Expected outcomes:

- Flat, nested, packed, and force towers remain centered through camera rotation, pan, zoom/dolly, Reset view, and viewport resize in the desktop, phone, tablet, visual desktop, and visual mobile profiles.
- The visual projects select the focused scenarios because the tower-cell alignment suite also carries the `@visual` tag.
- Rapid layout changes display only the newest request.
- Reduced motion shows no live intermediate force island and commits the same final assignments as normal calculation.
- Keyboard selection remains usable and reports the displayed tower's current cell.

Run visual-profile camera, resize, and orientation checks:

```bash
npx playwright test tests/app.spec.js --workers=1 --project=visual-desktop-chromium --project=visual-mobile-chromium --grep @tower-cell-alignment
```

Expected outcomes:

- Visual desktop and mobile profiles cover the same camera operations and resize checks while using their fixed visibility presets.

Run layout and resource performance checks:

```bash
npm run benchmark:layout
npx playwright test tests/resource-profile.spec.js --project=desktop-chromium
```

The alignment fixture uses 500 towers and approximately 2,000 visible cells. It must preserve valid alignment while targeting 60 visible updates per second, present a settled result within 1 second of receipt, and keep GPU resource counts stable across repeated assignment changes.

### Benchmark Evidence (2026-08-18)

The available machine does not match the approved reference condition, so this run is retained as failing diagnostic evidence rather than acceptance evidence:

- Host: Microsoft Windows 10 Pro 10.0.19045 x64; Intel Core i5-1135G7; 8 logical processors; 31.3 GB RAM.
- Browser: Headless Chrome 149.0.7827.55, Playwright Chromium, 1024x720, DPR 1, module workers enabled.
- WebGL: ANGLE Vulkan with SwiftShader Device (Subzero), software rendering; hardware-accelerated WebGL was unavailable.
- Fixture: 500 rendered leaf Towers and 1,951 total visible cells after two warm-ups.
- Measured window 1: 6.9642 complete visible updates/sec (FAIL, required `>= 60`).
- Result-to-first-aligned-scene latency: 1.5 ms (PASS, required `<= 1,000 ms`).
- Remaining nine windows were not run because the hard per-window update assertion stopped the benchmark immediately, as required.

Acceptance remains blocked until all ten measured windows pass on Windows 11 x64, Intel Core i7-1360P, 32 GB RAM, AC power, hardware-accelerated WebGL, and no throttling.

## Manual Validation

Start the application:

```bash
npm run dev -- --host 127.0.0.1 --port 4174 --strictPort
```

Open `http://127.0.0.1:4174/HexagonalWorld/` and validate:

1. Select each supported layout and inspect towers near the origin and outer grid boundary.
2. In force mode, watch several assignment changes; towers may change cells but must never rest between cells.
3. Confirm each visible tower replaces exactly one grid tile and spring lines meet displayed tower centers.
4. Rotate, pan, zoom, and resize to phone width; world-space alignment must remain unchanged.
5. Switch layouts rapidly; stale towers or occupancy tiles must not reappear.
6. Enable reduced motion in browser or operating-system settings and reload force mode; the previous world must remain until one aligned result appears without intermediate motion.

## Build Gate

```bash
npm run build
```

The feature is not complete unless the build succeeds in addition to the alignment, lifecycle, accessibility, and resource checks above.
