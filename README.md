# stx-skills

Organization-wide [Claude Code](https://docs.claude.com/en/docs/claude-code) skills collection — eight slash-commands that drive feature waves, bug fixes, commits, PR merges, and documentation, all built around the worktree model. Install into any project without publishing to npm.

📖 **[Open the walkthrough →](https://sudiptosen.github.io/stx-skills/)** *(once GitHub Pages is enabled — see [GitHub Pages](#github-pages) below)*

Current release: **v1.6.0** · MIT licensed.

---

## Quick install

```bash
# From the GitHub repo — no clone needed
cd ~/projects/my-app
npx github:sudiptosen/stx-skills

# From a local sibling clone
npx ../stx-skills

# From an absolute path
npx /Users/me/projects/stx-skills

# Install into an explicit target
npx ../stx-skills ~/projects/my-app
```

> ⚠️ **Syntax note.** The package path goes right after `npx`. Do not prefix it with `install` — `npx install ../stx-skills` fails with `could not determine executable to run` because npx treats `install` as the package name. (`npm install` is different; that's the `npm` CLI.) The word `install` is accepted only *after* the package spec: `npx ../stx-skills install` works as a no-op verb.

Re-running the installer **refreshes** — existing skill directories are wiped and replaced with the latest, so one command covers first install and updates.

### Installer options

```bash
npx ../stx-skills --link                    # symlink for live updates (dev mode)
npx ../stx-skills --skill stx-feature       # install only one skill
npx ../stx-skills --list                    # show what's available
npx ../stx-skills --force                   # overwrite existing installs
npx ../stx-skills --help
```

---

## Skill catalog

Every skill is one of three types based on where you run it:

| Type | Meaning | Skills |
|---|---|---|
| **main-bound** | You're on `main` and want to start something (skill spawns a worktree) | `/stx-feature`, `/stx-fix` |
| **worktree-bound** | You're in a feature worktree (skill operates on it) | `/stx-pr-merge`, `/stx-report` |
| **any-bound** | Runs anywhere — utilities | `/stx-checkin`, `/stx-image`, `/stx-help`, `/stx-help-html` |

### `/stx-feature` — multi-agent feature wave  *(main-bound)*

Interview → Analyst → Architect → QA → tier-specialized Dev agents. Three approval gates, suspicious-change tracking, iteration caps. Produces `requirement-verse.html`, `architecture-verse.html`, `qa-verse.html`, `result.html` under `docs/waves/<wave-id>/`.

```bash
/stx-feature                                              # Fully interactive
/stx-feature Admin multi-delete on /dashboard             # Seed the request
/stx-feature --resume wave-admin-multi-delete-7f3a        # (planned)
```

See [.claude/skills/stx-feature/SKILL.md](.claude/skills/stx-feature/SKILL.md).

### `/stx-fix` — two-agent bug-fix loop  *(main-bound)*

Drives a QA → Coder loop against a reproducible bug. QA writes the failing test first; the Coder makes the smallest change to pass. Coder cannot touch test files — that halts the loop. Iteration cap default 5.

```bash
/stx-fix                                       # Interactive
/stx-fix Timer offset wrong after DST          # Pre-supply the title
```

See [.claude/skills/stx-fix/SKILL.md](.claude/skills/stx-fix/SKILL.md).

### `/stx-checkin` — secure commit + push  *(any-bound)*

Pre-commit security scan, deleted-file confirmation, branch-aware push/PR. Blocks secrets (`.env`, `*.pem`, `credentials.json`, …) and warns on noise (`.DS_Store`, `node_modules/`, files >10 MB).

```bash
/stx-checkin                       # Interactive
/stx-checkin -m "feat: add login"  # With commit message
/stx-checkin --dry-run             # Preview only
/stx-checkin --skip-push           # Commit without push
```

See [.claude/skills/stx-checkin/SKILL.md](.claude/skills/stx-checkin/SKILL.md).

### `/stx-pr-merge` — commit → PR → merge → cleanup chain  *(worktree-bound)*

Ten-step chain with build-validation gates around the merge. Halts on any failure for user review. Falls back to `gh api -X DELETE …git/refs/heads/<branch>` when local-checkout blocks branch deletion.

```bash
/stx-pr-merge                                    # Run with chained approval
/stx-pr-merge --interactive                      # Prompt at each gate
/stx-pr-merge --dry-run                          # Print every command without executing
/stx-pr-merge --pr-title "fix: timer offset"     # Pre-supply the PR title
```

Pre-flight → commit → push & PR → **build #1** → squash-merge → refresh main → **build #2** → worktree cleanup → branch delete.

See [.claude/skills/stx-pr-merge/SKILL.md](.claude/skills/stx-pr-merge/SKILL.md).

### `/stx-report` — single-file worktree HTML report  *(worktree-bound)*

Produces a polished `*.html` under `docs/` documenting a worktree's changes. Same shape every time: stats, status pills, approach trade-off table, two Mermaid diagrams, per-file diffs with informative hunks, test output, deferred caveats.

```bash
/stx-report                                          # cwd, infer everything
/stx-report --worktree ../feature-branch             # explicit path
/stx-report --base develop                           # diff base (default: main)
/stx-report --title "PNG → PDF migration"            # override title
```

See [.claude/skills/stx-report/SKILL.md](.claude/skills/stx-report/SKILL.md).

### `/stx-image` — AI-context-safe image audit  *(any-bound)*

Reports unused and oversized images with a "why" for each target, then optionally resizes via macOS `sips` or removes unused. Default mode makes zero changes.

```bash
/stx-image                                  # Analyze cwd
/stx-image public/                          # Analyze a subdirectory
/stx-image --apply                          # Resize oversized in-place
/stx-image --apply --delete-unused          # Also remove unreferenced
/stx-image --size-kb 300 --max-dimension 1280   # Tighter thresholds
```

Thresholds default to 500 KB and 1568 px (Claude Vision's internal cap); logos/icons target 512 px.

See [.claude/skills/stx-image/SKILL.md](.claude/skills/stx-image/SKILL.md).

### `/stx-help` — terse text-mode reference  *(any-bound)*

Prints every skill grouped by type with one-line descriptions. Ends with a pointer to `/stx-help-html` for the visual walkthrough.

```bash
/stx-help
```

See [.claude/skills/stx-help/SKILL.md](.claude/skills/stx-help/SKILL.md).

### `/stx-help-html` — editorial walkthrough  *(any-bound)*

Opens [`help.html`](.claude/skills/stx-help-html/help.html) — the full walkthrough doc with diagrams, expandable skill catalog, settings reference, and pending-features backlog. Same content drives the GitHub Pages site (see below).

```bash
/stx-help-html
```

See [.claude/skills/stx-help-html/SKILL.md](.claude/skills/stx-help-html/SKILL.md).

---

## GitHub Pages

The walkthrough doc is also published as a GitHub Pages site so anyone can browse it without installing the package. The Pages content is `docs/index.html`, a synced copy of `.claude/skills/stx-help-html/help.html`.

**To enable Pages on this repo (one-time, after merge):**

1. Go to repo **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **`main`**, folder: **`/docs`**
4. Save

The site goes live at `https://sudiptosen.github.io/stx-skills/`.

**Keeping docs in sync:** the canonical source is `.claude/skills/stx-help-html/help.html` (it ships with the skill). `npm run build` also runs `prepare-docs`, which copies it to `docs/index.html`. Edit only the canonical; the build pushes it to `docs/`.

```bash
npm run build           # tsc + copy to docs/index.html
npm run prepare-docs    # just the copy step
```

---

## Development

```bash
npm install
npm run build       # compile TypeScript + sync docs/index.html
npm run watch       # recompile TS on change
npm run clean       # remove dist/

# Smoke test skills
node dist/skills/stx-checkin.js --dry-run
node dist/skills/stx-image.js --help
node dist/skills/stx-report.js --pretty
node dist/cli/install.js --list
```

### Adding a new skill

1. Add `src/skills/<skill-name>.ts` with a `#!/usr/bin/env node` shebang (only if the skill has a CLI binary).
2. Create `.claude/skills/<skill-name>/SKILL.md` with YAML frontmatter (`name`, `description`, `version`, `author`) and optionally `README.md` with design notes.
3. If the skill has a binary, register it in `package.json`:
   ```json
   "bin": { "<skill-name>": "./dist/skills/<skill-name>.js" }
   ```
4. Document the skill in this README and add a catalog entry in `.claude/skills/stx-help-html/help.html`.
5. `npm run build` to verify it compiles and sync the docs.

The installer auto-discovers every directory under `.claude/skills/` — no registration needed there.

---

## File structure

```
stx-skills/
├── package.json                              # bin: stx-skills + 4 skill binaries
├── tsconfig.json
├── src/
│   ├── cli/
│   │   └── install.ts                        # npx stx-skills entry point
│   └── skills/
│       ├── stx-checkin.ts
│       ├── stx-pr-merge.ts
│       ├── stx-image.ts
│       └── stx-report.ts
├── dist/                                     # gitignored — compiled output
├── docs/
│   └── index.html                            # GitHub Pages — synced from help.html
├── .claude/
│   └── skills/
│       ├── stx-feature/        (SKILL.md + templates/ + dev-prompts/)
│       ├── stx-fix/            (SKILL.md + template.md)
│       ├── stx-checkin/        (SKILL.md + README.md)
│       ├── stx-pr-merge/       (SKILL.md + README.md)
│       ├── stx-image/          (SKILL.md + README.md)
│       ├── stx-report/         (SKILL.md + template.html)
│       ├── stx-help/           (SKILL.md)
│       └── stx-help-html/      (SKILL.md + README.md + help.html)  ← canonical doc
└── scripts/
    └── install.sh                            # fallback bash installer
```

---

## License

MIT
