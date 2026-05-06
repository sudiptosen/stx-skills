# stx-skills

Organization-wide [Claude Code](https://docs.claude.com/en/docs/claude-code) skills collection. Install into any project without publishing to npm.

## Install (no registry needed)

```bash
# From the GitHub repo (recommended — no clone needed)
cd ~/projects/my-app
npx github:sudiptosen/stx-skills

# From a local sibling clone
cd ~/projects/my-app
npx ../stx-skills

# From an absolute path
npx /Users/me/projects/stx-skills

# Install into an explicit target
npx ../stx-skills ~/projects/my-app
```

> ⚠️ **Syntax note.** The package path goes **right after `npx`**. Do not prefix it with `install` — `npx install ../stx-skills` fails with `could not determine executable to run` because npx treats `install` as the package name. (`npm install` is different; that's the `npm` CLI, not `npx`.) The word `install` is accepted only **after** the package spec: `npx ../stx-skills install` works as a no-op verb.

How this works without a registry: `npx` accepts a local path or a `github:user/repo` spec, installs the package into a temporary cache, and runs the default bin (the one that matches the package name — `stx-skills`). The `prepare` script builds the TypeScript to `dist/` during install, so the bin is always up to date.

Re-running the install **refreshes** — existing skill directories in the target are wiped and replaced with the latest, so it's the one command for both first-time install and updates.

### Options

```bash
npx ../stx-skills --link                  # symlink for live updates (dev mode)
npx ../stx-skills --skill image-resize    # install only one skill
npx ../stx-skills --list                  # show what's available
npx ../stx-skills --force                 # overwrite existing installs
npx ../stx-skills --help
```

### Alternative installers

```bash
# Shell installer (same outcome, no Node needed)
./scripts/install.sh /path/to/target/project

# Manual symlink for contributors who want to edit skills live
ln -s /abs/path/stx-skills/.claude/skills/git-checkin \
      /path/to/project/.claude/skills/git-checkin
```

## Available skills

### `/git-checkin`

Secure git workflow with pre-commit security scanning.

```bash
/git-checkin                       # Interactive mode
/git-checkin -m "feat: add login"  # With commit message
/git-checkin --dry-run             # Preview only
/git-checkin --skip-push           # Commit without push
```

- Blocks secrets (`.env`, `*.pem`, `credentials.json`, …)
- Warns on `.DS_Store`, `node_modules/`, large files (>10 MB)
- Branch-aware: prompts before pushing to main, offers PR on feature branches
- Adds `Co-Authored-By: Claude` line

See [.claude/skills/git-checkin/SKILL.md](.claude/skills/git-checkin/SKILL.md).

### `/git-pr-merge`

End-to-end feature-branch shipping workflow with build-validation gates around the merge.

```bash
/git-pr-merge                                  # Run with chained approval
/git-pr-merge --interactive                    # Prompt at each gate
/git-pr-merge --dry-run                        # Print every command without executing
/git-pr-merge --pr-title "fix: timer offset"   # Pre-supply the PR title
/git-pr-merge --build-cmd "pnpm build"         # Override build command
```

- Chain: pre-flight → commit → push & PR → build #1 → squash-merge → refresh main → build #2 → worktree cleanup → branch delete
- Two build-validation gates (pre-merge in feature worktree, post-merge in main worktree)
- Halts on any failure — never silently retries or skips
- Falls back to `gh api -X DELETE …git/refs/heads/<branch>` when local-checkout blocks branch deletion
- Designed to honour the user's "Multi-Step Workflow Approvals" governance rule

See [.claude/skills/git-pr-merge/SKILL.md](.claude/skills/git-pr-merge/SKILL.md).

### `/image-resize`

AI-context-safe image analysis. Reports unused and oversized images with target sizes and a "why" for each target, then optionally resizes in-place with `sips` or removes unused files.

```bash
/image-resize                              # Analyze cwd (no changes)
/image-resize public/                      # Analyze a subdirectory
/image-resize --apply                      # Resize oversized images
/image-resize --apply --delete-unused      # Also remove unreferenced images
/image-resize --size-kb 300                # Tighten file-size threshold
/image-resize --max-dimension 1280         # Tighten longest-edge threshold
/image-resize --json                       # Machine-readable output
```

- Default mode makes zero file changes
- Three-section report: Unused / Oversized / Fine as-is
- Reference detection scans ts/tsx/js/jsx/html/css/vue/svelte/md/json/…
- Thresholds default to 500 KB and 1568 px (Claude Vision's internal cap)
- Logos / icons target 512 px

See [.claude/skills/image-resize/SKILL.md](.claude/skills/image-resize/SKILL.md).

## Development

```bash
npm install
npm run build       # compile TypeScript to dist/
npm run watch       # recompile on change

# Smoke test skills
node dist/skills/git-checkin.js --dry-run
node dist/skills/image-resize.js --help
node dist/cli/install.js --list
```

## Adding a new skill

1. Add `src/skills/<skill-name>.ts` with a `#!/usr/bin/env node` shebang.
2. Create `.claude/skills/<skill-name>/SKILL.md` (YAML frontmatter: `name`, `description`, `version`, `author`) and optionally `README.md` with research/design notes.
3. Register the bin in `package.json`:
   ```json
   "bin": { "<skill-name>": "./dist/skills/<skill-name>.js" }
   ```
4. Document the skill in this README.
5. `npm run build` to verify it compiles.

The installer auto-discovers every directory under `.claude/skills/` — no registration needed there.

## File structure

```
stx-skills/
├── package.json                       # bin: stx-skills, git-checkin, git-pr-merge, image-resize
├── tsconfig.json
├── src/
│   ├── cli/
│   │   └── install.ts                 # `npx ../stx-skills` entry point
│   └── skills/
│       ├── git-checkin.ts
│       ├── git-pr-merge.ts
│       └── image-resize.ts
├── dist/                              # compiled output (npm run build / prepare)
├── .claude/
│   └── skills/
│       ├── git-checkin/
│       │   ├── SKILL.md
│       │   └── README.md
│       ├── git-pr-merge/
│       │   ├── SKILL.md
│       │   └── README.md
│       └── image-resize/
│           ├── SKILL.md
│           └── README.md
└── scripts/
    └── install.sh                     # fallback bash installer
```

## License

MIT
