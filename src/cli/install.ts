#!/usr/bin/env node

/**
 * stx-skills installer
 *
 * Invoked as the default `stx-skills` bin, so:
 *
 *     npx ../stx-skills                # install into current working dir
 *     npx /abs/path/stx-skills         # install into current working dir
 *     npx ../stx-skills /target/dir    # install into explicit target
 *     npx ../stx-skills --link         # symlink for live updates
 *     npx ../stx-skills --list         # just show what's available
 *
 * Works without publishing to npm — npx happily resolves a local path,
 * runs the bin that matches the package name, and caches the build.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Compiled location: dist/cli/install.js → package root is two levels up
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

const Colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const c = {
  error: (s: string) => `${Colors.red}${s}${Colors.reset}`,
  success: (s: string) => `${Colors.green}${s}${Colors.reset}`,
  warn: (s: string) => `${Colors.yellow}${s}${Colors.reset}`,
  info: (s: string) => `${Colors.cyan}${s}${Colors.reset}`,
  bold: (s: string) => `${Colors.bold}${s}${Colors.reset}`,
  dim: (s: string) => `${Colors.dim}${s}${Colors.reset}`,
};

interface Options {
  target: string;
  link: boolean;
  list: boolean;
  help: boolean;
  skills: string[];   // explicit list, empty = install all
}

// Accept these words as a leading no-op subcommand so natural-language
// invocations like `npx ../stx-skills install` and `... refresh` just work.
const SUBCOMMAND_NOOPS = new Set(['install', 'refresh', 'update', 'sync']);

function parseArgs(args: string[]): Options {
  const options: Options = {
    target: process.cwd(),
    link: false,
    list: false,
    help: false,
    skills: [],
  };

  let targetSet = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '--link':
        options.link = true;
        break;
      case '--list':
        options.list = true;
        break;
      case '--skill':
        if (args[i + 1]) options.skills.push(args[++i]);
        break;
      default:
        if (a.startsWith('-')) break;
        if (i === 0 && SUBCOMMAND_NOOPS.has(a.toLowerCase())) break;
        if (!targetSet) {
          options.target = path.resolve(a);
          targetSet = true;
        }
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
${c.bold('stx-skills')} — installer for organization-wide Claude Code skills

${c.bold('USAGE')}
  npx <path-to-stx-skills> [options] [target-dir]

${c.bold('OPTIONS')}
  --link              Symlink skills instead of copying (live updates)
  --skill <name>      Install/refresh only the named skill (repeatable)
  --list              List available skills and exit
  -h, --help          Show this help

${c.bold('EXAMPLES')}
  npx ../stx-skills                         # refresh all skills into cwd
  npx ../stx-skills ~/projects/my-app       # refresh skills in an explicit target
  npx ../stx-skills --link                  # symlink (dev mode)
  npx ../stx-skills --skill stx-image    # refresh one skill only
  npx ../stx-skills --list                  # inspect what's available

${c.bold('HOW IT WORKS')}
  Running the installer always refreshes: existing skill directories in the
  target are wiped and replaced with the latest from this package. stx-skills
  is the source of truth for skill content, so re-running the installer is
  the supported way to pull updates.

  The package is not published to npm. npx resolves the local path, runs
  this installer, and copies each skill directory from
  <package>/.claude/skills/<skill> into <target>/.claude/skills/<skill>,
  with the compiled JS dropped alongside each SKILL.md.
`);
}

function listAvailableSkills(): string[] {
  const skillsDir = path.join(PACKAGE_ROOT, '.claude', 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

function ensureBuilt(): void {
  const distDir = path.join(PACKAGE_ROOT, 'dist', 'skills');
  if (fs.existsSync(distDir) && fs.readdirSync(distDir).some(f => f.endsWith('.js'))) {
    return;
  }
  console.log(c.warn('Build artifacts missing — running `npm install && npm run build`…'));
  execSync('npm install --silent', { cwd: PACKAGE_ROOT, stdio: 'inherit' });
  execSync('npm run build', { cwd: PACKAGE_ROOT, stdio: 'inherit' });
}

function copyFileSyncSafe(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function installSkill(name: string, target: string, options: Options): { action: 'added' | 'updated' | 'linked' | 'error' } {
  const srcDir = path.join(PACKAGE_ROOT, '.claude', 'skills', name);
  const destDir = path.join(target, '.claude', 'skills', name);

  if (!fs.existsSync(srcDir)) {
    console.log(c.error(`  ✗ ${name}: source directory not found`));
    return { action: 'error' };
  }

  const existed = fs.existsSync(destDir);

  if (options.link) {
    // Replace whatever is there with a symlink to the package's skill dir.
    if (existed) {
      try { fs.rmSync(destDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    fs.symlinkSync(srcDir, destDir, 'dir');
    console.log(c.success(`  ✓ ${name}  ${c.dim('(symlinked)')}`));
    return { action: 'linked' };
  }

  // Always refresh: remove the existing skill dir (if any) and copy fresh.
  // This is a hard refresh — stx-skills is the source of truth for skill
  // content, and re-running the installer is the way to pick up updates.
  if (existed) {
    try { fs.rmSync(destDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  // Copy SKILL.md / README.md / any other files
  copyDirRecursive(srcDir, destDir);

  // Copy compiled JS (+ source map if present) so the skill is self-contained
  const jsSrc = path.join(PACKAGE_ROOT, 'dist', 'skills', `${name}.js`);
  if (fs.existsSync(jsSrc)) {
    copyFileSyncSafe(jsSrc, path.join(destDir, `${name}.js`));
    fs.chmodSync(path.join(destDir, `${name}.js`), 0o755);
  }
  const mapSrc = path.join(PACKAGE_ROOT, 'dist', 'skills', `${name}.js.map`);
  if (fs.existsSync(mapSrc)) {
    copyFileSyncSafe(mapSrc, path.join(destDir, `${name}.js.map`));
  }

  const action = existed ? 'updated' : 'added';
  const label = existed ? c.dim('(updated)') : c.dim('(new)');
  console.log(c.success(`  ✓ ${name}  ${label}`));
  return { action };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    showHelp();
    return;
  }

  const available = listAvailableSkills();

  if (options.list) {
    console.log(c.bold('\nAvailable skills:'));
    for (const name of available) console.log(`  /${name}`);
    console.log('');
    return;
  }

  if (!fs.existsSync(options.target)) {
    console.log(c.error(`Target directory does not exist: ${options.target}`));
    process.exit(1);
  }
  if (!fs.statSync(options.target).isDirectory()) {
    console.log(c.error(`Target is not a directory: ${options.target}`));
    process.exit(1);
  }

  const toInstall = options.skills.length > 0
    ? options.skills.filter(s => {
        if (!available.includes(s)) {
          console.log(c.error(`Unknown skill: ${s}`));
          return false;
        }
        return true;
      })
    : available;

  if (toInstall.length === 0) {
    console.log(c.warn('No skills to install.'));
    return;
  }

  if (!options.link) ensureBuilt();

  console.log(c.bold('\n═══════════════════════════════════════════════════════════════'));
  console.log(c.bold('  stx-skills installer'));
  console.log(c.bold('═══════════════════════════════════════════════════════════════'));
  console.log(`  Source : ${c.info(PACKAGE_ROOT)}`);
  console.log(`  Target : ${c.info(options.target)}`);
  console.log(`  Mode   : ${c.info(options.link ? 'symlink (live updates)' : 'refresh (overwrite)')}\n`);

  let added = 0;
  let updated = 0;
  let linked = 0;
  for (const name of toInstall) {
    const { action } = installSkill(name, options.target, options);
    if (action === 'added') added++;
    else if (action === 'updated') updated++;
    else if (action === 'linked') linked++;
  }

  console.log(c.dim(`\n  ${added} added · ${updated} updated${linked ? ` · ${linked} linked` : ''}`));

  console.log(c.bold('\n═══════════════════════════════════════════════════════════════'));
  console.log(c.success('  ✅ Done. Available slash commands in the target project:'));
  console.log(c.bold('═══════════════════════════════════════════════════════════════\n'));
  for (const name of toInstall) console.log(`  /${name}`);
  console.log('');
}

try {
  main();
} catch (err) {
  console.error(c.error(`\nError: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
}
