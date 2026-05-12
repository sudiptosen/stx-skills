# /stx-help-html — design notes

This skill is intentionally thin. It exists to give the assistant a clean
slash-command entry-point for "open the docs" so users don't have to
remember the file path. The substance lives in `help.html`.

## Why a separate skill instead of just adding `--help` to existing skills

Each existing skill (`/stx-feature`, `/stx-fix`, etc.) has its
own `--help` output focused on that skill's interface. `/stx-help-html`
covers the **whole package** — how the skills fit together, when to use
which, the worktree model, the settings reference. A per-skill flag
can't serve that role.

## Why HTML instead of markdown

Three reasons:

1. **Diagrams.** The walkthrough leans on visual flow (zone model,
   worktree lifecycle, 5-minute tour). Inline SVG renders cleanly in
   the browser; markdown renderers vary in how they handle SVG.
2. **Expandable skill catalog.** The `<details>` element gives one-line
   summaries with click-to-expand details. Markdown doesn't have a
   portable equivalent.
3. **Shareability.** A self-contained HTML file is one URL away from
   being a teammate's shared resource. Markdown needs a renderer.

## Why open in the default browser

We considered three options:

| Option | Pros | Cons |
|---|---|---|
| `open` in default browser (chosen) | Simplest UX; works on macOS; user sees full styling | Linux needs `xdg-open` fallback |
| Print path, let user click | Zero magic | Friction; many terminals don't make file paths clickable |
| Embed in terminal via ANSI / images | Cute | Wildly inconsistent renderer support |

`open` won because it's the lowest-friction path on macOS (which the
user's setup is) and the Linux fallback is a single conditional.

## Why no `--print` or `--text` flags

Resist the temptation to add a "render this HTML as markdown" mode.
The HTML is the authoritative version; a markdown export would drift
from it and create two truths. A separate `/stx-help` skill (planned)
will own the terse text format from scratch, written for that medium.

## How the HTML gets updated

Source-of-truth: `help.html` in this skill directory in the
`stx-skills` package. When the package is updated and a user re-runs
the installer, `help.html` is overwritten with the latest version (per
the installer's hard-refresh semantics).

When adding a new skill or changing an existing one's behavior, update
both the skill's own `SKILL.md` AND the relevant section of `help.html`.
The `help.html` is hand-maintained — not auto-generated from the
SKILL.mds — because the prose and diagrams are the value, not a
mechanical concatenation.

## Why `zone: any`

The skill opens a static HTML file. No state mutation, no git
operations, no preference for which branch is checked out. The `any`
zone is the right call — forcing it to be main-bound would block users
from opening docs while working inside a worktree (which is exactly
when they're most likely to want them).

## What this skill explicitly does NOT do

- It does NOT regenerate the HTML from SKILL.mds. Editing the HTML is a
  conscious authoring choice; auto-generation would lose the editorial
  voice.
- It does NOT track which version of the docs the user has seen. Open
  it as often as you want; the content is intended to be re-read.
- It does NOT take any arguments. If you want to deep-link to a
  section, add an anchor to the URL manually:
  `open .claude/skills/stx-help-html/help.html#settings`.

## Future work

- A `/stx-help` text-mode sibling for in-terminal display (planned).
- A linter that flags drift between the catalog cards in `help.html`
  and the actual `SKILL.md` files (low priority — drift is rare and
  obvious at review time).
