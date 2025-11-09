# GROUP7 Migration Plan

## Current State Assessment

### Existing Structure
```
neuro-pilot-ai/
├── backend/              # Neuro.Pilot.AI backend (trading, resume)
├── frontend/             # React dashboard
├── inventory-enterprise/ # Enterprise inventory system
├── Group7/               # GROUP7 files (unorganized)
│   └── App/              # Canva SDK starter kit
└── [various docs]
```

### Issues
1. **No clear separation** between Neuro.Pilot.AI and GROUP7 projects
2. **Group7/ folder is unorganized** - contains starter kit but no production code
3. **Missing monorepo structure** - no workspaces, no shared packages
4. **Environment variables scattered** - multiple .env files across projects
5. **No validation tooling** - manual checks for API keys and services

## Target State

### Proposed Structure
```
neuro-pilot-ai/
├── backend/              # [UNCHANGED] Neuro.Pilot.AI backend
├── frontend/             # [UNCHANGED] Neuro.Pilot.AI frontend
├── inventory-enterprise/ # [UNCHANGED] Inventory system
├── Group7/               # [NEW] Isolated GROUP7 monorepo
│   ├── apps/
│   │   ├── canva-render/       # Express service for Canva rendering
│   │   │   ├── src/
│   │   │   │   ├── server.js
│   │   │   │   ├── routes/
│   │   │   │   └── utils/
│   │   │   ├── package.json
│   │   │   └── README.md
│   │   └── make-orchestrator/  # Make.com webhook handlers
│   │       ├── src/
│   │       │   ├── index.js
│   │       │   ├── handlers/
│   │       │   └── middleware/
│   │       ├── package.json
│   │       └── README.md
│   ├── packages/
│   │   └── shared/             # Common utilities
│   │       ├── src/
│   │       │   ├── types/
│   │       │   ├── utils/
│   │       │   ├── logger/
│   │       │   └── schemas/
│   │       └── package.json
│   ├── ops/
│   │   └── scripts/            # Deployment, CI/CD helpers
│   ├── tests/
│   │   └── e2e/                # End-to-end test suite
│   ├── package.json            # Workspace root
│   ├── .env.template
│   └── ARCHITECTURE.md
├── scripts/              # [NEW] Root-level validation scripts
│   ├── env-check.mjs
│   └── smoke-test.mjs
├── tests/                # [NEW] Root-level E2E tests
│   └── e2e/
│       └── dry-run.mjs
├── ARCHITECTURE.md       # [NEW] GROUP7 architecture docs
└── GROUP7_MIGRATION_PLAN.md  # This file
```

## Migration Steps

### Phase 1: Non-Breaking Setup (Safe to execute now)

#### Step 1.1: Create Directory Structure
```bash
# Create GROUP7 monorepo structure
mkdir -p Group7/{apps/{canva-render,make-orchestrator},packages/shared,ops/scripts,tests/e2e}
mkdir -p Group7/apps/canva-render/{src/routes,src/utils}
mkdir -p Group7/apps/make-orchestrator/{src/handlers,src/middleware}
mkdir -p Group7/packages/shared/src/{types,utils,logger,schemas}
```

#### Step 1.2: Create Workspace Package.json
```bash
cat > Group7/package.json << 'EOF'
{
  "name": "group7-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "pnpm --parallel dev",
    "build": "pnpm --recursive build",
    "test": "pnpm --recursive test",
    "lint": "pnpm --recursive lint",
    "env:check": "node ../scripts/env-check.mjs",
    "smoke": "node ../scripts/smoke-test.mjs",
    "e2e:dry": "node ../tests/e2e/dry-run.mjs"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "eslint": "^8.56.0",
    "prettier": "^3.1.1"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=8.0.0"
  }
}
EOF
```

#### Step 1.3: Create .env.template
```bash
cat > Group7/.env.template << 'EOF'
# GROUP7 Environment Variables
# Copy this to .env and fill in your actual keys

# ============================================================================
# EXTERNAL API KEYS (Required)
# ============================================================================

# OpenAI - Script polishing
OPENAI_API_KEY=sk-REPLACE_WITH_YOUR_OPENAI_KEY

# ElevenLabs - Text-to-speech
ELEVENLABS_API_KEY=REPLACE_WITH_YOUR_ELEVENLABS_KEY

# CloudConvert - Video merging
CLOUDCONVERT_API_KEY=REPLACE_WITH_YOUR_CLOUDCONVERT_KEY

# Notion - Analytics and logging
NOTION_TOKEN=secret_REPLACE_WITH_YOUR_NOTION_TOKEN

# Metricool - Social media scheduling
METRICOOL_API_TOKEN=REPLACE_WITH_YOUR_METRICOOL_TOKEN

# Canva - Video rendering
CANVA_APP_ID=REPLACE_WITH_YOUR_CANVA_APP_ID
CANVA_TEMPLATE_ID=REPLACE_WITH_YOUR_TEMPLATE_ID

# ============================================================================
# STORAGE (Choose ONE)
# ============================================================================

# Option A: Google Drive
# GOOGLE_CREDENTIALS_JSON={"type":"service_account"...}

# Option B: OneDrive
# ONEDRIVE_CLIENT_ID=
# ONEDRIVE_CLIENT_SECRET=
# ONEDRIVE_TENANT_ID=
# ONEDRIVE_REFRESH_TOKEN=

# ============================================================================
# SERVICE CONFIGURATION
# ============================================================================

# Canva Render Service URL (local or deployed)
SERVICE_URL_CANVA_RENDER=http://localhost:3001

# ============================================================================
# OPTIONAL
# ============================================================================

# Logging level (debug, info, warn, error)
LOG_LEVEL=info

# Runtime environment
RUN_ENV=development

# Frontend URL (if applicable)
FRONTEND_URL=http://localhost:3001
EOF
```

#### Step 1.4: Initialize Packages
```bash
# packages/shared
cat > Group7/packages/shared/package.json << 'EOF'
{
  "name": "@group7/shared",
  "version": "1.0.0",
  "type": "module",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "exports": {
    ".": "./src/index.js",
    "./types": "./src/types/index.js",
    "./utils": "./src/utils/index.js",
    "./logger": "./src/logger/index.js",
    "./schemas": "./src/schemas/index.js"
  },
  "dependencies": {
    "pino": "^8.17.2",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "typescript": "^5.3.3"
  }
}
EOF

# apps/canva-render
cat > Group7/apps/canva-render/package.json << 'EOF'
{
  "name": "@group7/canva-render",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "test": "node --test"
  },
  "dependencies": {
    "@group7/shared": "workspace:*",
    "express": "^4.18.2",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
EOF

# apps/make-orchestrator
cat > Group7/apps/make-orchestrator/package.json << 'EOF'
{
  "name": "@group7/make-orchestrator",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "@group7/shared": "workspace:*",
    "express": "^4.18.2",
    "dotenv": "^16.3.1"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
EOF
```

### Phase 2: Move Existing Code (Audit first)

#### Step 2.1: Audit Current Group7/ Folder
```bash
# List what's currently in Group7/
ls -la Group7/

# Check for any production code
find Group7/ -name "*.js" -o -name "*.ts" | head -20
```

#### Step 2.2: Migrate Canva Code (if exists)
```bash
# Only run if you have existing Canva integration code
# cp Group7/App/... Group7/apps/canva-render/src/
```

### Phase 3: Root-Level Integration

#### Step 3.1: Update Root package.json
Add these scripts to `/neuro-pilot-ai/package.json`:
```json
{
  "scripts": {
    "env:check": "node scripts/env-check.mjs",
    "smoke": "node scripts/smoke-test.mjs",
    "e2e:dry": "node tests/e2e/dry-run.mjs",
    "group7:dev": "cd Group7 && pnpm dev",
    "group7:build": "cd Group7 && pnpm build"
  }
}
```

#### Step 3.2: Install pnpm (if needed)
```bash
# Check if pnpm is installed
pnpm --version || npm install -g pnpm
```

#### Step 3.3: Install Dependencies
```bash
# Install GROUP7 dependencies
cd Group7
pnpm install

# Return to root
cd ..
```

### Phase 4: Documentation

#### Step 4.1: Create Service READMEs
```bash
# Canva Render README
cat > Group7/apps/canva-render/README.md << 'EOF'
# Canva Render Service

HTTP service that renders videos from Canva templates.

## Endpoints

- `GET /health` - Health check
- `POST /render` - Render template

## Environment Variables

- `CANVA_APP_ID` - Canva application ID
- `CANVA_TEMPLATE_ID` - Template to render
- `PORT` - Server port (default: 3001)

## Usage

```bash
pnpm dev
```
EOF

# Make Orchestrator README
cat > Group7/apps/make-orchestrator/README.md << 'EOF'
# Make.com Orchestrator

Webhook handlers and orchestration logic for Make.com integration.

## Environment Variables

- `NOTION_TOKEN` - For logging
- `LOG_LEVEL` - Logging verbosity

## Usage

```bash
pnpm dev
```
EOF

# Shared Package README
cat > Group7/packages/shared/README.md << 'EOF'
# @group7/shared

Common utilities, types, and schemas for GROUP7 services.

## Exports

- `@group7/shared/types` - TypeScript interfaces
- `@group7/shared/utils` - Helper functions
- `@group7/shared/logger` - Structured logging
- `@group7/shared/schemas` - Zod validation schemas
EOF
```

#### Step 4.2: Update Root README
See separate task for README updates.

## Validation Checklist

After migration, verify:

- [ ] `npm run env:check` passes (after filling .env)
- [ ] `npm run smoke` shows API reachability
- [ ] `npm run e2e:dry` completes successfully
- [ ] `cd Group7 && pnpm install` works
- [ ] `cd Group7 && pnpm dev` starts services
- [ ] Existing Neuro.Pilot.AI services still work:
  - [ ] `npm run backend` works
  - [ ] `npm run frontend` works
  - [ ] `npm run inventory` works

## Rollback Plan

### If Issues Occur

All changes are **additive and isolated**:

1. **GROUP7 folder is separate** - can be deleted without affecting Neuro.Pilot.AI
2. **Root scripts are standalone** - don't interfere with existing functionality
3. **No modification to existing services** - backend, frontend, inventory unchanged

### Rollback Steps
```bash
# Remove GROUP7 monorepo
rm -rf Group7/

# Remove root-level validation scripts
rm -rf scripts/env-check.mjs scripts/smoke-test.mjs
rm -rf tests/e2e/dry-run.mjs

# Remove documentation
rm -f ARCHITECTURE.md GROUP7_MIGRATION_PLAN.md

# Revert package.json changes (if any)
git checkout package.json

# Verify existing services still work
npm run dev
```

## Timeline

| Phase | Duration | Risk | Can Start |
|-------|----------|------|-----------|
| Phase 1: Non-Breaking Setup | 15 min | None | Immediately |
| Phase 2: Move Code | 30 min | Low | After Phase 1 |
| Phase 3: Integration | 15 min | Low | After Phase 2 |
| Phase 4: Documentation | 15 min | None | Parallel |
| **Total** | **~75 min** | **Low** | |

## Next Steps

1. **Execute Phase 1** (safe, non-breaking)
2. **Test validation scripts**:
   ```bash
   npm run env:check  # Should show missing keys
   npm run smoke      # Should check API reachability
   npm run e2e:dry    # Should simulate full pipeline
   ```
3. **Fill .env** with actual credentials
4. **Implement canva-render service** (actual Express server)
5. **Build Make.com scenario** (webhook → services)

## Questions?

- **Q: Will this break existing Neuro.Pilot.AI services?**
  - A: No. All changes are isolated to `/Group7/` and new `/scripts/`, `/tests/` folders.

- **Q: Can I use npm instead of pnpm?**
  - A: Yes, but pnpm workspaces are more efficient for monorepos. Convert package.json if needed.

- **Q: What if I don't have pnpm?**
  - A: Install with `npm install -g pnpm` or convert to npm workspaces.

- **Q: Can I deploy GROUP7 separately?**
  - A: Yes! The monorepo is designed for independent deployment (Railway, Fly.io, etc.).
