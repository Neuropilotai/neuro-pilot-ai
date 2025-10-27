# Tag Protection Setup for v18.0-secure-cors

## Purpose
Protect the security baseline tag from accidental deletion or modification.

## Manual Setup (GitHub Web UI)

**Note:** Tag protection requires GitHub Enterprise or GitHub Team. For personal repos, document tag importance in README.

### If Available (Enterprise/Team):

1. Go to: `https://github.com/Neuropilotai/neuro-pilot-ai/settings/tag_protection`
2. Click "Add rule"
3. Pattern: `v18.0-secure-cors`
4. Save

### Alternative Protection (All Repo Types):

**Document in README.md:**
```markdown
## Security Baseline Tags

**⚠️ DO NOT DELETE OR MODIFY THESE TAGS:**
- `v18.0-secure-cors` - Certified security baseline (2025-10-27)
  - All CORS guardrails verified
  - CIS-compliant runtime
  - Safe rollback target
```

## CLI Protection (If GitHub CLI auth available)

```bash
# Note: Requires admin access
gh api \
  -X POST \
  repos/Neuropilotai/neuro-pilot-ai/tags/v18.0-secure-cors/protection \
  -F enforce_admins=true \
  -F required_status_checks.contexts='["CORS Guardrails","Security Lint"]'
```

## Verification

Check tag exists:
```bash
git tag -l "v18.0-secure-cors"
git show v18.0-secure-cors
```

## Rollback to Baseline

```bash
# Via Git
git checkout v18.0-secure-cors

# Via Railway
railway redeploy --rollback
# Or: Railway UI → Deployments → v18.0-secure-cors → Deploy
```
