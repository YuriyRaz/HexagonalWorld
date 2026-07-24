# Force-Directed Layout Execution Runbook

## Mission

Finish every feasible existing task in `specs/001-force-directed-layout/tasks.md` with truthful implementation, verification, and validation evidence.

Do not expand the feature scope, regenerate approved artifacts, weaken acceptance criteria, or claim evidence from unavailable participants, hardware, browsers, or devices.

## Sources Of Truth

Read these sources in order:

1. `AGENTS.md`
2. This runbook
3. `specs/001-force-directed-layout/spec.md`
4. `specs/001-force-directed-layout/plan.md`
5. `specs/001-force-directed-layout/tasks.md`
6. Relevant files under `specs/001-force-directed-layout/contracts/`
7. Relevant files under `specs/001-force-directed-layout/validation/`
8. Existing implementation and tests

Repository artifacts override conversation summaries and remembered assumptions. If sources conflict, run `speckit-analyze` and resolve the contradiction before implementation.

## Scope Boundaries

- Work only on requirements already approved for this feature.
- Use `speckit-converge` only when an approved requirement has no corresponding task.
- Do not rewrite existing tasks to make incomplete work appear complete.
- Do not mark a task complete without its required implementation, tests, commands, and evidence.
- Do not modify unrelated features or revert unrelated worktree changes.

## Autonomous Behavior

- Continue through all dependency-ready work without asking for permission between phases.
- Do not stop after investigation, planning, one failed command, or one failed approach.
- Resolve ordinary engineering decisions from the specification, contracts, tests, and repository patterns.
- If one task is blocked, record the blocker and continue with every unrelated dependency-ready task.
- Ask the user only for an irreducible product decision, destructive action, credential, real participant, physical device, or unavailable external infrastructure.

The session may finish only when all feasible tasks have been processed and every remaining incomplete task has a concrete recorded blocker.

## Main Coordinator Role

The main agent is an orchestration context. It maintains the execution ledger, launches sub-agents, prevents overlapping edits, reconciles concise reports, performs targeted integration, and updates task checkboxes after verification.

The main agent delegates:

- open-ended repository investigation
- phase-wide audits
- implementation workstreams
- unclear root-cause analysis
- long browser matrices and benchmark runs
- independent verification

The main agent must not repeat work delegated to a sub-agent or pull large logs and files into the main context when evidence can be written to a validation artifact.

## Clean Sub-Agent Context

Start a fresh sub-agent for every new phase or independent workstream. Resume a prior `task_id` only to correct or continue that exact workstream.

Each sub-agent receives only:

- its role: investigator, implementer, or verifier
- exact task IDs
- relevant source-of-truth paths
- explicit allowed files
- explicit prohibited scope
- acceptance criteria
- required commands
- evidence destination
- concise return format

Do not send the full conversation or unrelated phase history. Do not run agents concurrently when their allowed files overlap.

## Instruction Refresh

Every agent must reread `AGENTS.md`, this runbook, and its assigned task entries:

1. At assignment start.
2. Before its first edit.
3. After two failed approaches.
4. Before changing scope or touching an unassigned file.
5. Before its final report.

If context was compacted, instructions seem uncertain, or the current action no longer clearly serves the assigned task, reread the sources of truth instead of reconstructing instructions from memory.

## Phase Lifecycle

Use isolated contexts for each workstream:

1. A read-only investigator establishes implementation, test, evidence, dependency, and blocker status.
2. A fresh implementer receives the concise investigation and makes the smallest compliant change.
3. A fresh verifier independently reviews acceptance criteria, diff scope, tests, and evidence.
4. The coordinator updates `tasks.md` and the execution ledger only after verifier approval.

An implementer cannot provide final verification for its own task.

## Difficult Task Recovery

Do not declare a local task impossible after one failure. Use this bounded recovery ladder:

1. Reproduce the smallest focused failure.
2. Classify it as code, test, tooling, environment, performance, or external dependency.
3. Inspect the governing requirement, contract, tests, and adjacent project patterns.
4. Attempt the smallest direct solution.
5. Attempt a materially different solution that preserves the same acceptance criteria.
6. Delegate a fresh diagnostic agent without assumptions from the first attempt.
7. Compare findings and attempt a third safe approach.
8. Record a blocker only after these attempts, unless an unavailable external prerequisite is conclusive.

Do not retry the same command indefinitely. Alternative approaches must not weaken thresholds, remove assertions, skip scenarios, substitute simulated participant evidence, or mislabel bundled browsers as release certification.

## External Blockers

External blockers may include unavailable real participants, prescribed hardware, physical Android or Apple devices, macOS/Safari infrastructure, credentials, or paid services.

For an external blocker:

- record the exact missing prerequisite
- record completed local implementation and diagnostics
- record commands attempted
- leave the task unchecked
- continue with other feasible work

A slow download, failing test, unknown error, or difficult implementation is not an external blocker.

## File Ownership

Before implementation, assign each shared file to one active workstream in `validation/execution-ledger.md`. Serialize work involving:

- `tests/app.spec.js`
- `tests/layout.benchmark.spec.js`
- `tests/resource-profile.spec.js`
- `src/main.js`
- `src/island.js`
- `src/layout-runner.js`
- `README.md`
- `tasks.md`
- files under `validation/`

Unexpected unrelated changes must be preserved. Stop and escalate only when they directly conflict with the assigned work.

## Sub-Agent Return Contract

Return no more than approximately 40 lines in this format:

```text
STATUS: complete | partial | blocked | failed
TASKS: assigned task IDs
FINDINGS: concise facts
CHANGED: paths or none
VERIFICATION: commands and pass/fail counts
EVIDENCE: validation paths and sections
BLOCKERS: concrete blockers or none
NEXT: one recommended action
```

Write required raw benchmark, browser, visual, accessibility, and resource evidence directly to the prescribed validation file. Do not return complete files, large diffs, screenshots, stack traces, or full logs.

## Completion Rules

A task is eligible for `[X]` only when:

- required implementation exists
- required tests exist and pass
- required validation evidence exists
- exact commands and environment details are recorded where required
- an independent verifier confirms acceptance criteria
- `npm run build` passes after source changes

Historical test-before-implementation evidence must not be fabricated. If it cannot be established, record the limitation honestly.

## Verification Discipline

Run focused checks first, then broader gates. Delegate broad or high-output verification to a verifier sub-agent.

Required final checks for feasible work include:

- `npm test`
- `npm run build`
- appropriate focused Playwright projects
- `npm run test:e2e` when the environment supports it
- `npm run benchmark:layout` when its prescribed environment is available
- feasible quickstart scenarios
- `git diff --check`
- a final `speckit-analyze`
- a final `speckit-checklist`

The final report must distinguish passed, incomplete, and externally blocked tasks and name the next actionable step.
