# /implement-feature v2 — requirements doc

Source: dogfood of `/implement-feature` v1.4.0 on `findependence` PR #68 (wave `wave-admin-multi-delete-0568`). Full audit trail in that repo at `docs/waves/wave-admin-multi-delete-0568/implicit-refinements.md`. This doc rephrases the audit as forward-looking requirements for the v2 PR.

**Status:** ready to start. Not yet on a worktree.

---

## Why a v2

The v1 wave shipped end-to-end (6/6 tasks, 0 escalations, 0 suspicious events, merged into `findependence` main). It also surfaced **23 implicit refinements** that agents made silently — and **8 distinct skill-design gaps** that produced them. The skill works; it just hides too much from the user. v2 is about making those decisions either explicit (asked) or audited (captured machine-readably).

The dominant root cause: **auto mode silently overrides the skill's `AskUserQuestion` interview contract.** Every gate that should have been an interview turned into "agent assumes and reports the assumption in free text." We want a way for skills to declare interview-required steps that survive auto mode, OR a structured assumption-capture surface that makes the audit trail first-class.

---

## Goals for v2

1. **No silent assumptions.** Every Analyst/Architect/QA decision either gets a `AskUserQuestion` round OR is appended to a machine-readable `wave-state.json.assumptions[]` array that surfaces at every gate.
2. **Robust state machine.** `wave-state.json.status` transitions belong to the orchestrator, not to sub-agents. Every task lifecycle field (status, iterations_used, notes) is initialized at task creation, not lazily.
3. **Runtime-aware setup.** Stop gating on `vitest_install_allowed`; detect what runners exist and adapt.
4. **F2-style tasks are testable.** A task whose deliverable is itself a test artifact (Playwright spec, contract test) has a first-class shape — QA writes it, no Dev iteration.
5. **Resume after pause.** A halted wave can be picked up in a later session via `/implement-feature --resume <wave-id>`.

Non-goals for v2: changing the four-role agent model, changing the three-gate structure, redesigning HTML templates, Linear integration.

---

## Requirements

### R1 — Interview-required gates survive auto mode

**Problem (F1 in audit):** auto mode tells agents to "minimize interruptions / make reasonable assumptions over asking questions." The skill's `AskUserQuestion`-based interviews in Step 2 (Analyst) and Step 3 (Architect) got skipped wholesale. 14 decisions were taken across the two phases without a single user prompt.

**Acceptance:**
1. The skill exposes an `interview_required: true` flag per phase (default `true` for Analyst, Architect; default `false` for QA which usually has enough constraints from the prior two phases).
2. When `interview_required: true`, the sub-agent prompt MUST include explicit instruction that auto mode does NOT permit skipping `AskUserQuestion`. At least one round of questions must fire before the phase completes.
3. If the agent has no clarifying questions, it surfaces an empty-interview confirmation (`"No questions; proceeding with these defaults: ..."`) and the orchestrator records it in `wave-state.json` as evidence the agent considered the gate.
4. Failing R1 means the orchestrator detects an agent finished a phase with zero `AskUserQuestion` calls AND zero recorded assumptions — and routes back to the agent with a corrective prompt.

### R2 — Machine-readable assumption capture

**Problem (F6 in audit):** every implicit refinement was surfaced in free-text agent reports. To act on them later (skill enhancement, future-wave guardrails), they need structure.

**Acceptance:**
1. `wave-state.schema.json` gains `assumptions: Array<{ at, agent, phase, decision, rationale, recoverable, gate_reviewed }>`.
2. Each sub-agent prompt (Analyst, Architect, QA, Dev) instructs the agent to append to this array whenever it makes a non-trivial decision that wasn't explicitly directed.
3. The gate-review HTML (requirement-verse, architecture-verse, qa-verse) renders `assumptions[]` into a dedicated section. Users can mark each assumption "accept" / "edit" before approving the gate.
4. `result.html` includes the final `assumptions[]` table at wave end.

### R3 — `deliverable_kind: "test"` task shape

**Problem (F2 in audit):** F3-T1 was "ship a Playwright e2e spec" — the deliverable IS the test. The QA-owns-tests rule means QA writes it, but the skill had no formal handling for this: I had to write a special-case instruction into the QA agent's prompt.

**Acceptance:**
1. `task.deliverable_kind` enum: `"code"` (default) or `"test"`.
2. When `deliverable_kind === "test"`, QA writes the artifact directly during Step 4. The task is marked `done` when all its `depends_on` tasks are `done` AND the QA-authored test passes against them. No Dev agent is spawned for that task.
3. The Architect MUST set `deliverable_kind: "test"` when a Feature's acceptance is itself a test artifact (Playwright spec, contract test, snapshot).
4. `result.html` distinguishes QA-delivered tasks from Dev-delivered tasks in the per-task table.

### R4 — Test-runner runtime detection (drop `vitest_install_allowed`)

**Problem (F3 in audit):** the `vitest_install_allowed` config flag was set `false`, but Vitest was already configured in `findependence`. The skill gate-asked about installing something that was already there.

**Acceptance:**
1. Step 0 detects test runners from `package.json` (Playwright in `devDependencies`, Vitest, Jest, Mocha) and the existence of expected config files (`playwright.config.ts`, `vitest.config.ts`).
2. `wave-state.json.config.test_runners` is populated with what was detected.
3. QA agent reads this and picks runners only from the detected set (or proposes scaffolding for missing ones with an explicit `AskUserQuestion` round, not via a pre-config flag).
4. Remove `vitest_install_allowed` from `FORM_FIELDS` in `template.md`.

### R5 — Orchestrator-owned state machine

**Problem (F4 in audit):** sub-agents flipped `wave-state.json.status` at different times — Architect set `"gate-2"`, QA set `"gate-3"`, etc. Some tasks were missing `status` and `iterations_used` entirely (the orchestrator had to backfill mid-wave).

**Acceptance:**
1. SKILL.md documents the canonical state-machine: `planning → gate-1 → gate-2 → gate-3 → dev-wave → done | halted-at-cap | blocked`. Each transition belongs to the orchestrator, not to sub-agents.
2. Sub-agents are instructed to write task-data only (features, tasks, assumptions). The orchestrator owns status flips.
3. The Architect's task schema includes `status: "todo"` and `iterations_used: 0` as required fields at task creation — no lazy initialization.
4. A schema-validator pass at the end of each phase rejects malformed state and routes back to the offending agent.

### R6 — `--resume <wave-id>` mode

**Problem (F5 in audit):** SKILL.md mentions resume as a future feature but there's no implementation. A wave halted at the soft-cap can't currently be picked up later — the user has to restart.

**Acceptance:**
1. `/implement-feature --resume <wave-id>` reads `<wave-dir>/wave-state.json`, validates it, and resumes from the saved `status`.
2. Resume preserves the worktree, the failing tests, the existing artifacts. It does NOT re-run the Analyst/Architect/QA phases unless the saved status indicates one of those was halted.
3. Resume only works if the worktree still exists. If the worktree is gone (merged + cleaned up), resume halts with a clear error.
4. Resume works across machines as long as the consuming repo has `wave-state.json` committed.

### R7 — Story-style code: drop or measure

**Problem (F7 in audit):** the "story-style code" guideline in `base.md` is stated but unmeasured. QA can't enforce it without subjective judgment; no Dev was flagged for violating it in v1.

**Acceptance options (pick one in implementation):**
- **(a) Drop it.** Remove the section from `base.md`. The guidance still lives in `~/.claude/CLAUDE.md` for users who want it; this skill doesn't restate it.
- **(b) Measure it.** Architect produces per-task style hints (`max_function_length`, `helper_naming_pattern`) and QA verifies after the fact.

Recommend (a) for v2 simplicity; revisit (b) if a future wave shows style-related rework.

### R8 — Soft-cap → Architect re-engagement: dogfood verification

**Problem (F8 in audit):** the soft-cap escalation path (3 iterations on same task → Architect re-engaged → architecture-verse revision N appended) was never exercised in v1. We don't know if the wire-up works.

**Acceptance:**
1. v2 PR includes a dedicated test wave (small synthetic feature) where the soft cap is deliberately tripped. Could be as simple as a task with a deliberately incorrect `existing_patterns_to_follow` so the Dev fails 3 times.
2. The Architect re-engagement happens automatically, appends a Revision N section to `architecture-verse.html`, and the Dev resumes with amended guidance.
3. The verification wave's `result.html` shows ≥1 entry in `escalations[]`.

---

## Out of scope for v2

- New agent roles beyond Analyst/Architect/QA/Dev.
- Multi-wave coordination (one wave references another's artifacts).
- A CLI binary (`implement-feature`) — stays conversational like v1.
- Linear/Jira/Notion integration.
- Wave-state persistence to anywhere other than `<wave-dir>/wave-state.json`.

---

## Suggested PR shape

One PR in `stx-skills` covering R1–R6 + R8. R7 is a 5-minute edit (option a) and can ride along.

Recommended sequence inside the PR:

1. Schema first: update `templates/wave-state.schema.json` with `assumptions[]`, `deliverable_kind`, `test_runners`. Land the schema; agent prompts target it.
2. Orchestrator changes: SKILL.md state-machine docs + Step 0 runner detection.
3. Sub-agent prompts: R1 (interview-required language) + R2 (assumption capture language) + R3 (deliverable_kind handling).
4. R6 (--resume): add the resume entry point + state validation.
5. R8 (soft-cap verification): synthetic test wave that lives as an example under `docs/examples/` or similar.

Version bump: 1.4.0 → 1.5.0 (minor — additive feature work, no breaking config changes).

---

## Reference material in `findependence`

After PR #68 merged to `main`, the following are now in the `findependence` repo:

- `docs/waves/wave-admin-multi-delete-0568/implicit-refinements.md` — the original audit
- `docs/waves/wave-admin-multi-delete-0568/wave-state.json` — example of v1 state shape
- `docs/waves/wave-admin-multi-delete-0568/*.html` — examples of all four artifact templates rendered

Pulling those into the v2 PR description is fine; they're committed and stable.
