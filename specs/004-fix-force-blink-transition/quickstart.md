# Quickstart: Validating Continuous Force layout

## Prerequisites
- Node.js 20.19+
- Project dependencies installed (`npm install`)

## Run the Application
Start the development server:
```bash
npm run dev
```

## Validation Scenarios

### Scenario 1: Continuous Calculation Ticks
1. Select **Силовая раскладка** (Force-directed layout) from the algorithm dropdown.
2. Observe the step count in the layout progress panel.
3. Verify that the step counter increments continuously and does not stop when it reaches 256 or when the layout converges.
4. Verify the towers remain translucent and springs remain visible.

### Scenario 2: Convergence Status Display
1. Watch the layout progress panel.
2. Verify that when the layout stabilizes, the status shows "Сошлось" along with the step count at which convergence was achieved.
3. Verify that the calculation continues running even after convergence is reached.
