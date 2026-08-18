# Quickstart Validation Guide: Overlap Prevention

This guide describes how to run and verify that tower overlaps are prevented during the force-directed layout simulation.

## Prerequisites
- Node.js 20.19+ or 22.12+
- Packages installed (`npm install`)

## Automated Verification

### Running Unit Tests
To run the automated tests verifying the collision force and minimum distance invariants:
```bash
npm run test
```

### Running E2E / Browser Tests
To run end-to-end tests ensuring no overlapping rendering occurs:
```bash
npm run test:e2e
```

## Manual Verification

1. Start the development server:
   ```bash
   npm run dev
   ```
2. Open the application in a web browser (e.g., `http://localhost:5173`).
3. Load a dense dataset (e.g., standard school hierarchy with 1,200 entities).
4. Select the **Force Directed** layout option.
5. Observe the animation:
   - Towers should animate smoothly.
   - Throughout the simulation, towers should not visually merge or render on top of each other.
   - Verify that there are no overlapping tiles or visual intersections.
