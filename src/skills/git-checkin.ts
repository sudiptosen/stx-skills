#!/usr/bin/env node

/**
 * Git Checkin Skill
 *
 * A secure git workflow that:
 * 1. Checks git status
 * 2. Scans for sensitive/unwanted files
 * 3. Confirms deleted files
 * 4. Stages changes
 * 5. Commits with co-authorship
 * 6. Pushes or creates PR based on branch
 */

import { execSync } from 'child_process';
import { statSync, existsSync } from 'fs';
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
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
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
// Security Patterns
// =============================================================================

interface SecurityPattern {
  pattern: RegExp;
  description: string;
  gitignore: string;
}

// Files that BLOCK the commit - sensitive data
const BLOCKED_PATTERNS: SecurityPattern[] = [
  { pattern: /^\.env$/, description: 'Environment file with secrets', gitignore: '.env' },
  { pattern: /^\.env\..+$/, description: 'Environment file variant', gitignore: '.env.*' },
  { pattern: /\.pem$/, description: 'Private key file', gitignore: '*.pem' },
  { pattern: /\.key$/, description: 'Private key file', gitignore: '*.key' },
  { pattern: /^credentials\.json$/, description: 'Cloud credentials', gitignore: 'credentials.json' },
  { pattern: /^secrets\.json$/, description: 'Application secrets', gitignore: 'secrets.json' },
  { pattern: /firebase-adminsdk.*\.json$/, description: 'Firebase admin SDK', gitignore: 'firebase-adminsdk*.json' },
  { pattern: /^id_rsa$/, description: 'SSH private key', gitignore: 'id_rsa' },
  { pattern: /^id_ed25519$/, description: 'SSH private key', gitignore: 'id_ed25519' },
  { pattern: /^id_ecdsa$/, description: 'SSH private key', gitignore: 'id_ecdsa' },
  { pattern: /\.p12$/, description: 'Certificate bundle', gitignore: '*.p12' },
  { pattern: /\.pfx$/, description: 'Certificate bundle', gitignore: '*.pfx' },
  { pattern: /^\.aws\/credentials$/, description: 'AWS credentials', gitignore: '.aws/credentials' },
  { pattern: /^\.gcp\/.*\.json$/, description: 'GCP credentials', gitignore: '.gcp/' },
];

// Files that WARN but allow continuation
const WARNED_PATTERNS: SecurityPattern[] = [
  { pattern: /^\.DS_Store$/, description: 'macOS metadata', gitignore: '.DS_Store' },
  { pattern: /^Thumbs\.db$/, description: 'Windows metadata', gitignore: 'Thumbs.db' },
  { pattern: /^node_modules\//, description: 'Node dependencies', gitignore: 'node_modules/' },
  { pattern: /\.log$/, description: 'Log file', gitignore: '*.log' },
  { pattern: /^\.idea\//, description: 'JetBrains IDE settings', gitignore: '.idea/' },
  { pattern: /^\.vscode\//, description: 'VS Code settings', gitignore: '.vscode/' },
  { pattern: /^\.vs\//, description: 'Visual Studio settings', gitignore: '.vs/' },
  { pattern: /^__pycache__\//, description: 'Python cache', gitignore: '__pycache__/' },
  { pattern: /\.pyc$/, description: 'Python compiled', gitignore: '*.pyc' },
  { pattern: /^\.gradle\//, description: 'Gradle cache', gitignore: '.gradle/' },
  { pattern: /^build\//, description: 'Build output', gitignore: 'build/' },
  { pattern: /^dist\//, description: 'Distribution output', gitignore: 'dist/' },
  { pattern: /^coverage\//, description: 'Test coverage', gitignore: 'coverage/' },
];

// Large file threshold (10MB)
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

// =============================================================================
// CLI Options
// =============================================================================

interface CliOptions {
  message?: string;
  dryRun: boolean;
  force: boolean;
  skipPush: boolean;
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    force: false,
    skipPush: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-m' || arg === '--message') {
      options.message = args[++i];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '-f' || arg === '--force') {
      options.force = true;
    } else if (arg === '--skip-push') {
      options.skipPush = true;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
${c.bold('git-checkin')} - Secure git workflow with pre-commit security scanning

${c.bold('USAGE')}
  git-checkin [options]

${c.bold('OPTIONS')}
  -m, --message <msg>   Commit message (skips prompt)
  --dry-run             Preview only, no changes made
  -f, --force           Skip all confirmations (use carefully)
  --skip-push           Commit only, don't push or create PR
  -h, --help            Show this help message

${c.bold('EXAMPLES')}
  git-checkin                        # Interactive mode
  git-checkin -m "feat: add login"   # With commit message
  git-checkin --dry-run              # Preview mode
  git-checkin --skip-push            # Commit without pushing

${c.bold('EXIT COMMANDS')}
  At any prompt, type: exit, quit, q, or n
`);
}

// =============================================================================
// Git Helpers
// =============================================================================

function execGit(command: string): string {
  try {
    return execSync(`git ${command}`, { encoding: 'utf-8' }).trim();
  } catch (error) {
    if (error instanceof Error && 'stderr' in error) {
      throw new Error(`Git command failed: ${(error as any).stderr}`);
    }
    throw error;
  }
}

function isGitRepo(): boolean {
  try {
    execGit('rev-parse --is-inside-work-tree');
    return true;
  } catch {
    return false;
  }
}

interface GitFile {
  status: string;
  path: string;
}

function getStatus(): GitFile[] {
  const output = execGit('status --porcelain');
  if (!output) return [];

  return output.split('\n').map(line => {
    const status = line.substring(0, 2).trim();
    const path = line.substring(3);
    return { status, path };
  });
}

function getCurrentBranch(): string {
  return execGit('rev-parse --abbrev-ref HEAD');
}

function isMainBranch(branch: string): boolean {
  return branch === 'main' || branch === 'master';
}

function hasRemote(): boolean {
  try {
    const remotes = execGit('remote');
    return remotes.length > 0;
  } catch {
    return false;
  }
}

function branchExistsOnRemote(branch: string): boolean {
  try {
    execGit(`ls-remote --heads origin ${branch}`);
    const result = execGit(`ls-remote --heads origin ${branch}`);
    return result.includes(branch);
  } catch {
    return false;
  }
}

function hasGhCli(): boolean {
  try {
    execSync('which gh', { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Security Scanner
// =============================================================================

interface ScanResult {
  blocked: Array<{ file: string; reason: string; gitignore: string }>;
  warned: Array<{ file: string; reason: string; gitignore: string }>;
  large: Array<{ file: string; size: string }>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function scanFiles(files: GitFile[]): ScanResult {
  const result: ScanResult = {
    blocked: [],
    warned: [],
    large: [],
  };

  for (const file of files) {
    // Skip deleted files
    if (file.status === 'D') continue;

    const filename = file.path.split('/').pop() || file.path;

    // Check blocked patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.pattern.test(filename) || pattern.pattern.test(file.path)) {
        result.blocked.push({
          file: file.path,
          reason: pattern.description,
          gitignore: pattern.gitignore,
        });
        break;
      }
    }

    // Check warned patterns
    for (const pattern of WARNED_PATTERNS) {
      if (pattern.pattern.test(filename) || pattern.pattern.test(file.path)) {
        result.warned.push({
          file: file.path,
          reason: pattern.description,
          gitignore: pattern.gitignore,
        });
        break;
      }
    }

    // Check file size
    try {
      if (existsSync(file.path)) {
        const stats = statSync(file.path);
        if (stats.size > LARGE_FILE_THRESHOLD) {
          result.large.push({
            file: file.path,
            size: formatBytes(stats.size),
          });
        }
      }
    } catch {
      // File might not exist or be inaccessible
    }
  }

  return result;
}

// =============================================================================
// Interactive Prompts
// =============================================================================

const EXIT_COMMANDS = ['exit', 'quit', 'q', 'n', 'no'];

function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function prompt(question: string): Promise<string> {
  const rl = createReadline();

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();

      if (EXIT_COMMANDS.includes(answer.toLowerCase().trim())) {
        console.log(c.warn('\nAborted by user.'));
        process.exit(0);
      }

      resolve(answer.trim());
    });
  });
}

async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await prompt(`${question} ${hint}: `);

  if (!answer) return defaultYes;

  return answer.toLowerCase().startsWith('y');
}

// =============================================================================
// Workflow Steps
// =============================================================================

async function step1_checkStatus(options: CliOptions): Promise<GitFile[]> {
  console.log(c.bold('\n═══════════════════════════════════════════════════════════════'));
  console.log(c.bold('  STEP 1: Git Status Check'));
  console.log(c.bold('═══════════════════════════════════════════════════════════════\n'));

  const files = getStatus();

  if (files.length === 0) {
    console.log(c.info('No changes detected. Nothing to commit.'));
    process.exit(0);
  }

  // Group files by status
  const modified = files.filter(f => f.status === 'M' || f.status === 'MM');
  const added = files.filter(f => f.status === 'A' || f.status === '??');
  const deleted = files.filter(f => f.status === 'D');
  const renamed = files.filter(f => f.status.includes('R'));

  if (modified.length > 0) {
    console.log(c.info(`Modified (${modified.length}):`));
    modified.forEach(f => console.log(`  ${c.file(f.path)}`));
  }

  if (added.length > 0) {
    console.log(c.success(`\nAdded (${added.length}):`));
    added.forEach(f => console.log(`  ${c.file(f.path)}`));
  }

  if (deleted.length > 0) {
    console.log(c.error(`\nDeleted (${deleted.length}):`));
    deleted.forEach(f => console.log(`  ${c.file(f.path)}`));
  }

  if (renamed.length > 0) {
    console.log(c.warn(`\nRenamed (${renamed.length}):`));
    renamed.forEach(f => console.log(`  ${c.file(f.path)}`));
  }

  console.log(c.dim(`\nTotal: ${files.length} file(s)`));

  return files;
}

async function step2_securityScan(files: GitFile[], options: CliOptions): Promise<boolean> {
  console.log(c.bold('\n═══════════════════════════════════════════════════════════════'));
  console.log(c.bold('  STEP 2: Security Scan'));
  console.log(c.bold('═══════════════════════════════════════════════════════════════\n'));

  const scan = scanFiles(files);

  // Report blocked files
  if (scan.blocked.length > 0) {
    console.log(`${c.error('⛔ BLOCKED')} - Sensitive files detected:\n`);
    for (const item of scan.blocked) {
      console.log(`  ${c.error('✗')} ${c.file(item.file)}`);
      console.log(`    ${c.dim(item.reason)}`);
    }

    console.log(c.warn('\n📝 Add these to .gitignore:'));
    const uniqueIgnores = [...new Set(scan.blocked.map(b => b.gitignore))];
    uniqueIgnores.forEach(ig => console.log(`  ${ig}`));

    console.log(c.error('\n❌ Cannot proceed with sensitive files. Please remove or gitignore them.'));
    return false;
  }

  // Report warned files
  if (scan.warned.length > 0) {
    console.log(`${c.warn('⚠️  WARNED')} - Unwanted files detected:\n`);
    for (const item of scan.warned) {
      console.log(`  ${c.warn('!')} ${c.file(item.file)}`);
      console.log(`    ${c.dim(item.reason)}`);
    }

    console.log(c.warn('\n📝 Consider adding to .gitignore:'));
    const uniqueIgnores = [...new Set(scan.warned.map(w => w.gitignore))];
    uniqueIgnores.forEach(ig => console.log(`  ${ig}`));

    if (!options.force) {
      const proceed = await confirm('\nProceed with these files?', false);
      if (!proceed) {
        console.log(c.warn('\nAborted by user.'));
        process.exit(0);
      }
    }
  }

  // Report large files
  if (scan.large.length > 0) {
    console.log(`${c.warn('📦 LARGE FILES')} - Consider Git LFS:\n`);
    for (const item of scan.large) {
      console.log(`  ${c.warn('!')} ${c.file(item.file)} (${item.size})`);
    }

    if (!options.force) {
      const proceed = await confirm('\nProceed with large files?', true);
      if (!proceed) {
        console.log(c.warn('\nAborted by user.'));
        process.exit(0);
      }
    }
  }

  if (scan.blocked.length === 0 && scan.warned.length === 0 && scan.large.length === 0) {
    console.log(c.success('✅ No security issues detected.'));
  }

  return true;
}

async function step3_confirmDeleted(files: GitFile[], options: CliOptions): Promise<void> {
  const deleted = files.filter(f => f.status === 'D');

  if (deleted.length === 0) return;

  console.log(c.bold('\n═══════════════════════════════════════════════════════════════'));
  console.log(c.bold('  STEP 3: Deleted Files Confirmation'));
  console.log(c.bold('═══════════════════════════════════════════════════════════════\n'));

  console.log(c.warn(`The following ${deleted.length} file(s) will be DELETED from the repository:\n`));
  deleted.forEach(f => console.log(`  ${c.error('−')} ${c.file(f.path)}`));

  if (!options.force) {
    const proceed = await confirm('\nConfirm deletion?', false);
    if (!proceed) {
      console.log(c.warn('\nAborted by user.'));
      process.exit(0);
    }
  }
}

async function step4_stage(options: CliOptions): Promise<void> {
  console.log(c.bold('\n═══════════════════════════════════════════════════════════════'));
  console.log(c.bold('  STEP 4: Staging'));
  console.log(c.bold('═══════════════════════════════════════════════════════════════\n'));

  if (options.dryRun) {
    console.log(c.dim('[DRY RUN] Would run: git add -A'));
    return;
  }

  execGit('add -A');
  console.log(c.success('✅ All changes staged.'));
}

async function step5_commit(options: CliOptions): Promise<void> {
  console.log(c.bold('\n═══════════════════════════════════════════════════════════════'));
  console.log(c.bold('  STEP 5: Commit'));
  console.log(c.bold('═══════════════════════════════════════════════════════════════\n'));

  let message = options.message;

  if (!message) {
    // Show recent commits for style reference
    console.log(c.dim('Recent commits for reference:'));
    try {
      const logs = execGit('log --oneline -5');
      logs.split('\n').forEach(line => console.log(c.dim(`  ${line}`)));
    } catch {
      // Might fail on new repo
    }

    console.log('');
    message = await prompt('Commit message: ');

    if (!message) {
      console.log(c.error('Commit message cannot be empty.'));
      process.exit(1);
    }
  }

  // Add co-authorship
  const fullMessage = `${message}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`;

  if (options.dryRun) {
    console.log(c.dim('[DRY RUN] Would commit with message:'));
    console.log(c.dim(`  "${message}"`));
    console.log(c.dim('  Co-Authored-By: Claude <noreply@anthropic.com>'));
    return;
  }

  // Use heredoc-style commit to handle special characters
  execSync(`git commit -m "$(cat <<'EOF'\n${fullMessage}\nEOF\n)"`, {
    encoding: 'utf-8',
    shell: '/bin/bash'
  });

  console.log(c.success(`\n✅ Committed: "${message}"`));
  console.log(c.dim('   Co-Authored-By: Claude <noreply@anthropic.com>'));
}

async function step6_pushOrPR(options: CliOptions): Promise<void> {
  if (options.skipPush) {
    console.log(c.info('\n--skip-push specified. Skipping push/PR step.'));
    return;
  }

  console.log(c.bold('\n═══════════════════════════════════════════════════════════════'));
  console.log(c.bold('  STEP 6: Push / PR Creation'));
  console.log(c.bold('═══════════════════════════════════════════════════════════════\n'));

  if (!hasRemote()) {
    console.log(c.warn('No remote configured. Skipping push.'));
    return;
  }

  const branch = getCurrentBranch();
  const onMain = isMainBranch(branch);

  console.log(`Current branch: ${c.info(branch)}`);

  if (onMain) {
    // Main branch - direct push with confirmation
    console.log(c.warn('\n⚠️  You are on the main branch.'));

    if (options.dryRun) {
      console.log(c.dim('[DRY RUN] Would push to origin/main'));
      return;
    }

    if (!options.force) {
      const proceed = await confirm('Push directly to main?', false);
      if (!proceed) {
        console.log(c.info('\nSkipped push. Your commit is local.'));
        return;
      }
    }

    console.log(c.info('\nPushing to origin...'));
    execGit('push');
    console.log(c.success('✅ Pushed to origin/main'));

  } else {
    // Feature branch - push and offer PR
    if (options.dryRun) {
      console.log(c.dim(`[DRY RUN] Would push branch "${branch}" and offer PR creation`));
      return;
    }

    // Push the branch
    console.log(c.info(`\nPushing branch "${branch}"...`));
    try {
      execGit(`push -u origin ${branch}`);
      console.log(c.success(`✅ Pushed to origin/${branch}`));
    } catch (error) {
      console.log(c.warn('Push failed. You may need to pull first.'));
      return;
    }

    // Offer PR creation if gh is available
    if (hasGhCli()) {
      console.log('');
      const createPR = await confirm('Create a pull request?', true);

      if (createPR) {
        console.log(c.info('\nOpening PR creation...'));
        try {
          execSync('gh pr create --web', { stdio: 'inherit' });
        } catch {
          console.log(c.warn('PR creation cancelled or failed.'));
        }
      }
    } else {
      console.log(c.dim('\n💡 Tip: Install GitHub CLI (gh) for PR creation support.'));
      console.log(c.dim('   brew install gh'));
    }
  }
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log(c.bold('\n🔒 Git Checkin - Secure Commit Workflow\n'));

  if (options.dryRun) {
    console.log(c.warn('🔍 DRY RUN MODE - No changes will be made\n'));
  }

  // Check if we're in a git repo
  if (!isGitRepo()) {
    console.log(c.error('Not a git repository. Run "git init" first.'));
    process.exit(1);
  }

  try {
    // Step 1: Check status
    const files = await step1_checkStatus(options);

    // Step 2: Security scan
    const scanPassed = await step2_securityScan(files, options);
    if (!scanPassed) {
      process.exit(1);
    }

    // Step 3: Confirm deleted files
    await step3_confirmDeleted(files, options);

    // Step 4: Stage
    await step4_stage(options);

    // Step 5: Commit
    await step5_commit(options);

    // Step 6: Push or PR
    await step6_pushOrPR(options);

    console.log(c.bold('\n═══════════════════════════════════════════════════════════════'));
    console.log(c.success('  ✅ Git check-in complete!'));
    console.log(c.bold('═══════════════════════════════════════════════════════════════\n'));

  } catch (error) {
    console.log(c.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

main();
