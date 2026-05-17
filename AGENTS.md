# AGENTS.md

Persona inventory for the STX Skills package. Each persona is a versioned markdown file under [`.claude/agents/`](.claude/agents/) consumed by one or more skills at spawn time.

This file is the **portable standard** named in pattern #6 of the 2026 agentic-coding convergence (AGENTS.md + skills + MCP). Teams browsing this repo can map every agent role to its contract without reading skill internals.

## How personas are used

At spawn time, the skill orchestrator:

1. Reads the persona file from `.claude/agents/<name>.md`.
2. Pastes its body verbatim into the sub-agent's prompt.
3. Appends task-specific context (file paths, prior verdicts, the specific failing test).
4. Records the persona version in `wave-state.json.persona_versions` so the wave is reproducible.

Personas are **not** modified by skills at runtime. To evolve a contract, edit the persona file directly and bump its `version` in the YAML frontmatter.

## Inventory

| Persona | File | Version | Role | Consumed by |
|---|---|---|---|---|
| Analyst | [`.claude/agents/stx-analyst.md`](.claude/agents/stx-analyst.md) | 1.0.0 | Decomposes feature request into Features with acceptance criteria | `/stx-feature` (Step 2) |
| Architect | [`.claude/agents/stx-architect.md`](.claude/agents/stx-architect.md) | 1.0.0 | Decomposes Features into tier-tagged Tasks with scope_paths + dependencies | `/stx-feature` (Step 3 + soft-cap escalation in Step 6) |
| QA | [`.claude/agents/stx-qa.md`](.claude/agents/stx-qa.md) | 1.0.0 | Authors failing tests; reruns them; only agent that may edit test files | `/stx-feature` (Step 4 + Step 6 loop), `/stx-fix` (loop) |
| Coder | [`.claude/agents/stx-coder.md`](.claude/agents/stx-coder.md) | 1.0.0 | Single-bug implementer for /stx-fix | `/stx-fix` (loop) |
| Dev (universal prelude) | [`.claude/agents/stx-dev-base.md`](.claude/agents/stx-dev-base.md) | 1.0.0 | QA-Dev contract, scope guardrails, story-style code, hand-back format | `/stx-feature` (Step 5, every Dev) |
| Dev (db tier) | [`.claude/agents/stx-dev-tier-db.md`](.claude/agents/stx-dev-tier-db.md) | 1.0.0 | DB-tier overlay: migrations, RLS, data-protection guards | `/stx-feature` (Step 5 when `task.tier == "db"`) |
| Dev (service tier) | [`.claude/agents/stx-dev-tier-service.md`](.claude/agents/stx-dev-tier-service.md) | 1.0.0 | Service-tier overlay: three-tier service pattern, result shapes | `/stx-feature` (Step 5 when `task.tier == "service"`) |
| Dev (api tier) | [`.claude/agents/stx-dev-tier-api.md`](.claude/agents/stx-dev-tier-api.md) | 1.0.0 | API-tier overlay: thin handlers, Zod, auth, idempotency | `/stx-feature` (Step 5 when `task.tier == "api"`) |
| Dev (ui tier) | [`.claude/agents/stx-dev-tier-ui.md`](.claude/agents/stx-dev-tier-ui.md) | 1.0.0 | UI-tier overlay: React + Tailwind + shadcn, a11y, browser verification | `/stx-feature` (Step 5 when `task.tier == "ui"`) |

Total: **9 personas** across **2 skills**.

## Persona frontmatter shape

Every persona file starts with YAML frontmatter:

```yaml
---
name: stx-<role>
description: One-line summary of what this persona does.
version: <semver>
author: STX
role: <analyst|architect|qa|coder|dev-base|dev-tier>
tier: <db|service|api|ui>             # only on tier personas
extends: stx-dev-base                  # only on tier personas
inputs:
  - <what the orchestrator provides at spawn time>
outputs:
  - <what the persona produces>
gates:
  - "<gate name and what it gates>"    # only on gated personas
consumed_by:
  - <skill name and step>
---
```

The version field is **independent** of `package.json`. Personas evolve at their own cadence — `stx-qa.md` can ship a v1.2.0 update without bumping the package.

## Conventions

- **One persona, one file.** Don't merge two roles into one persona file even if their contracts overlap by 80%.
- **Tier personas overlay the base persona.** They never duplicate the base contract — they only state what's different.
- **Wikilinks for cross-references.** Use `[[stx-dev-base]]` inside a persona body to reference another persona. The orchestrator resolves these as relative paths.
- **No inline contracts in SKILL.md files.** If a SKILL.md needs to spawn an agent, it loads the persona by file reference. The grep guard for this is:
  ```bash
  grep -rE "Analyst's contract|Architect's contract|QA's contract|Coder's contract" .claude/skills/
  ```
  Should return zero hits (except in `## See also` / `## Personas` reference blocks).

## Versioning policy

- Bump **PATCH** (1.0.0 → 1.0.1) for wording / style edits that don't change the contract semantics.
- Bump **MINOR** (1.0.0 → 1.1.0) for additive contract changes (new optional rule, new hand-back field).
- Bump **MAJOR** (1.0.0 → 2.0.0) for breaking contract changes (renamed required output, removed responsibility).

Bumps must be reflected in `wave-state.json.persona_versions` for every wave started after the bump.

## Adding a new persona

1. Create `.claude/agents/<name>.md` with the frontmatter above and a clear contract body.
2. Add a row to the **Inventory** table here.
3. Add `<name>` to `wave-state.json.persona_versions.properties` in `.claude/skills/stx-feature/templates/wave-state.schema.json` (if consumed by `/stx-feature`).
4. Update the consuming skill's SKILL.md to load the persona by reference.
5. Bump the consuming skill's version in its frontmatter (MINOR if the new persona is optional, MAJOR if required).

## See also

- [`README.md`](README.md) — package overview and install instructions
- [`.claude/skills/stx-feature/SKILL.md`](.claude/skills/stx-feature/SKILL.md) — wave orchestrator
- [`.claude/skills/stx-fix/SKILL.md`](.claude/skills/stx-fix/SKILL.md) — bug-fix orchestrator
- [`.claude/skills/stx-feature/templates/wave-state.schema.json`](.claude/skills/stx-feature/templates/wave-state.schema.json) — canonical wave state including `persona_versions`
