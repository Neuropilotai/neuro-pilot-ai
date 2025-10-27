# Pull Request Security Requirements

## Overview

All pull requests to `main` and `develop` branches must pass mandatory security checks before merge. This ensures no regression in CORS security, runtime safety, or code quality.

## Required Status Checks

### Automatic Checks (GitHub Actions)

#### 1. ✅ CORS Security Guardrails
**Workflow:** `.github/workflows/cors-security-guardrails.yml`

**Checks:**
- **Lint Guardrails:** Scans for insecure CORS patterns
- **CORS Test (Production):** Validates production endpoint security
- **Security Report:** Generates automated summary

**Pass Criteria:**
- No `app.use(cors())` without options
- No `origin: '*'` string literals
- No `origin: true` patterns
- Production endpoint passes CORS validation

**How to fix failures:**
```bash
# Run locally before PR
./inventory-enterprise/backend/scripts/grep-guardrails.sh

# If fails, check:
git diff main -- railway-server-production.js
git diff main -- inventory-enterprise/backend/server.js
```

#### 2. ✅ Nightly Security Verification
**Workflow:** `.github/workflows/nightly-security-check.yml`

**Checks:**
- Production CORS verification
- TLS certificate expiry
- Runtime integrity checksums

**Pass Criteria:**
- All production guardrails pass
- Certificate valid for >30 days
- Checksums match baseline

## GitHub Branch Protection Setup

**Required for: `main` branch**

### Manual Setup Steps:

1. Go to: `https://github.com/Neuropilotai/neuro-pilot-ai/settings/branches`
2. Find `main` branch → Click "Edit" or "Add rule"
3. Configure:

```yaml
Branch name pattern: main

Protection rules:
  ✅ Require a pull request before merging
     - Require approvals: 1 (recommended)
     - Dismiss stale pull request approvals when new commits are pushed
     - Require review from Code Owners (if CODEOWNERS file exists)

  ✅ Require status checks to pass before merging
     - Require branches to be up to date before merging
     - Status checks that are required:
       ✅ Lint - CORS Security Patterns
       ✅ Test - CORS Security (Production)
       ✅ Generate Security Report

  ✅ Require conversation resolution before merging
  ✅ Require linear history (recommended)
  ✅ Include administrators (enforce for everyone)

  ⚠️  Do not allow bypassing the above settings
```

4. Click "Create" or "Save changes"

### CLI Setup (Alternative):

```bash
# Requires GitHub CLI and admin access
gh api repos/Neuropilotai/neuro-pilot-ai/branches/main/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -f required_status_checks[strict]=true \
  -f required_status_checks[contexts][]='Lint - CORS Security Patterns' \
  -f required_status_checks[contexts][]='Test - CORS Security (Production)' \
  -f required_pull_request_reviews[required_approving_review_count]=1 \
  -f enforce_admins=true \
  -f required_conversation_resolution=true
```

## Pre-PR Checklist

Before opening a pull request that touches security-critical files, run:

```bash
# 1. Run CORS guardrail lint
./inventory-enterprise/backend/scripts/grep-guardrails.sh

# 2. Run Jest tests locally
cd inventory-enterprise/backend
npm test -- cors.guardrail.test.js

# 3. Verify no secrets committed
git diff main | grep -i -E "(password|secret|api_key|token)" && echo "⚠️ Potential secret detected!"

# 4. Check commit message follows conventions
git log -1 --pretty=%B | grep -E "^(feat|fix|security|docs|refactor|test|chore):" || echo "⚠️ Use conventional commit format"
```

## Security-Critical Files

Changes to these files automatically trigger security workflows:

```
railway-server-production.js          # Production entry point
inventory-enterprise/backend/server.js # Backend API server
inventory-enterprise/backend/**/*.js   # All backend code
.github/workflows/*.yml                # CI/CD configuration
railway.json                           # Railway deployment config
nixpacks.toml                          # Build configuration
```

## PR Template

Create `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Description
<!-- Describe your changes -->

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Security fix (fixes a vulnerability or hardens security)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)

## Security Checklist
- [ ] No secrets committed (checked with `git diff | grep -i secret`)
- [ ] CORS guardrails pass (`./backend/scripts/grep-guardrails.sh`)
- [ ] No wildcard CORS introduced
- [ ] Runtime error handlers present (if modifying server)
- [ ] Changes reviewed against v18.0-secure-cors baseline

## Testing
- [ ] Local testing completed
- [ ] CORS tests pass
- [ ] Healthcheck returns 200 OK

## Related Issues
Closes #<!-- issue number -->
```

## Security Review Process

### For Security-Sensitive PRs:

1. **Author Self-Review:**
   - Run all pre-PR checks
   - Compare against v18.0-secure-cors baseline
   - Document security impact

2. **Automated Review:**
   - GitHub Actions runs all security checks
   - Must show green checkmarks before merge

3. **Human Review:**
   - At least 1 approval required
   - Security team review if CORS/auth changes

4. **Post-Merge Verification:**
   - Nightly security check validates production
   - Railway deployment monitored for health

## Common Failure Scenarios

### ❌ "Lint - CORS Security Patterns" Fails

**Cause:** Insecure CORS pattern detected

**Fix:**
```bash
# Check what pattern was found
./inventory-enterprise/backend/scripts/grep-guardrails.sh

# Common issues:
# 1. app.use(cors()) without options
#    Fix: Use cors({ origin: function(origin, callback) {...} })

# 2. origin: '*'
#    Fix: Use allowlist with matchOrigin()

# 3. origin: true
#    Fix: Use explicit origin validation
```

### ❌ "Test - CORS Security (Production)" Fails

**Cause:** Production endpoint has wildcard CORS or is unreachable

**Fix:**
```bash
# 1. Verify production is healthy
curl https://resourceful-achievement-production.up.railway.app/api/health

# 2. Check CORS headers
curl -sI -H "Origin: https://neuropilot-inventory.vercel.app" \
  https://resourceful-achievement-production.up.railway.app/api/health | grep access-control

# 3. If wildcard detected, rollback
railway redeploy --rollback
```

### ❌ "Security Report" Fails

**Cause:** Critical security issue detected in code review

**Fix:**
- Review security summary in GitHub Actions output
- Address all flagged issues
- Re-run checks

## Emergency Bypass (Break Glass)

**⚠️ Use only in production emergencies**

If you need to bypass checks to fix a critical production issue:

1. Admin user can override branch protection
2. Must document reason in commit message: `[EMERGENCY BYPASS] Reason: Production down, hotfix for CORS regression`
3. Create follow-up issue to restore security compliance
4. Tag: `v18.0-secure-cors-hotfix-N`

**Post-bypass actions:**
1. Immediate security audit of bypassed commit
2. Run full security verification: `./verify-cors-security.sh`
3. Update SECURITY_CERTIFICATION.md with audit results
4. Create ticket to re-enable protections

## Monitoring PR Compliance

### Weekly Review:
```bash
# Check if branch protection is active
gh api repos/Neuropilotai/neuro-pilot-ai/branches/main/protection | jq '.required_status_checks'

# List recent PRs that bypassed checks
gh pr list --state merged --json number,title,author,mergedBy --jq '.[] | select(.mergedBy.login != null)'
```

### Monthly Audit:
1. Review all merged PRs without status checks
2. Verify no security regressions
3. Update branch protection rules if needed

## References

- Branch Protection: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches
- Status Checks: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks
- Security Baseline: `v18.0-secure-cors`
- CORS Implementation: `railway-server-production.js` lines 23-78
