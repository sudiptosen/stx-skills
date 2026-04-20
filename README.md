# stx-skills

Organization-wide [Claude Code](https://docs.claude.com/en/docs/claude-code) skills collection. Install into any project without publishing to npm.

## Install with `npx` (no registry)

```bash
# From a sibling project
cd ~/projects/my-app
npx ../stx-skills

# From an absolute path
npx /Users/me/projects/stx-skills

# Install into an explicit target
npx ../stx-skills ~/projects/my-app
```

How this works without npm: `npx` accepts a local path, installs the package into a temporary cache, and runs the default bin (the one that matches the package name — `stx-skills`). Our `prepare` script builds the TypeScript to `dist/` during install, so the bin is always up to date.

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
├── package.json                       # bin: stx-skills, git-checkin, image-resize
├── tsconfig.json
├── src/
│   ├── cli/
│   │   └── install.ts                 # `npx ../stx-skills` entry point
│   └── skills/
│       ├── git-checkin.ts
│       └── image-resize.ts
├── dist/                              # compiled output (npm run build / prepare)
├── .claude/
│   └── skills/
│       ├── git-checkin/
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
