---
name: implement-feature
description: Drives a multi-agent feature implementation wave. Interviews the user, runs Analyst → Architect → QA in sequence (each behind a gate), then schedules tier-specialized Dev agents under QA control. Produces requirement-verse.html, architecture-verse.html, qa-verse.html, and result.html artifacts in docs/waves/. Use when a new feature (multi-task, possibly multi-tier) needs to be implemented, not a single bug fix.
version: 1.0.0
author: STX
---

# /implement-feature

A guided multi-agent feature-implementation workflow. The skill interviews the user about a desired feature, runs three specialist agents (Analyst, Architect, QA) sequentially — each behind a user-approval gate — and then dispatches one or more tier-specialized Dev agents in a QA-controlled loop until every task in every feature is green.

This skill is a **sibling** to `/fix-issue`, not a replacement. `/fix-issue` handles a single reproducible bug with two agents (QA + Coder); `/implement-feature` handles new functionality that decomposes into multiple features and tasks across tiers (database / service / API / UI).

## When to use it

- A new feature (or small cluster of related features) needs to be implemented.
- The work spans more than one architectural tier, or has more than one acceptance test, or both.
- The user wants **failing tests written first**, **a written architecture decision**, and **suspicious-change tracking** — not freeform "go build it."

Do **not** use this skill for:
- Single-bug fixes — use `/fix-issue` instead.
- Refactors with no behavior change — there's no failing test to anchor to.
- Vague aspirations without acceptance criteria — interview the user to a concrete feature list first.

## Governance — read before running

This skill operates under the user's CRITICAL governance rules from `~/.claude/CLAUDE.md`:

1. **Always Work In A Worktree (HIGHEST PRIORITY).** The skill MUST confirm the user is on a non-`main` worktree before any agent runs. If the user is on `main` / `master`, the skill **stops and proposes** a new worktree before continuing.
2. **No Commits or Deployments Without Approval.** Any commit, push, or PR step at the end of the wave is gated on explicit user approval.
3. **Data Protection.** No destructive operation (no test deletion, no force-pushes, no branch removal) without an explicit named approval. This is especially important when the *feature itself* is destructive (e.g. multi-delete) — Dev agents MUST add environment guards and never run delete-style tests against production data.
4. **QA / Dev separation (per user's auto-memory `feedback_qa_fixer_workflow.md`).** Dev agents MUST NOT edit the QA agent's test files. Touching a test file is a halt-the-loop offense.

## Concepts

- **Wave** — a single invocation of `/implement-feature`. One wave produces one worktree, one branch, one PR, and a directory `docs/waves/wave-{slug}-{4-char-random}/`.
- **Feature** — a kanban card. Lives in `requirement-verse.html`. Has acceptance criteria.
- **Task** — a unit of implementation work under a Feature. Lives in `architecture-verse.html`. Each task is tagged with a `tier` (db / service / api / ui) and `scope_paths` (the files it may touch). One QA test maps to each task.
- **Gate** — a hard pause where the user must approve an artifact (HTML) before the next phase runs.
- **Tier-specialized Dev agent** — a Dev agent spawned with a tier-specific prompt prelude (DB / Service / API / UI), determined by the task's `tier` field.

## Artifacts (written into the consuming project)

Everything lives under `docs/waves/wave-{slug}-{xxx}/` in the consuming repo:

| File | Owner | Purpose |
|---|---|---|
| `wave-state.json` | Skill orchestrator | Source of truth: features, tasks, statuses, iteration counters, `suspicious[]`, `escalations[]` |
| `requirement-verse.html` | Analyst | Rendered Features list with acceptance criteria |
| `architecture-verse.html` | Architect | Rendered Tasks per Feature with tier + scope_paths + revisions on escalation |
| `qa-verse.html` | QA Agent | Rendered list of failing tests, mapped task → test file |
| `result.html` | Skill orchestrator | End-of-wave summary including suspicious changes |
| `handoff.md` | Skill orchestrator | Only written when an iteration cap trips or the wave is halted |

HTML is rendered from `wave-state.json` after every state change — JSON is canonical, HTML is presentation. Templates ship with the skill (see `templates/` directory).

## Workflow

Strict ordering. Three approval gates. The skill never starts a phase without the previous phase's gate being explicitly approved.

### Step 0 — Confirm worktree state

Before any other question:

```bash
git rev-parse --abbrev-ref HEAD
git worktree list --porcelain
```

- **On a feature branch in a non-main worktree:** confirm one-line ("We're on `<branch>` at `<path>` — work here?"). If yes, continue.
- **On `main` / `master`:** STOP. Use `AskUserQuestion` to propose a worktree name derived from the user's initial feature description. Do NOT proceed until a worktree exists.

Worktree command pattern:

```bash
git worktree add .claude/worktrees/wave-<slug> -b feat/wave-<slug>
ln -sf <main-repo>/.env.local .claude/worktrees/wave-<slug>/.env.local  # if applicable
```

### Step 1 — Capture initial feature description

The user MAY invoke the skill with a feature description, e.g.:

```
/implement-feature Admin multi-delete on /dashboard
```

If so, take the argument as `initial_request`. Otherwise, ask the user one open question: *"In a few sentences, describe the feature you want implemented."* The result populates `initial_request` in `wave-state.json`.

This is the **seed** for everything downstream. Subsequent agents add clarity; they do not replace it.

### Step 2 — Analyst (Agent 1)

Spawn the Analyst via `Agent` with `subagent_type: general-purpose` (or `Explore` for read-only research first if scoping is unclear).

**Analyst's contract:**
1. Read `initial_request`. Explore the consuming codebase to understand existing system shape — what tables, services, routes, components are touched.
2. Interview the user (via `AskUserQuestion`, grouped 2–4 questions per call) to clarify:
   - What problem is this feature solving?
   - Who is the user / actor?
   - Acceptance criteria per feature (one numbered list per feature).
   - Blast radius from the **existing system** point of view (which user flows, which data shapes, which permissions).
   - Out-of-scope items (explicit non-goals).
3. Decompose the initial_request into **1..N Features**, each a kanban card with:
   - `id` (`F1`, `F2`, ...)
   - `title`
   - `actor`
   - `acceptance_criteria` (numbered list)
   - `existing_system_impact` (paragraphs / bullets)
   - `out_of_scope` (bullets)
4. Write Features to `wave-state.json` and render `requirement-verse.html` from the bundled template.

★ **Gate 1: user approves `requirement-verse.html`.** Use `AskUserQuestion` with three options: *Approve*, *Edit a feature*, *Cancel wave*. Do not proceed without explicit approval.

### Step 3 — Architect (Agent 2)

Spawn the Architect via `Agent` with `subagent_type: general-purpose`.

**Architect's contract:**
1. Read `requirement-verse.html` AND `wave-state.json` AND any project-level architecture docs (`CLAUDE.md`, `~/.claude/CODING_REFERENCE.md`).
2. Interview the user **only for gaps** — do NOT re-ask anything the Analyst already captured. Acceptable Architect questions are about *implementation strategy*, not requirements.
3. For each Feature, decompose into **1..N Tasks**, each tagged with:
   - `id` (`F1-T1`, `F1-T2`, ...)
   - `title`
   - `tier`: one of `db` / `service` / `api` / `ui` (drives Dev specialization)
   - `scope_paths`: array of file globs the task may touch (used by parallelism scheduler)
   - `depends_on`: array of task IDs that must complete first
   - `acceptance_test_hint`: how QA should test this (full sentence, not just kind)
   - `existing_patterns_to_follow`: bullet list citing existing files/patterns in the codebase that this task should mirror
4. Encourage **decoupled, simplistic, reusable** designs. Architect must explicitly cite **at least one existing pattern** per Feature that the implementation should mirror (e.g. "follow the three-tier service pattern in `lib/services/`").
5. Write Tasks to `wave-state.json` and render `architecture-verse.html`.

★ **Gate 2: user approves `architecture-verse.html`.** Scope is now FROZEN — anything not listed in tasks or marked in scope_paths is off-limits for the wave.

### Step 4 — QA Agent (Agent 3)

Spawn the QA agent via `Agent` with `subagent_type: general-purpose`.

**QA's contract:**
1. Read `requirement-verse.html`, `architecture-verse.html`, and `wave-state.json`.
2. For each task, decide test kind:
   - `playwright` if `tier == "ui"` and the task touches user-visible workflow
   - `e2e` if `tier == "db"` or `tier == "api"` (hits the database or external services)
   - `vitest-unit` if `tier == "service"` and the logic is pure / resource-free
   - When in doubt, prefer the *higher-fidelity* test (Playwright > E2E > unit)
3. If `vitest-unit` is needed and Vitest is not configured in the consuming project, propose scaffolding it. **User approval required** before adding the dev dependency or config — present as `AskUserQuestion`.
4. Write **failing** tests. Each test must:
   - Live in the right folder (`playwright-tests/` for UI, `e2e/` for service/API, `__tests__/` or `*.test.ts` for unit per project convention).
   - Map to exactly one task ID (`F1-T1`, etc.) — recorded in a JSDoc/header comment for traceability.
   - Fail for the right reason (the feature isn't built yet), not config drift.
5. Run the tests. Paste output as evidence.
6. Update `wave-state.json` with `test_path` per task. Render `qa-verse.html`.

★ **Gate 3 (Dry-run boundary): user approves `qa-verse.html` AND the failing tests.** This is the most expensive gate to fail past — failing tests that encode the wrong acceptance criteria poison the rest of the wave.

By default, the skill **stops here** unless the user explicitly chose to continue past dry-run in the interview.

### Step 5 — Dev wave (Agents 4..n)

After gate 3 approval, the orchestrator schedules Dev agents.

**Scheduling rules:**
- A task is **eligible** when all its `depends_on` tasks are `done`.
- Two eligible tasks may run **in parallel** only if their `scope_paths` arrays have **no overlap** (no shared files, no shared globs).
- Concurrency cap: 3 parallel Dev agents by default (user-configurable in interview).
- Each Dev agent is spawned with a **tier-specialized prompt prelude** based on `task.tier`:
  - `db` — Supabase migrations, RLS, schema; warned about data-protection rule
  - `service` — pure functions / three-tier service pattern; warned about result-shape conventions
  - `api` — thin route handlers; warned about not embedding business logic
  - `ui` — React/Tailwind/shadcn; warned about a11y and existing component reuse

**Dev contract:**
1. Read the failing test mapped to this task.
2. Read existing_patterns_to_follow from architecture-verse.
3. Implement the **smallest change** within `scope_paths` that turns the test green.
4. Run the test. Run `npm run lint` and `npm run build`. If UI, optionally verify via Chrome DevTools/Playwright MCP.
5. Hand back to QA: files changed (with line refs), test output, lint/build status, browser notes (if applicable).

**Hard rules for Dev:**
- MUST NOT edit any test file (halt-the-loop offense).
- MUST NOT touch files outside its declared `scope_paths` (halt-the-loop offense, logged to `suspicious[]`).
- MUST NOT weaken or skip assertions, add mocks that bypass the test, or otherwise game the contract.
- Story-style code is a guideline (action-named helpers, short functions) but NOT a halt condition.

### Step 6 — QA ↔ Dev loop

Per task:

```
QA confirms test fails for the right reason
   ↓
Dev (tier-specialized) implements
   ↓
Dev runs test + lint + build
   ↓
QA reruns test independently
   ├─ green → mark task done
   └─ red → return to Dev with specific failure
```

**Caps:**
- **Soft cap — 3 iterations on the same task:** halt this task, escalate to Architect. Architect re-reads the task in context, may amend `architecture-verse.html` (a new "Revision N" section is appended, not overwritten), then the loop resumes.
- **Hard cap — 5 total iterations on the same task:** halt the wave for this task. Write `handoff.md` and surface to user.

**QA may pause a Dev** if:
- Build breaks more than once in a row, OR
- The Dev's diff touches files outside `scope_paths` (logged to `suspicious[]` and surfaced immediately), OR
- The Dev introduces obvious test-bypass (mock of the system under test, env-var skip, etc.).

A paused Dev waits for orchestrator decision: resume with a corrective prompt, escalate to Architect, or halt.

### Step 7 — Feature done / Wave done

- **Feature done** = all its tasks are `done` (QA-confirmed green) AND no open `suspicious[]` items targeting that feature.
- **Wave done** = all features done.

### Step 8 — Render `result.html` and report

Final orchestrator step:

1. Update `wave-state.json` with final status.
2. Render `result.html` from the bundled template, including:
   - Per-feature, per-task status table
   - Iteration counts per task
   - `suspicious[]` array fully rendered (one row per event)
   - `escalations[]` (when Architect was re-engaged)
   - Files touched (deduplicated)
   - Total agents spawned and total run time
3. Surface to user with a one-paragraph summary and next-action prompt (commit? PR?).

## Iteration caps (summary)

- **Soft cap — 3 same-task iterations:** halt task, escalate to Architect, append Revision section.
- **Hard cap — 5 same-task iterations:** halt wave, write `handoff.md`.
- **Suspicious-changes ceiling — 3 events on the same task:** auto-halt the task even if not at iteration cap.

These reconcile the user's auto-memory `feedback_qa_fixer_workflow.md` (≤3 same-topic) with the longer-running nature of feature work (multi-task loop).

## Halt conditions

The skill stops and surfaces — never silently continues — when:

- Worktree state cannot be confirmed (detached HEAD, no git, etc.).
- The user declines any of the three gates.
- The Analyst cannot extract features from the initial_request (vague request — surfaces a clarifying interview round).
- The Architect cannot tier a task (`tier == "unknown"` → halt, ask user).
- The QA agent cannot write a test for a task (timing-sensitive, infra-dependent) — QA documents *why* and proposes manual verification; orchestrator surfaces this rather than silently skipping.
- A Dev agent edits a test file or touches files outside `scope_paths`.
- An iteration cap or suspicious-changes ceiling trips.
- `npm run lint` or `npm run build` fails for a reason unrelated to the task.
- Out-of-scope guardrails (from `requirement-verse.html` or `architecture-verse.html`) are violated.

## Usage

```
/implement-feature                                    # Fully interactive
/implement-feature <one-line feature description>     # Seed initial_request, then interactive
```

This skill does not have a CLI binary — it is purely conversational and runs inside the assistant. The skill writes to disk: `docs/waves/wave-<slug>-<xxxx>/` in the consuming project.

## Requirements

- Git 2.30+ for modern `git worktree` semantics.
- Node.js 18+ for `npm run lint` / `npm run build`.
- A buildable command and at least one test runner in the consuming project (Playwright, Vitest, or both). Vitest is scaffolded only with user approval.
- For browser verification: Chrome DevTools or Playwright MCP server registered in the session.

## See also

- [`template.md`](./template.md) — the embedded orchestrator prompt template
- [`README.md`](./README.md) — design notes and rationale
- [`templates/`](./templates/) — bundled HTML templates and state JSON schema
- [`/fix-issue`](../fix-issue/SKILL.md) — the single-bug sibling skill
- [`/git-checkin`](../git-checkin/SKILL.md) — used to commit/push after wave completion
- [`/git-pr-merge`](../git-pr-merge/SKILL.md) — used to open and merge the wave PR
- [`/gen-worktree-report`](../gen-worktree-report/SKILL.md) — alternative end-of-wave reporting
