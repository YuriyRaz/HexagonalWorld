# Research: Continuous Force-Directed layout Loop and Convergence Status

## Continuous simulation Loop

### Decision
The simulation calculation inside `src/layout-worker.js` will execute steps continuously without auto-stoppage. 
Instead of sending a terminal message and transitioning to `settled-awaiting-commit` or `failed`, the worker will keep advancing the simulation.

### Rationale
This prevents the layout calculation from stopping, keeping the force representation active. The user can interact with the graph indefinitely.

### Alternatives Considered
- **Automatic pause with manual resume**: Rejected because the user explicitly requested that the world should not stop calculations.

## Real-Time Convergence Status Display

### Decision
The UI in `src/main.js` will intercept `onStep` frame updates. It will read:
- `frame.coolingStep` (progress towards the cooling limit)
- `frame.stableStreak` (progress towards the consecutive stable steps requirement)
- `frame.terminal` (when it equals `'converged'`, indicate convergence occurred)
The UI will display the convergence step count when convergence is first achieved, and show the live streak metrics otherwise.

### Rationale
This provides immediate feedback on how close the simulation is to settling without interrupting the rendering.
