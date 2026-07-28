# Data Model: Realtime Force Simulation Visualization

## Overview

The authoritative force state includes continuous node positions, unique evolving hex assignments, convergence metrics, and optional accepted control commands. A successful terminal force frame already equals the displayed and serialized hex-centered result. The worker retains this exact state after scene commit for future interaction epochs.

## Force Session

| Field | Type | Rules |
|---|---|---|
| `requestId` | safe integer | Stable for initial run and all retained interaction epochs |
| `phase` | enum | `initializing`, `running`, `center-locking`, `settled`, `held`, `cooling`, `failed`, `disposed` |
| `globalStep` | safe integer | Starts at 0 and never resets across epochs |
| `epoch` | non-negative integer | 0 initial; increments on zero-to-one controlled-fixed transition |
| `epochStep` | non-negative integer | Counts ticks in current interaction epoch |
| `coolingStep` | integer | `0..256`; pauses while held and resets on final release |
| `stableStreak` | integer | Consecutive terminal-quality steps |
| `assignmentState` | Assignment State | One unique target per leaf at every step |
| `fixedLeaves` | map by stable leaf ID | Command-owned fixation only; automatic center locks tracked separately |
| `processedCommandSeq` | safe integer | Highest expected-sequence command processed, accepted or semantically rejected |
| `acceptedCommandSeq` | safe integer | Highest accepted command sequence applied to force state |

The session owns mutable d3 nodes/links, force instances, reusable assignment arrays, convergence state, and accepted transcript. It owns no worker, DOM, camera, RAF, or Three.js state.

### Calculation transitions

```text
initializing -> running
running -> center-locking -> settled
running/cooling -> failed at local cooling step 256 without convergence
settled -> held on first valid fixed-position command
held -> held for further fix/update/release commands while any leaf remains fixed
held -> cooling when final fixed leaf is released
cooling -> held when a new valid fixed-position command starts a newer interaction epoch
cooling -> center-locking -> settled
any non-disposed state -> failed on calculation invariant failure
any state -> disposed by owner teardown
```

Presentation/paint, pending scene commit, and worker retention are runner/application states, not force-session phases.

## Simulation Node

| Field | Type | Rules |
|---|---|---|
| `entityId` | string | Stable normalized ID |
| `kind` | enum | `leaf` or `anchor` |
| `x`, `y`, `vx`, `vy` | number | Finite full-precision d3 state |
| `assignedQ`, `assignedR` | integer or null | Unique evolving target for leaves; null for anchors |
| `automaticFx`, `automaticFy` | number or null | Assigned-center lock used only in center-locking/settled state |
| `controlFx`, `controlFy` | number or null | Future command-owned fixation; takes precedence while held |

Leaves begin mobile at their assigned packed centers. Assignment changes change targets only, never coordinates. Terminal leaves use automatic locks so actual coordinates equal their assigned centers exactly.

## Assignment State

| Field | Type | Rules |
|---|---|---|
| `revision` | non-negative integer | Increments on atomic assignment change |
| `epochCount` | non-negative integer | Number of actual four-step reassignment epochs |
| `unchangedEpochs` | non-negative integer | Resets on assignment change |
| `proposalCount` | non-negative integer | Bounded by leaf count, candidate count, and epochs |
| `assignmentHash` | deterministic value | Production diagnostic without retaining full history |
| `ownerByCell` | reusable indexed structure | Exactly one leaf owner per occupied cell |

At each epoch every leaf has at most 38 candidates: radius-three canonical offsets plus protected previous cell. Deferred acceptance commits only a complete unique assignment. Radius above 256 fails rather than clamps.

## Convergence State

| Metric | Rule |
|---|---|
| Minimum cooling step | 32 |
| Maximum cooling step | 256 |
| Required unchanged assignment epochs | 3 |
| Center-lock max/RMS target error | `<=0.06` / `<=0.01` adjacent-cell spacings |
| Terminal leaf target error | Exact zero using stored center values |
| Max/RMS centered movement | `<=0.06` / `<=0.01` adjacent-cell spacings |
| Required stable steps | 8 |

Movement is measured relative to the leaf centroid without modifying simulation coordinates. Any failed terminal condition resets `stableStreak`. Convergence is prohibited while `fixedLeaves` is nonempty.

## Force Step Frame

| Field | Type | Rules |
|---|---|---|
| `requestId` | safe integer | Matches retained session |
| `globalStep` | safe integer | Contiguous in all-steps presentation |
| `epoch`, `epochStep`, `coolingStep` | integer | Explain current interaction/cooling progress |
| `positions` | `Float32Array` | Two finite visual coordinates per node |
| `assignmentRevision`, `assignmentHash`, `unchangedAssignmentEpochs` | values | Correspond to same worker state |
| `stableStreak`, movement/target metrics | numbers | Correspond to same completed tick |
| `appliedCommandSeq` | safe integer | Highest command applied before this tick |
| `terminal` | enum | `none`, `converged`, `not-converged` |
| `result` | `LayoutResult` or null | Present on converged terminal frames, including success terminal snapshots |

On successful terminal frames, every authoritative full-precision leaf position is already its assigned center. Frame/render values are direct Float32 representations of those centers; finalization and stable rendering cannot independently recalculate or change them.

## Force Control Command

```text
requestId
commandSeq
action: set-fixed-position | release-fixed-position
entityId: stable leaf ID
x, y: finite simulation-plane coordinates for set action
```

Commands apply between ticks in sequence order only after the session is committed-retained or already in an interaction epoch. Fixed coordinates must be finite and map to fractional axial distance `<=256`. An expected-sequence semantic rejection advances only `processedCommandSeq`, allowing the next runner-issued sequence; it consumes no tick/RNG and does not mutate force state, `acceptedCommandSeq`, or the accepted transcript. Duplicate/gapped/wrong-request messages do not advance either watermark. Accepted transcript records canonical coordinates, sequence, action, leaf ID, applied-after global step, and epoch; it excludes timestamps and UI state.

## Interaction Epoch

- First accepted fixed command after settlement/cooling increments `epoch`, resets alpha/streak/assignment stability, and clears automatic center locks.
- While any leaf is controlled-fixed, convergence and cooling-budget consumption stop; one tick follows each accepted command boundary so neighbors react.
- Releasing a nonfinal fixed leaf stays held.
- Releasing the final fixed leaf resets alpha/streak and `coolingStep`, then automatic one-step cooling resumes.
- A new set during cooling starts a newer epoch and supersedes pending settlement.
- `globalStep` remains contiguous across all epochs.

## Stable Layout Result

The result serializes the already-settled state:

```text
requestId, mode, placements, springs, gridRadius, stats
diagnostics:
  globalStep, epoch, epochStep, coolingStep
  assignmentRevision, assignmentEpochs, proposalCount, assignmentHash
  unchangedAssignmentEpochs
  stableSteps, maxMovement, rmsMovement
  maxTargetError, rmsTargetError
  appliedCommandSeq
  converged, terminationReason
```

Placements are current assignments. Leaf spring sources and actual full-precision node centers refer to the same values. Serialization performs no coordinate/assignment mutation.

For force-mode stable rendering, `LayoutResult` is paired with its terminal `Force Step Frame`. Axial placements identify occupied cells, while the terminal frame carries the authoritative direct-Float32 tower and leaf-spring coordinates; a stable factory cannot reconstruct those visual coordinates from placements alone.

## Runner Session

| State | Meaning | Guard/worker |
|---|---|---|
| `starting` | Worker/session creation | Active guard, worker owned |
| `running` | Initial or interaction cooling | Active guard |
| `waiting-for-paint` | One frame outstanding | Guard uses visible active time |
| `settled-awaiting-commit` | Initial result Promise resolved but scene not confirmed | Guard cleared; commands rejected |
| `retained-settled` | Stable scene confirmed and controls eligible | No timer/ticks/messages |
| `held` | Interaction commands accepted and neighbor ticks presented/suppressed | Command guard only |
| `interaction-cooling` | Post-release convergence | Fresh active guard |
| `failed`, `cancelled`, `disposed` | Session unusable | Worker/listeners/deferreds released exactly once |

Success settles an operation but does not destroy the session. Mode switch, rebuild, supersession, commit failure, worker failure, page teardown, or disposal destroys it.

## Scene Transaction

The committed stable island/result remain authoritative during retained idle. A future accepted control epoch creates a provisional live view; stable remains rollback authority. Terminal stable reconstruction may change GPU resources and empty-grid structure but must preserve exact terminal tower and leaf-spring coordinates.

## Current UI Boundary

No current pointer, touch, keyboard, selection, camera, or accessible action creates a force command. Existing click selection and OrbitControls gestures retain their meaning. The command seam is contract/test-facing only in this feature.
