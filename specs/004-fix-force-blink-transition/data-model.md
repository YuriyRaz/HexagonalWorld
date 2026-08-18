# Data Model: Continuous Force-Directed simulation

No modifications to the core database or entity models are required. 

## Runtime Frame Payload Metrics
The simulation state from `layout-worker` includes:
- `globalStep` (Number): Total simulation ticks since start.
- `coolingStep` (Number): Tick count since last reset.
- `stableStreak` (Number): Steps where changes remained below thresholds.
- `terminal` (String): `'none'` or `'converged'` or `'exhausted'`.

These are mapped directly to UI labels in the sidebar status area.
