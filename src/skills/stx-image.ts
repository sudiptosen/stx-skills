#!/usr/bin/env node

/**
 * stx-image Skill
 *
 * Analyzes project images for AI-context-safe sizing and produces a
 * report of what it would resize or delete, and why. Default mode makes
 * no changes. `--apply` performs in-place resizes via macOS `sips`.
 * `--apply --delete-unused` additionally removes unreferenced images
 * (explicit opt-in per data-protection rules).
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// =============================================================================
// ANSI Colors
// =============================================================================

const Colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const c = {
  error: (s: string) => `${Colors.red}${s}${Colors.reset}`,
  success: (s: string) => `${Colors.green}${s}${Colors.reset}`,
  warn: (s: string) => `${Colors.yellow}${s}${Colors.reset}`,
  info: (s: string) => `${Colors.cyan}${s}${Colors.reset}`,
  bold: (s: string) => `${Colors.bold}${s}${Colors.reset}`,
  dim: (s: string) => `${Colors.dim}${s}${Colors.reset}`,
  file: (s: string) => `${Colors.magenta}${s}${Colors.reset}`,
};

// =============================================================================
// Constants
// =============================================================================

const RASTER_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.tiff', '.tif',
]);

const IMAGE_EXTENSIONS = new Set([
  ...RASTER_EXTENSIONS,
  '.svg',
]);

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.vue', '.svelte', '.astro',
  '.md', '.mdx', '.json',
  '.yml', '.yaml', '.xml',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.php',
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build',
  '.next', '.nuxt', 'out', 'coverage',
  '.cache', '.turbo', '.parcel-cache',
  '.vercel', '.netlify', '.svelte-kit',
  '__pycache__', '.pytest_cache',
  'target', 'vendor', '.dart_tool',
  '.expo', '.gradle', '.idea', '.vs',
]);

// Files > 10MB are skipped when concatenating sources for reference scan
const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;

// Thresholds (defaults overridden via CLI flags)
const DEFAULT_SIZE_THRESHOLD_KB = 500;      // raster > 500KB is oversized
const DEFAULT_MAX_DIMENSION = 1568;         // Claude Vision's internal max edge
const LOGO_TARGET_DIMENSION = 512;          // target for logo/icon basenames
const SVG_SIZE_WARN_KB = 100;               // SVGs > 100KB are flagged

const LOGO_HINT_RE = /logo|icon|favicon|avatar/i;

// =============================================================================
// CLI Options
// =============================================================================

interface Options {
  /** Folder to scan for images. */
  imageRoot: string;
  /** Folder to scan for source-file references (usually the project root). */
  sourceRoot: string;
  sizeThresholdKb: number;
  maxDimension: number;
  apply: boolean;
  deleteUnused: boolean;
  force: boolean;
  json: boolean;
  help: boolean;
}

function parseArgs(args: string[]): Options {
  const cwd = process.cwd();
  const options: Options = {
    imageRoot: cwd,
    sourceRoot: cwd,
    sizeThresholdKb: DEFAULT_SIZE_THRESHOLD_KB,
    maxDimension: DEFAULT_MAX_DIMENSION,
    apply: false,
    deleteUnused: false,
    force: false,
    json: false,
    help: false,
  };

  let positional = 0;
  let folderArg: string | undefined;
  let positionalArg: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '--apply':
        options.apply = true;
        break;
      case '--delete-unused':
        options.deleteUnused = true;
        break;
      case '-f':
      case '--force':
        options.force = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--size-kb':
        options.sizeThresholdKb = parseInt(args[++i] ?? '', 10) || DEFAULT_SIZE_THRESHOLD_KB;
        break;
      case '--max-dimension':
        options.maxDimension = parseInt(args[++i] ?? '', 10) || DEFAULT_MAX_DIMENSION;
        break;
      case '--folder':
        folderArg = args[++i];
        break;
      default:
        if (!a.startsWith('-') && positional === 0) {
          positionalArg = a;
          positional++;
        }
    }
  }

  // Narrow the image-scan root without narrowing reference detection:
  // references are always scanned from cwd so a folder-scoped run can still
  // detect that images in that folder are referenced from elsewhere.
  const folder = folderArg ?? positionalArg;
  if (folder) {
    options.imageRoot = path.isAbsolute(folder) ? folder : path.resolve(cwd, folder);
  }

  return options;
}

interface HelpOption {
  flag: string;
  arg: string;
  default: string;
  description: string;
}

const HELP_OPTIONS: HelpOption[] = [
  { flag: '--folder',         arg: '<path>', default: 'cwd',                             description: 'Scan a subfolder relative to the current working directory' },
  { flag: '--apply',          arg: '',       default: 'off',                             description: 'Perform in-place resizes with sips (macOS)' },
  { flag: '--delete-unused',  arg: '',       default: 'off',                             description: 'Also delete unreferenced images (requires --apply)' },
  { flag: '--size-kb',        arg: '<n>',    default: String(DEFAULT_SIZE_THRESHOLD_KB), description: 'Raster file-size threshold in KB' },
  { flag: '--max-dimension',  arg: '<n>',    default: String(DEFAULT_MAX_DIMENSION),     description: 'Max longest-edge in px (Claude Vision cap)' },
  { flag: '--json',           arg: '',       default: 'off',                             description: 'Emit machine-readable JSON instead of a report' },
  { flag: '-f, --force',      arg: '',       default: 'off',                             description: 'Skip confirmation prompts' },
  { flag: '-h, --help',       arg: '',       default: '-',                               description: 'Show this help' },
];

const HELP_EXAMPLES: Array<[string, string]> = [
  ['stx-image',                              'Analyze current project (no changes)'],
  ['stx-image --folder public',              'Analyze only ./public'],
  ['stx-image --folder public/temp',         'Analyze only ./public/temp'],
  ['stx-image public/',                      'Positional form (same as --folder)'],
  ['stx-image --folder public --apply',      'Resize oversized images under ./public'],
  ['stx-image --apply --delete-unused',      'Resize + delete unused (prompts to confirm)'],
  ['stx-image --size-kb 300',                'Tighten file-size threshold to 300 KB'],
  ['stx-image --max-dimension 1280',         'Tighten longest-edge threshold to 1280 px'],
  ['stx-image --json',                       'JSON output for tooling'],
];

function showHelp(): void {
  console.log('');
  console.log(c.bold('stx-image') + ' — AI-context-safe image analysis and resizing');
  console.log('');
  console.log(c.bold('USAGE'));
  console.log('  stx-image [--folder <path>] [options]');
  console.log('  stx-image [options] [path]              ' + c.dim('# positional form'));
  console.log('');

  console.log(c.bold('OPTIONS'));
  const optionRows = HELP_OPTIONS.map(o => [
    o.arg ? `${o.flag} ${o.arg}` : o.flag,
    o.default,
    o.description,
  ]);
  console.log(renderTable(['Flag', 'Default', 'Description'], optionRows));
  console.log('');

  console.log(c.bold('EXAMPLES'));
  console.log(renderTable(['Command', 'What it does'], HELP_EXAMPLES.map(([cmd, desc]) => [cmd, desc])));
  console.log('');

  console.log(c.bold('DEFAULT BEHAVIOR'));
  console.log('  Analyze-only. Shows a per-image report with three sections:');
  console.log(`    • ${c.error('Unused')} — delete entirely (no references in source)`);
  console.log(`    • ${c.warn('Oversized')} — resize (exceeds thresholds)`);
  console.log(`    • ${c.success('Fine as-is')}`);
  console.log('  No files are changed unless --apply is passed.');
  console.log('');
}

// =============================================================================
// File walking
// =============================================================================

function* walk(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

// =============================================================================
// Dimension detection
// =============================================================================

function getRasterDimensions(file: string): { width: number; height: number } | null {
  try {
    const out = execSync(`sips -g pixelWidth -g pixelHeight ${quote(file)}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const w = /pixelWidth:\s*(\d+)/.exec(out)?.[1];
    const h = /pixelHeight:\s*(\d+)/.exec(out)?.[1];
    if (w && h) return { width: parseInt(w, 10), height: parseInt(h, 10) };
  } catch {
    /* sips unavailable or failed; fall through */
  }
  return null;
}

function getSvgDimensions(file: string): { width: number; height: number } | null {
  try {
    const content = fs.readFileSync(file, 'utf-8').slice(0, 8192);
    const widthMatch = /\bwidth\s*=\s*["'](\d+(?:\.\d+)?)/.exec(content);
    const heightMatch = /\bheight\s*=\s*["'](\d+(?:\.\d+)?)/.exec(content);
    if (widthMatch && heightMatch) {
      return {
        width: Math.round(parseFloat(widthMatch[1])),
        height: Math.round(parseFloat(heightMatch[1])),
      };
    }
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/.exec(content);
    if (vb) {
      return {
        width: Math.round(parseFloat(vb[1])),
        height: Math.round(parseFloat(vb[2])),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function quote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// =============================================================================
// Reference detection
// =============================================================================

/**
 * Reads every source file under the root once and concatenates into a single
 * in-memory blob. Later, we check each image's basename against this blob to
 * determine whether it's referenced anywhere.
 */
function buildReferenceBlob(root: string): string {
  const chunks: string[] = [];
  for (const file of walk(root)) {
    const ext = path.extname(file).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    try {
      const stat = fs.statSync(file);
      if (stat.size > MAX_SOURCE_FILE_BYTES) continue;
      chunks.push(fs.readFileSync(file, 'utf-8'));
    } catch {
      /* skip unreadable */
    }
  }
  return chunks.join('\n');
}

function isReferenced(imagePath: string, blob: string): boolean {
  const basename = path.basename(imagePath);
  if (blob.includes(basename)) return true;
  // Also check basename-without-extension for imported-as-module cases
  const stem = basename.slice(0, basename.length - path.extname(basename).length);
  if (stem.length >= 4 && blob.includes(stem + '?')) return true;
  return false;
}

// =============================================================================
// Analysis
// =============================================================================

type Category = 'unused' | 'oversized' | 'fine';

interface ImageReport {
  relPath: string;
  absPath: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  isRaster: boolean;
  referenced: boolean;
  category: Category;
  target?: {
    longestEdge?: number;
    estimatedBytes?: number;
    reason: string;
    command?: string;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function analyzeImage(
  absPath: string,
  root: string,
  blob: string,
  options: Options,
): ImageReport {
  const relPath = path.relative(root, absPath);
  const ext = path.extname(absPath).toLowerCase();
  const isRaster = RASTER_EXTENSIONS.has(ext);
  const stat = fs.statSync(absPath);

  let width: number | undefined;
  let height: number | undefined;
  if (isRaster) {
    const dims = getRasterDimensions(absPath);
    if (dims) { width = dims.width; height = dims.height; }
  } else if (ext === '.svg') {
    const dims = getSvgDimensions(absPath);
    if (dims) { width = dims.width; height = dims.height; }
  }

  const referenced = isReferenced(absPath, blob);

  const report: ImageReport = {
    relPath,
    absPath,
    sizeBytes: stat.size,
    width,
    height,
    isRaster,
    referenced,
    category: 'fine',
  };

  if (!referenced) {
    report.category = 'unused';
    report.target = {
      reason: 'No references found in source files',
      command: `rm ${quote(relPath)}`,
    };
    return report;
  }

  const sizeKb = stat.size / 1024;
  const longestEdge = width && height ? Math.max(width, height) : undefined;

  if (isRaster) {
    const sizeOversized = sizeKb > options.sizeThresholdKb;
    const dimOversized = longestEdge !== undefined && longestEdge > options.maxDimension;

    if (sizeOversized || dimOversized) {
      const isLogo = LOGO_HINT_RE.test(relPath);
      const targetEdge = isLogo
        ? Math.min(longestEdge ?? LOGO_TARGET_DIMENSION, LOGO_TARGET_DIMENSION)
        : Math.min(longestEdge ?? options.maxDimension, options.maxDimension);

      const reasonParts: string[] = [];
      if (dimOversized) {
        reasonParts.push(`${longestEdge}px longest edge exceeds ${options.maxDimension}px AI-context cap`);
      }
      if (sizeOversized) {
        reasonParts.push(`${formatBytes(stat.size)} exceeds ${options.sizeThresholdKb} KB threshold`);
      }
      if (isLogo && longestEdge && longestEdge > LOGO_TARGET_DIMENSION) {
        reasonParts.push(`logo/icon — ${LOGO_TARGET_DIMENSION}px target sufficient`);
      }

      // Rough estimate: bytes scale with pixel area (quadratic in edge ratio)
      let estimatedBytes: number | undefined;
      if (longestEdge) {
        const ratio = targetEdge / longestEdge;
        estimatedBytes = Math.max(1, Math.round(stat.size * ratio * ratio));
      }

      report.category = 'oversized';
      report.target = {
        longestEdge: targetEdge,
        estimatedBytes,
        reason: reasonParts.join('; ') || 'Above thresholds',
        command: `sips -Z ${targetEdge} ${quote(relPath)}`,
      };
      return report;
    }
  } else if (ext === '.svg') {
    if (sizeKb > SVG_SIZE_WARN_KB) {
      report.category = 'oversized';
      report.target = {
        reason: `${formatBytes(stat.size)} is unusually large for an SVG — likely contains embedded rasters or excessive paths; run SVGO or replace with optimized asset`,
        command: `# manual: optimize with svgo ${quote(relPath)} or replace with raster`,
      };
      return report;
    }
  }

  return report;
}

// =============================================================================
// Report rendering
// =============================================================================

function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length))
  );
  const top = '┌' + widths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
  const sep = '├' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
  const bot = '└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';
  const render = (cells: string[]) =>
    '│' + cells.map((cell, i) => ' ' + (cell ?? '').padEnd(widths[i]) + ' ').join('│') + '│';

  const lines = [top, render(headers), sep];
  for (const row of rows) lines.push(render(row));
  lines.push(bot);
  return lines.join('\n');
}

function renderReport(reports: ImageReport[], options: Options): void {
  const unused = reports.filter(r => r.category === 'unused');
  const oversized = reports.filter(r => r.category === 'oversized');
  const fine = reports.filter(r => r.category === 'fine');

  const totalBytes = reports.reduce((sum, r) => sum + r.sizeBytes, 0);
  const unusedBytes = unused.reduce((sum, r) => sum + r.sizeBytes, 0);
  const oversizedSavings = oversized.reduce((sum, r) => {
    if (r.target?.estimatedBytes !== undefined) return sum + (r.sizeBytes - r.target.estimatedBytes);
    return sum;
  }, 0);

  console.log(c.bold('\n═══════════════════════════════════════════════════════════════'));
  console.log(c.bold('  Image Optimization Analysis'));
  console.log(c.bold('═══════════════════════════════════════════════════════════════'));
  console.log(`Scanned ${c.info(String(reports.length))} images (${c.info(formatBytes(totalBytes))} total)`);
  console.log(`  • ${c.error(String(unused.length))} unused`);
  console.log(`  • ${c.warn(String(oversized.length))} oversized`);
  console.log(`  • ${c.success(String(fine.length))} fine as-is`);

  if (unused.length > 0) {
    console.log(c.bold(`\n• Unused — delete entirely (saves ~${formatBytes(unusedBytes)}):\n`));
    const rows = unused
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .map(r => [r.relPath, formatBytes(r.sizeBytes)]);
    console.log(renderTable(['File', 'Size'], rows));
  }

  if (oversized.length > 0) {
    const savingsLabel = oversizedSavings > 0 ? ` (saves ~${formatBytes(oversizedSavings)})` : '';
    console.log(c.bold(`\n• Oversized — resize${savingsLabel}:\n`));
    const rows = oversized
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .map(r => {
        const current = r.width && r.height
          ? `${r.width}×${r.height}, ${formatBytes(r.sizeBytes)}`
          : formatBytes(r.sizeBytes);
        const target = r.target?.longestEdge
          ? `${r.target.longestEdge}px longest edge` +
            (r.target.estimatedBytes ? ` (~${formatBytes(r.target.estimatedBytes)})` : '')
          : 'manual review';
        return [r.relPath, current, target, r.target?.reason ?? ''];
      });
    console.log(renderTable(['File', 'Current', 'Target', 'Reason'], rows));
  }

  if (fine.length > 0 && fine.length <= 20) {
    console.log(c.bold('\n• Fine as-is:'));
    for (const r of fine) {
      const dims = r.width && r.height ? `${r.width}×${r.height}, ` : '';
      console.log(`  ${c.dim('·')} ${c.file(r.relPath)} (${dims}${formatBytes(r.sizeBytes)})`);
    }
  } else if (fine.length > 20) {
    console.log(c.bold(`\n• Fine as-is: ${fine.length} images within thresholds.`));
  }

  // Suggested commands
  const resizeCmds = oversized
    .map(r => r.target?.command)
    .filter((x): x is string => !!x && x.startsWith('sips'));
  const deleteCmds = unused.map(r => r.target!.command!);

  if (resizeCmds.length > 0 || deleteCmds.length > 0) {
    console.log(c.bold('\n• Suggested commands:\n'));
    if (resizeCmds.length > 0) {
      console.log(c.dim('  # Resize oversized images (in-place, preserves aspect ratio):'));
      for (const cmd of resizeCmds) console.log(`  ${cmd}`);
    }
    if (deleteCmds.length > 0) {
      console.log(c.dim('\n  # Delete unused images:'));
      for (const cmd of deleteCmds) console.log(`  ${cmd}`);
    }
  }

  console.log('');
  if (options.apply) {
    console.log(c.warn('⚡ --apply was passed: changes will be executed after confirmation.'));
  } else {
    console.log(c.info('💡 No changes made. Re-run with --apply to resize, and --apply --delete-unused to also remove unused images.'));
  }
}

// =============================================================================
// Apply phase
// =============================================================================

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = (await prompt(`${question} ${hint}: `)).toLowerCase();
  if (!answer) return defaultYes;
  if (['exit', 'quit', 'q'].includes(answer)) {
    console.log(c.warn('Aborted by user.'));
    process.exit(0);
  }
  return answer.startsWith('y');
}

async function applyChanges(reports: ImageReport[], options: Options): Promise<void> {
  const oversized = reports.filter(r => r.category === 'oversized' && r.target?.command?.startsWith('sips'));
  const unused = reports.filter(r => r.category === 'unused');

  if (oversized.length === 0 && (!options.deleteUnused || unused.length === 0)) {
    console.log(c.info('\nNothing to apply.'));
    return;
  }

  console.log(c.bold('\n═══════════════════════════════════════════════════════════════'));
  console.log(c.bold('  APPLY CHANGES'));
  console.log(c.bold('═══════════════════════════════════════════════════════════════\n'));

  if (oversized.length > 0) {
    console.log(c.warn(`Will resize ${oversized.length} image(s) in-place with sips.`));
    if (!options.force) {
      const ok = await confirm('Proceed with resize?', false);
      if (!ok) { console.log(c.warn('Resize skipped.')); return; }
    }

    for (const r of oversized) {
      try {
        execSync(r.target!.command!, { stdio: 'inherit', cwd: options.imageRoot });
        console.log(c.success(`  ✓ ${r.relPath}`));
      } catch (err) {
        console.log(c.error(`  ✗ ${r.relPath}: ${(err as Error).message}`));
      }
    }
  }

  if (options.deleteUnused && unused.length > 0) {
    console.log(c.warn(`\n⚠️  Will DELETE ${unused.length} unreferenced image(s):`));
    for (const r of unused) console.log(`  ${c.error('−')} ${r.relPath}`);

    if (!options.force) {
      const ok = await confirm('\nType "y" to confirm deletion', false);
      if (!ok) { console.log(c.warn('Deletion skipped.')); return; }
    }

    for (const r of unused) {
      try {
        fs.unlinkSync(r.absPath);
        console.log(c.success(`  ✓ deleted ${r.relPath}`));
      } catch (err) {
        console.log(c.error(`  ✗ ${r.relPath}: ${(err as Error).message}`));
      }
    }
  } else if (unused.length > 0 && !options.deleteUnused) {
    console.log(c.dim(`\n${unused.length} unused image(s) left in place. Pass --delete-unused to remove them.`));
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (!fs.existsSync(options.imageRoot) || !fs.statSync(options.imageRoot).isDirectory()) {
    console.error(c.error(`Path not found or not a directory: ${options.imageRoot}`));
    process.exit(1);
  }

  if (!options.json) {
    const scoped = options.imageRoot !== options.sourceRoot;
    console.log(c.bold(`\n🖼  Scanning ${options.imageRoot} for images…`));
    if (scoped) {
      console.log(c.dim(`   References resolved against ${options.sourceRoot}`));
    }
  }

  // 1. Walk the image root collecting images
  const imagePaths: string[] = [];
  for (const file of walk(options.imageRoot)) {
    const ext = path.extname(file).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) imagePaths.push(file);
  }

  if (imagePaths.length === 0) {
    console.log(c.info('No images found.'));
    process.exit(0);
  }

  // 2. Build reference blob from the source root (the full project, not just
  //    the image folder) so images in a scoped folder can still be detected
  //    as referenced from anywhere in the codebase.
  if (!options.json) {
    console.log(c.dim(`Reading source files for reference detection…`));
  }
  const blob = buildReferenceBlob(options.sourceRoot);

  // 3. Analyze each image — paths are reported relative to imageRoot.
  const reports = imagePaths.map(p => analyzeImage(p, options.imageRoot, blob, options));

  if (options.json) {
    console.log(JSON.stringify({
      imageRoot: options.imageRoot,
      sourceRoot: options.sourceRoot,
      thresholds: {
        sizeThresholdKb: options.sizeThresholdKb,
        maxDimension: options.maxDimension,
      },
      images: reports,
    }, null, 2));
    return;
  }

  // 4. Render report
  renderReport(reports, options);

  // 5. Apply if requested
  if (options.apply) {
    await applyChanges(reports, options);
  }
}

main().catch(err => {
  console.error(c.error(`\nError: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
