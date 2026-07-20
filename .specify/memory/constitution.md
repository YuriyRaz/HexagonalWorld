<!--
Sync Impact Report
- Version change: unratified template -> 1.0.0
- Modified principles:
  - Placeholder Principle 1 -> I. Domain-Neutral Hierarchical Model
  - Placeholder Principle 2 -> II. Explicit Boundaries and Deterministic Mapping
  - Placeholder Principle 3 -> III. Real-Time Performance and Resource Ownership
  - Placeholder Principle 4 -> IV. Inclusive and Resilient Interaction
  - Placeholder Principle 5 -> V. Evidence-Based Quality and Simplicity
- Added sections:
  - Engineering Constraints
  - Development Workflow and Quality Gates
- Removed sections: none; placeholder content was resolved
- Templates requiring updates:
  - ✅ updated: .specify/templates/plan-template.md
  - ✅ updated: .specify/templates/spec-template.md
  - ✅ updated: .specify/templates/tasks-template.md
  - ✅ updated: .specify/templates/checklist-template.md
- Runtime guidance reviewed with no update required: AGENTS.md, README.md
- Installed SpecKit skills reviewed with no agent-specific corrections required
- Follow-up TODOs: none
-->
# Hexagonal World Constitution

## Core Principles

### I. Domain-Neutral Hierarchical Model

The core model MUST represent arbitrary hierarchies with stable, unique entity IDs and explicit
parent-child relationships. Source-specific data MUST enter through adapters or generators and MUST
NOT leak business-domain assumptions into layout or rendering code. Scene objects may reference model
IDs, but they MUST NOT become the authoritative data store. New work MUST preserve support for
different hierarchy depths and domains rather than extending school-specific behavior. This keeps the
visualization reusable for organizations, knowledge maps, taxonomies, and future datasets.

### II. Explicit Boundaries and Deterministic Mapping

Data modeling, hexagonal layout, Three.js rendering, and UI interaction MUST remain separate concerns
with explicit inputs and outputs. Layout logic MUST operate without DOM or Three.js dependencies, and
rendering MUST consume calculated placements rather than decide hierarchy. For the same normalized
data and layout configuration, placement, height, color, and grouping MUST be reproducible. Visual
mappings and layout constants MUST be centralized instead of duplicated across event handlers or scene
construction. Any intentional randomness MUST be isolated from deterministic transforms and support a
reproducible seed when a requirement or test depends on repeatability.

### III. Real-Time Performance and Resource Ownership

Each feature MUST define a representative data scale and measurable frame-time or interaction targets
at that scale. The render loop MUST avoid per-frame allocation; reusable vectors, matrices, geometries,
and materials MUST be preferred. Repeated geometry MUST use batching or instancing unless the plan
documents why required per-object behavior prevents it. Code that creates GPU resources or event
listeners MUST define and execute their cleanup when content is replaced or the owner is destroyed.
Performance optimizations MUST be supported by a measured bottleneck or a stated scale requirement,
not speculation.

### IV. Inclusive and Resilient Interaction

User-facing features MUST work across supported desktop and mobile viewport sizes. Every essential
action MUST have a keyboard-accessible path or a documented accessible alternative to pointer-only 3D
interaction. Semantic HTML, visible focus, meaningful labels, understandable validation feedback, and
appropriate live announcements MUST be preserved. Motion MUST respect `prefers-reduced-motion`, and
critical information MUST NOT rely on color, height, or animation alone. Empty, invalid, unsupported,
loading, and failure states MUST be defined for affected journeys so the interface remains usable when
WebGL, data, or input assumptions fail.

### V. Evidence-Based Quality and Simplicity

Changes MUST be the smallest cohesive solution that satisfies an approved requirement. New
dependencies, abstractions, and compatibility layers MUST have a concrete current need and a simpler
alternative considered. Every change MUST pass `npm run build`. Deterministic data and layout behavior,
regression fixes, and reusable contracts MUST have automated tests when the affected code can execute
outside a browser. Browser-only rendering and interaction changes MUST have documented, repeatable
browser scenarios and MUST explain in the plan when automation is omitted. Every user story MUST have
an independently repeatable acceptance path. Generated output, dependencies, secrets, local
environment files, and editor state MUST NOT be committed or edited as source.

## Engineering Constraints

- The supported development baseline is Node.js 20.19+ or 22.12+, npm, native ES modules, Vite, and
  Three.js. Toolchain or major dependency changes require an implementation plan and migration impact.
- `src/data.js`-style adapters own source normalization, layout modules own spatial calculation,
  rendering modules own Three.js resources, and orchestration/UI modules own interaction. Equivalent
  modules may replace these files, but the boundaries MUST remain explicit.
- Public model and layout contracts MUST document identity, parentage, ordering, validation, and scale
  assumptions. Invalid or cyclic hierarchy input MUST have defined behavior before external data is
  accepted.
- Visual encoding changes MUST document what position, height, color, and grouping mean and MUST keep
  those meanings consistent across the scene, legends, selection details, and accessibility text.
- GPU resources MUST be disposed when worlds are rebuilt. Shared resources MUST have a clear owner and
  MUST NOT be disposed while still in use.
- User-visible language MUST be internally consistent within each supported locale. External assets and
  services MUST have an explicit failure strategy when they are required for core use.

## Development Workflow and Quality Gates

1. Specifications MUST state prioritized user journeys, measurable outcomes, hierarchy/data impacts,
   expected dataset scale, accessibility behavior, responsive behavior, and applicable failure states.
2. Plans MUST pass the Constitution Check before research and after design. They MUST identify module
   boundaries, deterministic inputs and outputs, resource ownership, performance budgets, and the
   validation strategy.
3. Tasks MUST remain traceable to a user story or quality requirement. Required implementation,
   automated checks, browser scenarios, resource cleanup, documentation, and build verification MUST
   be represented explicitly rather than deferred to an implicit polish step.
4. Implementation MUST proceed in independently verifiable increments. Work affecting shared files or
   resource ownership MUST remain sequential even when other tasks can run in parallel.
5. Before completion, run all checks defined by the plan and at minimum `npm run build`. Interaction or
   visual changes MUST also be exercised at representative desktop and mobile sizes, including keyboard
   and reduced-motion behavior where applicable.
6. Review MUST reject unexplained domain coupling, nondeterministic transforms, inaccessible essential
   actions, unowned GPU resources, unsupported scale claims, unverified behavior, or complexity without
   a documented need.

## Governance

This constitution is the highest-priority engineering guidance for Hexagonal World. `AGENTS.md` remains
the operational reference for repository commands and collaboration rules; where guidance conflicts,
this constitution governs product and engineering quality.

Amendments MUST be proposed as reviewed documentation changes that include a Sync Impact Report,
rationale, affected templates or features, and any required migration work. Versions use semantic
versioning: MAJOR for incompatible governance or principle changes, MINOR for new principles or
materially expanded obligations, and PATCH for non-semantic clarification. The ratification date does
not change; the last-amended date changes whenever the constitution content changes.

Every feature plan and code review MUST verify compliance. A temporary deviation MUST be recorded in
the plan's Complexity Tracking table with its reason, rejected simpler option, risk, and remediation
path. Unjustified violations block implementation or merge. The constitution MUST be reviewed whenever
the architecture, primary toolchain, supported platform, or project direction materially changes.

**Version**: 1.0.0 | **Ratified**: 2026-07-20 | **Last Amended**: 2026-07-20
