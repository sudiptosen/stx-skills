---
name: stx-fix
description: Drives a two-agent QA → Coder loop against a known bug (or small cluster of related bugs). Interviews the user to fill the prompt template, confirms the worktree state, presents the rendered prompt for explicit user acceptance, then kicks off the loop. Use when the user has a reproducible bug and wants a failing test written first, then the smallest code change that makes it pass.
version: 1.1.0
author: STX
---

## Personas (loaded by reference)

This skill spawns two agents. Their contracts live in `.claude/agents/`:

| Persona file | Role |
|---|---|
| `.claude/agents/stx-qa.md` | QA (test owner) — shared with `/stx-feature` |
| `.claude/agents/stx-coder.md` | Coder (single-bug implementer) |

`template.md` references these persona files in §5 of the rendered prompt. See [`AGENTS.md`](../../../AGENTS.md) at the repo root for the full inventory.

# /stx-fix

A guided multi-step bugfix workflow. The skill interviews the user for the bug details, confirms the worktree state, renders a complete prompt from the embedded `template.md`, gets explicit user acceptance, and then drives a strict QA → Coder → QA loop until the bug is fixed (or until the iteration cap is hit and the loop is escalated).

## When to use it

- A reproducible bug (or small cluster of related bugs) needs to be fixed.
- The user wants the **failing test written first**, then the smallest code change that makes it pass — not freeform "investigate and patch."
- The work fits inside a single worktree.

Do **not** use this skill for:
- New features (use a different planning flow).
- Refactors with no behavior change (no failing test to anchor to).
- Vague reports without a reproduction (interview the user to a concrete repro first).

## Governance — read before running

This skill operates under the user's CRITICAL governance rules from `~/.claude/CLAUDE.md`:

1. **Always Work In A Worktree (HIGHEST PRIORITY).** This skill MUST confirm the user is on a worktree before any test or code edit. If the user is on `main` / `master`, the skill **stops and proposes** a new worktree before continuing.
2. **No Commits or Deployments Without Approval.** Any commit, push, or PR step at the end of the loop is gated on explicit user approval.
3. **Data Protection.** No destructive operation (no test deletion, no force-pushes, no branch removal) without an explicit named approval.
4. **QA / Fixer separation (per user's auto-memory `feedback_qa_fixer_workflow.md`).** The Coder MUST NOT edit the test files. Touching test files is a halt-the-loop offense.

## Workflow steps

The skill runs strictly in order. The user is asked to confirm at the **review gate** (step 5) before any test or code is written.

### Step 1 — Confirm worktree state (always first)

Before asking any other questions, the skill must check the current git state:

```bash
git rev-parse --abbrev-ref HEAD
git worktree list --porcelain
```

Decision tree:
- **On a feature/bugfix branch in a non-main worktree:** confirm the worktree path with the user (one-line: "We're on `<branch>` at `<path>` — work here?"). If yes, continue. If no, treat as if on main.
- **On `main` / `master`:** STOP. Propose a new worktree. Use `AskUserQuestion` with two options: (a) create a new worktree with a sensible name derived from the bug title, (b) the user supplies a custom name. Do NOT proceed to step 2 until a worktree exists.

The worktree command pattern:

```bash
git worktree add .claude/worktrees/<name> -b bugfix/<name>
ln -sf <main-repo>/.env.local .claude/worktrees/<name>/.env.local  # if applicable
```

### Step 2 — Interview the user (fill the form)

Use `AskUserQuestion` (or grouped questions in a single call when possible) to collect every field declared in the FORM_FIELDS YAML block at the top of `template.md`. Group related questions to minimize round-trips.

Required fields (must be answered):

| Field | Question style | Notes |
|---|---|---|
| `title` | Free-text | One short line. Becomes PR title and working label. |
| `issues` | Free-text, numbered list | One line per distinct symptom. No causes, no fixes — symptoms only. |
| `repro` | Free-text | URL, user/state, steps. Concrete enough to replay. |
| `expected` | Free-text, numbered list | Mirrors `issues` 1:1. This is the acceptance criteria. |
| `test_kind` | Radio | `playwright`, `vitest-unit`, or `both`. Default: `playwright` for UI bugs, `vitest-unit` for service/logic bugs. |
| `iteration_cap` | Number | Default 5. |
| `commit_policy` | Radio | `no-commit`, `commit-after-green`, `commit-and-pr`. Default: `commit-after-green`. |

Optional fields (skip if not provided):

| Field | Question style | Default |
|---|---|---|
| `scope_hints` | Free-text | Empty / "unknown — investigate." |
| `out_of_scope` | Free-text | Empty. |
| `use_browser_mcp` | Yes/No | Default `yes` for Playwright tests, `no` for unit-only. |

Interview etiquette:

- **Don't ask all 10 questions at once.** Group into 2–3 rounds of `AskUserQuestion`.
- **Re-state the user's input** in your own words after the interview, before rendering — this catches misunderstandings cheaply.
- **Never invent values** for required fields. If the user is vague, ask a clarifying follow-up.

### Step 3 — Render the template

Substitute every `{{FIELD}}` placeholder in `template.md` with the user's answer, and resolve every `{{#if FIELD == "value"}} … {{/if}}` conditional block. Strip the FORM_FIELDS YAML and the HOW THE EXTENSION SHOULD USE THIS FILE comment block — those are renderer instructions, not part of the agent prompt.

The rendered output is a single markdown document with the sections:

1. Setup (only if a new worktree was just created)
2. The issues
3. Reproduction
4. Expected behavior (acceptance criteria)
5. Scope
6. Agent roles and contracts (QA + Coder)
7. The loop
8. Done criteria
9. After green
10. Reporting back to the user

### Step 4 — Show the rendered prompt to the user

Present the rendered prompt in a fenced code block (or as a clearly-marked preview) for the user to read. Do not start the loop yet. State explicitly:

> "Here is the rendered prompt that will drive the QA → Coder loop. Review and approve before I start."

### Step 5 — Acceptance gate (HARD STOP)

Use `AskUserQuestion` with three options:

1. **Approve and start.** The skill proceeds to step 6.
2. **Edit a field.** The skill loops back to step 2 for the named field, re-renders, and re-asks. (Keep all other fields.)
3. **Cancel.** The skill stops and writes nothing.

Do NOT proceed without explicit approval. A vague "looks good, maybe go" is not approval — re-ask.

### Step 6 — Run the QA → Coder loop

Once approved, execute the rendered prompt as the orchestrator. The orchestrator (the assistant running this skill) becomes the **router and judge**. It does NOT write production code or tests directly — it spawns sub-agents.

Sub-agent assignment guidance:

- **QA agent** — spawn via `Agent` tool with `subagent_type: general-purpose` (or a dedicated test agent if available). Paste the contents of `.claude/agents/stx-qa.md` into the agent's prompt verbatim, then append §1 (issues), §3 (expected), and the test-kind constraint from the rendered prompt. Hand the failing test back to the orchestrator for verification.
- **Coder agent** — spawn via `Agent` tool with `subagent_type: general-purpose`. Paste the contents of `.claude/agents/stx-coder.md` into the agent's prompt verbatim, then append the failing test paths, the issue list, the suspected files, and the out-of-scope list.

Both persona files contain the full contract, hard rules, and reporting format. The orchestrator does NOT re-implement persona logic here. If a persona file cannot be read at spawn time, halt — do not fall back to inline prompts.

Loop control is the orchestrator's job. The sub-agents do not decide when the loop ends.

### Step 7 — Done or halted

Apply the rendered §7 (Done criteria) and §8 (After green) sections. Surface the final report per §9.

If the iteration cap trips, write the handoff doc to `docs/tasks/<title-slug>-handoff.md` and surface to the user with a one-paragraph summary. Do NOT silently retry.

## Iteration caps (from the rendered template, summarized)

- **Soft cap — 3 cycles on the same surface bug:** halt and escalate. Same symptom across 3 attempts means the loop is converging on the wrong abstraction.
- **Hard cap — N total cycles** (user-configurable, default 5): absolute ceiling. Halt and escalate.

When a cap trips: stash uncommitted changes (or commit on a `wip/<slug>` branch), write the handoff doc, escalate.

## Halt conditions

The skill stops and surfaces — never silently continues — when:

- Worktree state cannot be confirmed (git not initialized, detached HEAD, etc.).
- The user declines the acceptance gate at step 5.
- The QA agent reports a test cannot be written for an issue (with a stated reason).
- The Coder agent edits a test file (immediate halt — escalate).
- The Coder agent loosens or skips an assertion (immediate halt — escalate).
- An iteration cap trips.
- `npm run lint` or `npm run build` fails for a reason unrelated to the bug.
- The out-of-scope list in §4 of the rendered prompt is touched.

## Usage

```
/stx-fix                                    # Interactive; the skill interviews the user
/stx-fix <bug title>                        # Pre-supply the title; everything else is interactive
```

This skill does not have a CLI binary — it is purely conversational and runs inside the assistant.

## Requirements

- Git 2.30+ (for modern `git worktree` semantics)
- Node.js 18+ (for `npm run lint` / `npm run build` validation)
- The project must have a buildable command and a test runner (Vitest, Playwright, or both)
- For browser verification: a Chrome Dev / Playwright MCP server registered in the session

## See also

- [`AGENTS.md`](../../../AGENTS.md) — repo-root persona inventory
- [`.claude/agents/stx-qa.md`](../../agents/stx-qa.md) — QA persona (shared with `/stx-feature`)
- [`.claude/agents/stx-coder.md`](../../agents/stx-coder.md) — Coder persona
- [`template.md`](./template.md) — the embedded prompt template
- [`README.md`](./README.md) — design notes and rationale
- [`/stx-checkin`](../stx-checkin/SKILL.md) — used by `commit-after-green` and `commit-and-pr` policies to perform the actual commit/push
