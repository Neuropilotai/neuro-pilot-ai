# 🧭 NeuroPilot Governance Dashboard - Super Prompt

**Copy this entire prompt into Claude 3.5 Sonnet to generate a complete read-only Next.js governance dashboard.**

---

```yaml
# ================================================================
# 🧭 NEUROPILOT GOVERNANCE DASHBOARD (Exec Read-Only)
# ================================================================
system_role: "Product Engineer for Read-Only Cloud Governance UI"
version: "1.0"
description: >
  Build a secure, read-only Next.js (App Router) dashboard for NeuroPilot v17.4.
  It aggregates live metrics (Grafana), incidents/errors (Sentry), and daily ops
  logs (Notion) into a single executive view. No write endpoints. Ship for Vercel.

# ================================================================
# 🎯 REQUIREMENTS
# ================================================================
requirements:
  framework: Next.js 14 (App Router, edge runtime where sensible)

  data_sources:
    - name: Grafana API
      panels:
        - p95 latency (ms)
        - error rate (%)
        - requests per second
        - cost gauge (USD/month)
        - CPU usage (%)
        - memory usage (%)

    - name: Sentry API
      data:
        - Last 24h issues
        - Release tracking
        - Error trends

    - name: Notion API
      database: neuropilot_ops_log
      columns:
        - timestamp
        - action (restart/scale/optimize/audit)
        - result (success/rollback/noop)
        - notes
        - links
      fetch: Latest 14 entries

  auth:
    type: Bearer token
    env_var: NEXT_PUBLIC_DASH_TOKEN
    optional: Basic auth as fallback

  caching:
    strategy: ISR (Incremental Static Regeneration)
    revalidate: 30-60 seconds
    exceptions:
      - /incidents (no ISR, always fresh)

  pages:
    - path: /
      name: Overview
      content:
        - SLA tile (99.99% target vs actual)
        - Cost gauge (<$35 budget vs actual)
        - Uptime trend (last 7 days)
        - Last 3 actions (from Notion)
        - Next risk window (from forecast API)

    - path: /incidents
      name: Incidents
      content:
        - Sentry issues table
        - Columns: severity, env, first seen, last seen, status
        - Links to Sentry permalinks

    - path: /metrics
      name: Metrics
      content:
        - Grafana snapshot embeds
        - Live numbers: p95, error%, RPS, CPU, Memory
        - 24h trend sparklines

    - path: /compliance
      name: Compliance
      content:
        - Last 7 self-audit reports
        - Overall score trend
        - Critical/high findings
        - Zero-trust status
        - Terraform drift indicator

    - path: /changelog
      name: Changelog
      content:
        - Last 14 AI playbooks executed
        - Columns: timestamp, action, result, duration
        - Links to detailed logs

  styling:
    framework: Tailwind CSS
    theme: Light/dark mode toggle
    print: Print-friendly compliance page
    accessibility:
      - Semantic HTML
      - Keyboard navigation
      - WCAG 2.1 AA color contrast

  deployment:
    platform: Vercel
    edge: Use edge runtime for API routes
    security_headers:
      - Strict-Transport-Security: max-age=31536000
      - X-Content-Type-Options: nosniff
      - X-Frame-Options: DENY
      - Content-Security-Policy: "script-src 'self' vercel-insights; object-src 'none'"
      - Referrer-Policy: no-referrer
      - Permissions-Policy: "camera=(),microphone=()"

# ================================================================
# 🔐 ENVIRONMENT VARIABLES
# ================================================================
env_vars:
  required:
    - GRAFANA_URL
    - GRAFANA_API_KEY
    - SENTRY_ORG
    - SENTRY_PROJECT
    - SENTRY_TOKEN
    - NOTION_API_KEY
    - NOTION_DB_ID
    - NEXT_PUBLIC_DASH_TOKEN

  optional:
    - FORECAST_API_URL
    - FORECAST_API_TOKEN

# ================================================================
# 📁 FILE STRUCTURE
# ================================================================
files:
  app:
    - layout.tsx
    - page.tsx                      # Overview
    - middleware.ts                 # Auth check
    - incidents/page.tsx
    - metrics/page.tsx
    - compliance/page.tsx
    - changelog/page.tsx

  lib:
    - grafana.ts                    # Typed fetchers + Zod schemas
    - sentry.ts
    - notion.ts
    - forecast.ts                   # Optional
    - types.ts                      # Shared TypeScript types

  components:
    - KPITiles.tsx                  # SLA, Cost, Uptime tiles
    - ChartCard.tsx                 # Wrapper for metric charts
    - TrendSpark.tsx                # Sparkline for trends
    - IncidentTable.tsx             # Sentry issues table
    - ComplianceCard.tsx            # Audit summary cards
    - ThemeToggle.tsx               # Light/dark mode

  styles:
    - globals.css                   # Tailwind base

  config:
    - vercel.json                   # Security headers
    - next.config.js                # ISR settings

  root:
    - README.md                     # 2-min deploy guide
    - .env.example                  # All env vars documented

# ================================================================
# 🧠 DATA CONTRACTS (TypeScript + Zod)
# ================================================================
data_contracts:
  GrafanaMetrics:
    p95_latency_ms: z.number()
    error_rate_pct: z.number()
    requests_per_sec: z.number()
    monthly_cost_usd: z.number()
    cpu_usage_pct: z.number()
    memory_usage_pct: z.number()
    cache_hit_ratio_pct: z.number().optional()

  SentryIssue:
    id: z.string()
    title: z.string()
    severity: z.enum(['error', 'warning', 'info'])
    firstSeen: z.string()
    lastSeen: z.string()
    permalink: z.string().url()
    status: z.enum(['unresolved', 'resolved', 'ignored'])

  NotionOpsLog:
    ts: z.string()
    action: z.enum(['restart', 'scale', 'optimize', 'audit'])
    result: z.enum(['success', 'rollback', 'noop'])
    notes: z.string()
    links: z.array(z.string().url())
    duration_seconds: z.number().optional()

  ComplianceAudit:
    timestamp: z.string()
    overall_score: z.number().min(0).max(100)
    status: z.enum(['PASSED', 'WARNING', 'FAILED'])
    critical_findings: z.number()
    high_findings: z.number()
    drift_detected: z.boolean()

# ================================================================
# 🧪 QUALITY ASSURANCE
# ================================================================
qa:
  testing:
    - Add Playwright E2E test:
        - Verify auth middleware blocks missing token
        - Test all 5 pages render without errors
        - Validate data fetching (mocked APIs)

    - Add Jest unit tests:
        - Test Zod schema validation
        - Test data transformation functions
        - Test utility functions

  performance:
    - Lighthouse score: ≥ 95 (Performance, Accessibility, Best Practices, SEO)
    - First Contentful Paint: < 1.5s
    - Time to Interactive: < 3.5s

  accessibility:
    - Axe DevTools: 0 critical issues
    - Keyboard navigation: All interactive elements accessible
    - Screen reader: Proper ARIA labels

# ================================================================
# 🔒 SECURITY
# ================================================================
security:
  principles:
    - No client-side secrets (all API keys server-side only)
    - All external fetches server-side with tokens from env
    - Read-only operations (no POST/PUT/DELETE endpoints)
    - Rate limiting on API routes (10 req/min per IP)

  headers:
    CSP: "script-src 'self' vercel-insights; object-src 'none'; base-uri 'self'"
    HSTS: "max-age=31536000; includeSubDomains"
    X-Frame-Options: "DENY"
    X-Content-Type-Options: "nosniff"

  auth:
    - Middleware checks Authorization: Bearer {NEXT_PUBLIC_DASH_TOKEN}
    - Return 401 if missing or invalid
    - Optional: Support Basic Auth as fallback

# ================================================================
# ✅ ACCEPTANCE CRITERIA
# ================================================================
acceptance:
  build:
    - npm run build succeeds with 0 errors
    - All environment variables documented in .env.example
    - README has clear 2-minute deploy instructions

  functionality:
    - Overview page shows 4 KPI tiles + next risk window
    - Incidents page lists last 24h Sentry issues with working links
    - Metrics page displays Grafana charts + live numbers
    - Compliance page shows last 7 audits with trend
    - Changelog lists last 14 AI actions from Notion

  security:
    - Middleware enforces bearer token auth
    - All API routes are server-side only
    - No secrets exposed in client bundle

  deployment:
    - One-command Vercel deploy works
    - All env vars configurable via Vercel dashboard
    - Healthcheck endpoint (/api/health) returns 200

# ================================================================
# 📖 IMPLEMENTATION GUIDE
# ================================================================
implementation:
  step1_scaffold:
    - npx create-next-app@latest governance-dashboard
    - Select: TypeScript, Tailwind, App Router, No src/

  step2_dependencies:
    - npm install zod @notionhq/client
    - npm install -D @playwright/test

  step3_env_setup:
    - Copy .env.example to .env.local
    - Fill in all API tokens

  step4_code_generation:
    - Generate all files from file structure above
    - Implement data fetchers with Zod validation
    - Build components with Tailwind
    - Add middleware for auth

  step5_testing:
    - npm run dev (verify local)
    - npm run test (Jest)
    - npx playwright test

  step6_deploy:
    - vercel login
    - vercel env add (for each env var)
    - vercel deploy --prod

# ================================================================
# 🎨 UI/UX DESIGN PATTERNS
# ================================================================
design:
  overview_page:
    layout: 2x2 grid of KPI tiles + forecast card below
    kpi_tiles:
      - SLA: Large percentage (99.99%), sparkline, status indicator
      - Cost: Gauge chart ($28/$35), projected monthly
      - Uptime: 7-day bar chart, current streak
      - Actions: Count of last 24h actions, success rate
    forecast_card:
      - "Next Risk Window"
      - Incident type, probability, time to event
      - "View details" link to metrics page

  incidents_page:
    - Filterable table (severity, status)
    - Sortable by first seen / last seen
    - Click row to open Sentry permalink in new tab
    - Badge for severity (red=error, yellow=warning, blue=info)

  metrics_page:
    - Grid of metric cards (3 columns on desktop)
    - Each card: Title, live value, 24h trend sparkline
    - Grafana snapshot embeds for detailed charts

  compliance_page:
    - Timeline view of last 7 audits
    - Overall score trend line chart
    - Expandable cards for each audit (findings, recommendations)
    - Print-friendly version (hide nav, optimize layout)

  changelog_page:
    - Reverse chronological list
    - Each entry: icon, timestamp, action, result badge, duration
    - Expandable for detailed notes + log links

# ================================================================
# 📋 EXAMPLE .env.example
# ================================================================
env_example: |
  # NeuroPilot Governance Dashboard Environment Variables

  # Grafana
  GRAFANA_URL=https://your-org.grafana.net
  GRAFANA_API_KEY=glsa_your_api_key_here

  # Sentry
  SENTRY_ORG=your-org
  SENTRY_PROJECT=neuropilot-backend
  SENTRY_TOKEN=sntrys_your_token_here

  # Notion
  NOTION_API_KEY=secret_your_notion_key
  NOTION_DB_ID=your_database_id

  # Dashboard Auth
  NEXT_PUBLIC_DASH_TOKEN=your_secure_bearer_token_here

  # Optional: Forecast API
  FORECAST_API_URL=https://api.neuropilot.com/v1/forecast
  FORECAST_API_TOKEN=your_forecast_token

# ================================================================
# 📋 EXAMPLE README.md
# ================================================================
readme_content: |
  # NeuroPilot Governance Dashboard

  Read-only executive dashboard for NeuroPilot v17.4 Sentient Cloud.

  ## 🚀 Quick Deploy (2 minutes)

  ```bash
  # 1. Clone and install
  git clone <repo>
  cd governance-dashboard
  npm install

  # 2. Configure environment
  cp .env.example .env.local
  # Edit .env.local with your API tokens

  # 3. Deploy to Vercel
  vercel login
  vercel env add GRAFANA_URL
  vercel env add GRAFANA_API_KEY
  vercel env add SENTRY_ORG
  vercel env add SENTRY_PROJECT
  vercel env add SENTRY_TOKEN
  vercel env add NOTION_API_KEY
  vercel env add NOTION_DB_ID
  vercel env add NEXT_PUBLIC_DASH_TOKEN
  vercel deploy --prod
  ```

  ## 📄 Pages

  - `/` - Overview (SLA, cost, uptime, forecast)
  - `/incidents` - Sentry issues (last 24h)
  - `/metrics` - Grafana metrics (live)
  - `/compliance` - Self-audit reports (last 7)
  - `/changelog` - AI actions (last 14)

  ## 🔐 Authentication

  All requests require:
  ```
  Authorization: Bearer YOUR_DASH_TOKEN
  ```

  Set `NEXT_PUBLIC_DASH_TOKEN` in Vercel environment variables.

  ## 🧪 Development

  ```bash
  npm run dev       # Start dev server
  npm run test      # Run Jest tests
  npm run e2e       # Run Playwright tests
  npm run build     # Build for production
  ```

# ================================================================
# 🎯 DELIVERABLES
# ================================================================
deliverables:
  - Complete Next.js 14 app (App Router)
  - All 5 pages implemented
  - Auth middleware with bearer token
  - Grafana, Sentry, Notion integrations
  - TypeScript + Zod validation
  - Tailwind CSS styling (light/dark mode)
  - Playwright E2E tests
  - vercel.json with security headers
  - README.md with 2-min deploy guide
  - .env.example with all variables

# ================================================================
# ✅ SUCCESS CRITERIA
# ================================================================
success:
  - All pages render without errors
  - Auth middleware blocks unauthorized access
  - Data fetches work with real APIs
  - Lighthouse score ≥ 95
  - Zero Axe accessibility violations
  - One-command Vercel deploy works
  - Total setup time: < 5 minutes
```

---

## 🚀 How to Use This Prompt

1. **Copy the entire YAML block above**

2. **Open Claude 3.5 Sonnet** (via Claude.ai or API)

3. **Paste the prompt** with this instruction:

```
Generate a complete Next.js 14 governance dashboard based on this spec.
Provide all files ready to copy-paste into a new Next.js project.
Include complete implementations (no placeholders).
```

4. **Claude will generate**:
   - All TypeScript files (app/, lib/, components/)
   - Tailwind CSS styling
   - Zod schemas for type safety
   - Middleware for authentication
   - vercel.json configuration
   - README.md with deploy instructions
   - .env.example template

5. **Deploy in 2 minutes**:
   ```bash
   # Create new directory
   mkdir governance-dashboard
   cd governance-dashboard

   # Initialize Next.js
   npx create-next-app@latest .

   # Paste all generated files (overwrite defaults)

   # Configure environment
   cp .env.example .env.local
   # Fill in your API tokens

   # Deploy
   vercel env add GRAFANA_URL
   vercel env add GRAFANA_API_KEY
   # ... (add all env vars)
   vercel deploy --prod
   ```

6. **Access dashboard**:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://your-dashboard.vercel.app
   ```

---

## 📊 Expected Output

A fully functional dashboard at `https://your-dashboard.vercel.app` with:

- ✅ **Overview**: SLA 99.99%, Cost $29/$35, Uptime trend, Next risk window
- ✅ **Incidents**: Last 24h Sentry errors with links
- ✅ **Metrics**: Live Grafana charts (p95, error%, RPS, CPU, Memory)
- ✅ **Compliance**: Last 7 audit reports with scores
- ✅ **Changelog**: Last 14 AI actions (restart/scale/optimize)

All read-only, secure, and auto-updating every 30-60 seconds.

---

## 🎯 Next Steps After Deploy

1. **Bookmark dashboard** - `https://your-dashboard.vercel.app`
2. **Share with team** - Distribute bearer token securely
3. **Monitor daily** - Check overview page for anomalies
4. **Review weekly** - Compliance trends, cost trajectory
5. **Tune as needed** - Adjust ISR revalidation times

---

**This is your executive window into sentient infrastructure. One URL, all the insights.** 📊
