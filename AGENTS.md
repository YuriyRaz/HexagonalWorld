# Agent Instructions

## Build and Verify

```bash
npm install
npm run dev
npm run build
```

Use `npm run build` as the minimum verification for every change. Do not edit generated files in `dist/` or dependencies in `node_modules/`.

## Development Guidelines

- Keep data modeling, hexagonal layout, Three.js rendering, and UI interaction separate as the application grows.
- Model arbitrary hierarchies with stable entity IDs and explicit parent-child relationships; do not couple the scene to one business domain.
- Keep rendering deterministic for the same input data and centralize visual mappings such as depth, height, color, and grouping.
- Avoid per-frame object allocation. Reuse Three.js vectors, geometries, and materials where practical, and dispose GPU resources when replacing them.
- Preserve responsive behavior, keyboard accessibility, semantic HTML, and reduced-motion preferences for UI changes.
- Prefer small, focused changes and existing project patterns over new dependencies or abstractions.
- Never commit secrets, local environment files, build output, or editor-specific state.
