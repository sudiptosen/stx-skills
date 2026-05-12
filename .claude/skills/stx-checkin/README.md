# Git Checkin Skill - Research & Design

This document captures the research findings, design decisions, and rationale behind the `/stx-checkin` skill.

## Problem Statement

Developers frequently commit sensitive files (API keys, credentials, private keys) to git repositories by accident. Once committed, these secrets are extremely difficult to remove from git history and may be exposed publicly.

Additionally, git workflows often involve repetitive steps:
1. Checking status
2. Staging files
3. Writing commit messages
4. Pushing to remote
5. Creating pull requests

This skill automates the workflow while adding security guardrails.

## Research Findings

### The Scale of Secret Leaks

**GitGuardian 2024 State of Secrets Sprawl Report:**
- **12.8 million secrets** leaked on public GitHub repositories in 2023
- **1 in 10** code authors exposed a secret in 2023
- Average time to remediation: **27 days**
- 90% of leaked secrets remain valid for 5+ days

Sources:
- [GitGuardian: State of Secrets Sprawl 2024](https://www.gitguardian.com/state-of-secrets-sprawl-report-2024)
- [GitGuardian: Top 10 File Extensions with Secrets](https://blog.gitguardian.com/top-10-file-extensions/)

### Why Pre-Commit Security is Critical

**Shift-Left Security Principle:**
- Catching issues at commit time is 10-100x cheaper than production
- Prevention is always better than cleanup
- Once in git history, secrets require `git filter-repo` to fully remove

**AWS DevOps Well-Architected:**
> "Enforce security checks before commit to prevent sensitive data from entering version control."

Sources:
- [AWS DevOps: Enforce Security Checks Before Commit](https://docs.aws.amazon.com/wellarchitected/latest/devops-guidance/dl.ld.4-enforce-security-checks-before-commit)
- [Orca Security: Git Hooks for Preventing Secrets](https://orca.security/resources/blog/git-hooks-prevent-secrets/)

### File Patterns with Highest Secret Density

Based on GitGuardian's analysis of leaked secrets:

| File Pattern | Risk Level | Common Secrets |
|--------------|------------|----------------|
| `.env` | Critical | API keys, DB passwords, service URLs |
| `*.pem`, `*.key` | Critical | TLS/SSL private keys, signing keys |
| `credentials.json` | Critical | GCP/AWS service account keys |
| `id_rsa`, `id_ed25519` | Critical | SSH private keys |
| `firebase-adminsdk*.json` | Critical | Firebase admin credentials |
| `*.p12`, `*.pfx` | High | Certificate bundles |
| `config.json` | Medium | Sometimes contains hardcoded secrets |
| `settings.json` | Medium | IDE settings may contain tokens |

### Why Bash-Only Implementation

**Trade-offs Considered:**

| Approach | Coverage | Complexity | Dependencies |
|----------|----------|------------|--------------|
| Simple file patterns | ~80% | Low | None |
| Regex content scanning | ~85% | Medium | None |
| Gitleaks integration | ~95% | High | Gitleaks binary |
| Full AST analysis | ~98% | Very High | Language-specific parsers |

**Decision: File pattern matching (80% coverage)**

Rationale:
- Zero external dependencies
- Works everywhere Node.js runs
- Easy to understand and maintain
- Catches most common mistakes
- Can add Gitleaks later as optional enhancement

### Branch-Aware Workflow Benefits

**Why Different Behavior for Main vs Feature Branches:**

1. **Main Branch Protection**
   - Direct pushes to main should require extra confirmation
   - Many teams disable direct pushes via branch protection rules
   - Extra friction prevents accidental production deploys

2. **Feature Branch PR Culture**
   - PRs enable code review before merge
   - GitHub/GitLab track PR history
   - CI/CD typically runs on PR creation

3. **Developer Experience**
   - Clear, predictable workflow
   - Automation reduces context switching
   - Integrates with existing `gh` CLI

## Design Decisions

### 1. Block vs Warn Strategy

**Blocked files** = Cannot proceed under any circumstances
- These are almost always mistakes
- The cost of a leaked secret far outweighs the inconvenience
- Examples: `.env`, `*.pem`, `credentials.json`

**Warned files** = Can proceed with confirmation
- Legitimate use cases exist (though rare)
- User education via suggestions
- Examples: `.DS_Store`, `node_modules/`

### 2. .gitignore Suggestions

When detecting problematic files, the skill suggests `.gitignore` entries:

```
Suggested .gitignore additions:
  .env
  .env.*
  *.pem
  *.key
```

This teaches developers proper practices rather than just blocking.

### 3. Co-Authorship Line

All commits include:
```
Co-Authored-By: Claude <noreply@anthropic.com>
```

Rationale:
- Transparency about AI assistance
- Matches GitHub's recognition format
- Consistent with Claude Code conventions

### 4. Exit Points

Every confirmation prompt accepts exit commands:
- `exit`, `quit`, `q`, `n`

This ensures users can always abort cleanly without making partial changes.

### 5. Dry Run Mode

The `--dry-run` flag shows exactly what would happen without making changes:
- Full security scan results
- Files that would be staged
- Commit message preview
- Push/PR preview

This helps users understand the workflow and catch issues before actual execution.

## Implementation Architecture

```
stx-checkin.ts
├── Colors (ANSI escape codes)
├── Security Patterns
│   ├── BLOCKED_PATTERNS (RegExp[])
│   ├── WARNED_PATTERNS (RegExp[])
│   └── LARGE_FILE_THRESHOLD (10MB)
├── Git Helpers
│   ├── execGit() - Run git commands
│   ├── getStatus() - Parse git status
│   ├── getCurrentBranch() - Get branch name
│   └── isMainBranch() - Check if main/master
├── Security Scanner
│   ├── scanForSensitiveFiles()
│   ├── scanForUnwantedFiles()
│   └── scanForLargeFiles()
├── Interactive Prompts
│   ├── confirm() - Yes/no with exit detection
│   └── prompt() - Text input with exit detection
└── Workflow
    ├── Step 1: Status check
    ├── Step 2: Security scan
    ├── Step 3: Deleted files confirmation
    ├── Step 4: Staging
    ├── Step 5: Commit
    └── Step 6: Push / PR
```

## Future Enhancements

### Phase 2: Gitleaks Integration (Optional)
```bash
/stx-checkin --deep-scan
# Uses Gitleaks for content-based secret detection
# Requires: brew install gitleaks
```

### Phase 3: Custom Patterns
```yaml
# .stx-checkin.yml
blocked:
  - "*.prod.json"
  - "deploy-key*"
warned:
  - "*.sql"
```

### Phase 4: Team Policies
```yaml
# .stx-checkin-policy.yml
require_pr: true
require_linear_history: true
max_file_size: 5MB
```

### Phase 5: Pre-Commit Hook
```bash
# Automatic on every commit
npx stx-checkin --hook
```

## Testing Strategy

### Unit Tests
- Pattern matching correctness
- Exit command detection
- Branch detection logic

### Integration Tests
- Full workflow with test repository
- Blocked file detection
- PR creation via `gh`

### Manual Testing Checklist
1. [ ] Dry run shows accurate preview
2. [ ] Blocked files prevent proceeding
3. [ ] Warned files allow continuation with confirmation
4. [ ] Exit commands work at every prompt
5. [ ] Main branch prompts for push confirmation
6. [ ] Feature branch offers PR creation
7. [ ] Commit message includes co-authorship
8. [ ] Large file detection works

## References

- [GitGuardian Blog](https://blog.gitguardian.com/)
- [AWS DevOps Guidance](https://docs.aws.amazon.com/wellarchitected/latest/devops-guidance/)
- [Orca Security: Git Hooks](https://orca.security/resources/blog/git-hooks-prevent-secrets/)
- [GitHub: Co-authored Commits](https://docs.github.com/en/pull-requests/committing-changes-to-your-project/creating-and-editing-commits/creating-a-commit-with-multiple-authors)
- [Git LFS](https://git-lfs.com/)
