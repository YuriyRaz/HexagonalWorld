# Data Model: Force-Directed Layout

## Overview

The feature separates source-domain data, normalized hierarchy, mutable simulation state, layout output, visual payload, and GPU resources. Only normalized leaves receive surface placements. Internal entities may become calculation-only anchors in one mode but never become placements or towers.

## Supported Scale

| Measure | Maximum |
|---|---:|
| Total normalized entities | 6,000 |
| Leaf entities / rendered towers | 4,800 |
| Internal entities / virtual anchors | 1,200 |
| Hierarchy depth | 16 |
| Leaf-to-ancestor memberships | 76,800 |
| Active hierarchy links / debug springs | 5,999 |
| Final axial grid radius | 256 |

Exceeding a bound returns `UNSUPPORTED_SCALE` before simulation starts. The current generator remains within 4,800 leaves, 90 internal entities, and two ancestor memberships per leaf.

## NormalizedEntity

Domain-neutral hierarchy input supplied to layout.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Required, non-empty, unique, and stable |
| `parentId` | string or `null` | `null` only for a root; otherwise references one existing entity |
| `order` | integer | Required stable source order; exact ID comparison breaks ties |

Derived worker attributes:

- `isLeaf`: no entity references this ID as `parentId`.
- `depth`: parent-edge count from a root.
- `ancestorIds`: immediate-parent-to-root sequence.

Validation rules:

- IDs use exact UTF-16 code-unit ordering, not locale-aware comparison.
- Every non-root has exactly one parent.
- Duplicate IDs, missing parents, self-parenting, cycles, and scale-bound violations reject the request.
- An empty list or hierarchy with no leaves returns `EMPTY_HIERARCHY`.
- Source-specific entity types, measures, labels, and palette fields never enter this model.

## VisualEntityPayload

Domain adapter output used only by rendering and selection. Layout receives none of these fields.

| Field | Type | Rules |
|---|---|---|
| `entityId` | string | References one normalized leaf |
| `title` | string | User-visible primary label |
| `metadataText` | string | User-visible localized selection summary |
| `heightValue` | finite number | Existing normalized value used by centralized height mapping |
| `colorGroupId` | string | Stable opaque grouping key for centralized palette mapping |
| `colorGroupOrder` | integer | Stable palette order |
| `colorVariantOrder` | integer | Stable within-group color variation order |

Field names are generic. A source adapter may derive values from any domain hierarchy without changing layout or rendering contracts; schools/classes/students and organizations/teams/members are examples only.

## LayoutMode

Selectable algorithm metadata.

| Field | Type | Rules |
|---|---|---|
| `id` | enum | Existing IDs plus `force-anchors` and `force-groups` |
| `label` | string | Localized selector label |
| `note` | string | States grouping method, spring presence/absence, and tower transparency |
| `isAsync` | boolean | True for both force modes |
| `showSprings` | boolean | True only for `force-anchors` |
| `occupiedOpacity` | number | `0.5` for force modes; `1` for existing modes |

## LayoutConfig

Internal versioned force configuration. It is not user-editable.

| Field | Type | Rules |
|---|---|---|
| `version` | positive integer | Included in deterministic fixture identity |
| `seed` | unsigned 32-bit integer | Input to the specified Mulberry32 PRNG |
| `totalTicks` | positive integer | 256 |
| `mutableEndTick` | integer | 159 |
| `settleEndTick` | integer | 223 |
| `assignmentInterval` | positive integer | 4 ticks during mutable phase |
| `candidateRadius` | non-negative integer | 3; candidate cap is `1 + 3R(R + 1) + 1` |
| `predictionLookahead` | finite number | Velocity contribution to desired-cell prediction |
| `movePenalty` | finite non-negative number | Discourages assignment churn |
| `alphaSchedule` | fixed numeric phases | Piecewise alpha endpoints; automatic alpha decay is zero |
| `velocityDecay` | number | Explicit value in `[0, 1]` |
| `hexStrength` | object | Finite non-negative `mutable` and `settle` strengths |
| `manyBodyStrength` | finite number | Shared repulsion setting |
| `manyBodyTheta` | finite positive number | Explicit Barnes-Hut approximation setting |
| `manyBodyDistanceMin` | finite non-negative number | Explicit minimum interaction distance |
| `manyBodyDistanceMax` | finite positive number | Explicit maximum interaction distance |
| `centerStrength` | finite non-negative number | Weak drift prevention |
| `linkDistance` | finite positive number | Anchor mode only |
| `linkStrength` | finite non-negative number | Anchor mode only |
| `linkIterations` | positive integer | Explicit anchor-link relaxation count |
| `groupStrength` | finite non-negative number | Immediate-ancestor grouping strength |
| `ancestorDecay` | number | In `[0, 1]`; weakens remote ancestors |
| `quantizationStep` | finite positive number | `0.000001` axial units |
| `convergenceThresholds` | object | Assignment stability, target error, and anchor velocity limits |

All output-affecting settings are explicit. Changing them requires a config-version increment and updated deterministic fixtures.

## LayoutRequest

Unified orchestration request for existing and force layouts.

| Field | Type | Rules |
|---|---|---|
| `requestId` | positive integer | Monotonically increases in the page session |
| `mode` | layout mode ID | Any existing or force mode |
| `entities` | `NormalizedEntity[]` | Complete hierarchy snapshot |
| `config` | `LayoutConfig` or `null` | Required only for force modes |

Force requests cross the worker boundary. Existing modes may resolve synchronously behind the same promise-returning runner contract. Visual payload stays on the main thread.

## SimulationNode

Mutable worker-only DTO.

| Field | Type | Rules |
|---|---|---|
| `entityId` | string | Original normalized entity ID |
| `kind` | `leaf` or `anchor` | Combined with `entityId` as a structured identity tuple |
| `ancestorIds` | string[] | Leaf group-force memberships |
| `x`, `y`, `vx`, `vy` | finite number | d3-force mutable state |
| `fx`, `fy` | number or `null` | Set for leaves only during final in-simulation pin phase |
| `cellQ`, `cellR` | integer or absent | Unique assignment for leaves; absent for anchors |

Identity maps are nested by `kind` and exact `entityId`; delimiter-concatenated IDs are forbidden. d3-force may add `index` and mutate the motion fields, but no domain object references this DTO.

Initial state is deterministic:

- Leaves sorted by `(order, id)` receive canonical compact-spiral cells and start at those centers with zero velocity.
- Every anchor starts at the quantized centroid of its descendant leaf initial centers with zero velocity.
- The random source is Mulberry32 with `seed >>> 0` state.
- Stable comparisons use direct code-unit `<`/`>` ordering.

## HexCellAssignment

Authoritative discrete location for one leaf.

| Field | Type | Rules |
|---|---|---|
| `entityId` | string | References exactly one normalized leaf |
| `q` | integer | Axial coordinate |
| `r` | integer | Axial coordinate |

Invariants:

- Every leaf has exactly one assignment at every committed assignment epoch.
- No two leaves share `(q, r)`.
- Previous assignment is always a protected fallback candidate.
- Candidate and proposal cap derives from configured radius; radius three permits at most 38 proposals per leaf per epoch.
- Final rendered coordinates are recomputed from `(q, r)`.
- Any assignment outside configured radius 256 returns `UNSUPPORTED_SCALE` rather than expanding unboundedly.

## VirtualAnchor

Worker-only representation of one internal entity in anchor mode.

| Field | Type | Rules |
|---|---|---|
| `entityId` | string | References one internal normalized entity |
| `q`, `r` | finite number | Fractional axial debug position, quantized to configured step |

Anchors are excluded from placements, visual payload, selection, and tower counts.

## SpringEndpoint

Collision-safe structured identity and position for one spring endpoint.

| Field | Type | Rules |
|---|---|---|
| `kind` | `leaf` or `anchor` | Endpoint type |
| `entityId` | string | Exact normalized entity ID |
| `q`, `r` | finite number | Quantized fractional axial position |

## ActiveSpring

One hierarchy edge used by anchor-mode link force and debug rendering.

| Field | Type | Rules |
|---|---|---|
| `source` | `SpringEndpoint` | Child leaf or child anchor |
| `target` | `SpringEndpoint` | Immediate parent anchor |

The structured tuple `(source.kind, source.entityId, target.kind, target.entityId)` is the stable key. Anchor mode returns one spring per non-root hierarchy entity; group mode returns `[]`.

## LayoutPlacement

| Field | Type | Rules |
|---|---|---|
| `entityId` | string | References one normalized leaf |
| `q` | integer | Authoritative axial coordinate |
| `r` | integer | Authoritative axial coordinate |

Placements are sorted by stable entity order and ID. Rendering joins them to `VisualEntityPayload` by `entityId`.

## LayoutStats

Domain-neutral summary derived from final placements.

| Field | Type | Rules |
|---|---|---|
| `occupiedCount` | non-negative integer | Placement count |
| `boundaryGaps` | array | Entries `{ depth, averageNearestGap }` for internal hierarchy depths |

For each internal depth:

- Build one cell set from all descendant leaf placements for every internal entity at that depth.
- Non-root groups compare only with groups sharing the same parent; root groups compare with all other roots.
- Pair gap is the minimum `axialDistance(firstCell, secondCell) - 1` over both groups' cells.
- Each group contributes its nearest eligible pair gap once; `averageNearestGap` is the arithmetic mean of those group values.
- Return `null` when fewer than two groups have an eligible comparison.
- Sort entries by ascending depth and traverse groups in stable entity order/ID.

The source/UI adapter may map depths to localized source-domain labels. Those names never enter layout output.

## LayoutDiagnostics

Discriminated union:

```text
LegacyDiagnostics = {
  kind: "legacy",
  iterations: 0,
  converged: true
}

ForceDiagnostics = {
  kind: "force",
  iterations,
  assignmentEpochs,
  proposalCount, // cumulative across all assignment epochs
  converged: true,
  maxTargetError,
  rmsTargetError,
  maxAnchorVelocity
}
```

Every numeric field is finite. `proposalCount` cannot exceed `leafCount * candidateCap * assignmentEpochs`. Diagnostics do not alter visual mappings.

## LayoutResult

One shape for all modes.

| Field | Type | Rules |
|---|---|---|
| `requestId` | positive integer | Must match latest request to commit |
| `mode` | layout mode ID | Matches request |
| `placements` | `LayoutPlacement[]` | One per leaf |
| `springs` | `ActiveSpring[]` | Empty except anchor mode |
| `gridRadius` | finite non-negative number | No greater than 256 |
| `stats` | `LayoutStats` | Generic hierarchy summary |
| `diagnostics` | discriminated diagnostics | Legacy or force variant matching mode |

The receiver revalidates cardinality, unique cells, finite values, ordering, radius, and mode-specific spring invariants before rendering.

## LayoutOperationError

Exact error object used by runner promises and UI mapping.

| Field | Type | Rules |
|---|---|---|
| `requestId` | positive integer | Failed or cancelled request |
| `code` | enum | One of the codes below |
| `details` | plain object | Non-localized diagnostic parameters; no stack in production UI |
| `silent` | boolean | True only for superseded cancellation/stale completion |

Codes:

- Input/algorithm: `UNKNOWN_MODE`, `EMPTY_HIERARCHY`, `INVALID_HIERARCHY`, `UNSUPPORTED_SCALE`, `NON_FINITE_STATE`, `ASSIGNMENT_INVARIANT`, `NOT_CONVERGED`.
- Environment/transport: `UNSUPPORTED_ENVIRONMENT`, `WORKER_START_FAILED`, `WORKER_MESSAGE_FAILED`, `TIMEOUT`, `CANCELLED`, `INTERNAL_ERROR`. `TIMEOUT` is an independently configured stuck-worker safety guard and is not the 2/8-second performance acceptance threshold.
- Rendering: `WEBGL_UNAVAILABLE`, `RENDER_FAILED`.

Workers return only code and diagnostic details. `main.js` maps codes to localized live-region text. Cancellation superseded by a newer request rejects its runner promise with `silent: true` and never announces an error.

## IslandPresentation

| Field | Type | Rules |
|---|---|---|
| `occupiedOpacity` | number | `0.5` for force modes; `1` otherwise |
| `showSprings` | boolean | True only for anchor mode |
| `springLevel` | number | Literal world `y = 0` |

Presentation cannot change hierarchy or placement semantics.

Fixed rendering invariants, not caller-configurable fields:

- Spring material uses `depthTest: true` and `depthWrite: false`.
- Springs never clear depth or use an always-on-top overlay path.
- Opaque geometry may occlude springs; translucent force-mode towers do not write depth and preserve spring visibility through their occupied volume.

## SupportedBrowserTarget

Validation-only identity for one compatibility project.

| Field | Type | Rules |
|---|---|---|
| `engine` | enum | `blink`, `gecko`, or `webkit` |
| `release` | enum | `current` or `previous` stable at validation time |
| `deviceClass` | enum | `desktop`, `phone`, or `tablet` |
| `productVersion` | string | Exact branded product/engine version recorded with evidence |
| `osDevice` | string | Exact OS and physical/emulated device context |
| `viewport` | object | CSS width/height within the class boundary |
| `input` | enum set | Keyboard/pointer for desktop; touch for phone; touch or pointer for tablet/hybrid |
| `webgl2` | boolean | Must be true for a supported run |
| `moduleWorker` | boolean | Must be true for a supported run |

The release-certification matrix contains all 18 combinations of three engines, two stable releases, and three device classes. Bundled Playwright revisions are portable automation targets, not substitutes for release identity.

## VisibilityCameraPreset

Validation-only camera state applied to an assigned control spring without changing the user camera preset.

| Field | Desktop | Mobile |
|---|---:|---:|
| viewport CSS px | 1440x900 | 390x844 |
| DPR | 1 | 3 |
| vertical FOV | 34 degrees | 34 degrees |
| target | control-spring midpoint at `y = 0` | same |
| azimuth | 32 degrees clockwise from positive Z | 32 degrees clockwise from positive Z |
| elevation | 30 degrees above surface | 30 degrees above surface |
| distance | 43 world units | 72 world units |

The fixture records the camera state before application and restores it afterward. It asserts that spring segments behind only translucent towers remain distinguishable and segments behind opaque geometry are occluded normally.

## PerformanceSampleSet

Validation-only measurements for one mode/fixture pair on the fixed reference device.

| Field | Type | Rules |
|---|---|---|
| `warmupBuilds` | duration[2] | Recorded separately and excluded from acceptance calculations |
| `measuredBuilds` | duration[10] | Full selector-to-commit durations |
| `controlResponses` | duration[10] | One prescribed busy-state event-to-next-frame duration per measured build |
| `frameWindows` | duration[][] | For 4,800 leaves, ten five-second post-commit frame-delta windows |
| `completionP95` | duration | Nearest rank `ceil(0.95 * 10) = 10` of `measuredBuilds` |
| `controlResponseP95` | duration | Nearest rank 10 of `controlResponses` |
| `frameMedian` | duration | Median of pooled deltas from the ten measured frame windows |

Completion limits are 2 seconds at 1,200 leaves and 8 seconds at 4,800 leaves; control-response p95 is at most 100 ms; frame median is at most 33.3 ms. None of these values configures or triggers the worker hang guard.

## Request Lifecycle

```text
idle/committed
    -> calculating(requestId)
    -> candidate-ready(requestId)
    -> committed(requestId)

calculating(requestId)
    -> cancelled(requestId)       newer request or app teardown
    -> failed(requestId)          typed worker/environment failure

candidate-ready(requestId)
    -> discarded(requestId)       stale or render failure
    -> committed(requestId)       candidate fully valid
```

- Previous committed island remains visible through calculation and candidate creation.
- Only latest request may commit.
- Factory owns every GPU allocation until successful handle return; then ownership transfers atomically to the handle.
- Factory failure disposes every partial allocation before returning `RENDER_FAILED`.
- Commit adds candidate, swaps interaction references, removes old root, then disposes old handle.
