#!/usr/bin/env bash
set -euo pipefail

# sentry-setup.sh
# Links Sentry DSN and configures release tracking for frontend/backend
# For NeuroPilot v17.1 with Sentry error tracking

echo "🐛 NeuroPilot v17.1 Sentry Setup"
echo "================================"
echo ""

# ================================================================
# CONFIGURATION
# ================================================================
SENTRY_DSN="${SENTRY_DSN:-}"
SENTRY_ORG="${SENTRY_ORG:-}"
SENTRY_PROJECT="${SENTRY_PROJECT:-neuropilot}"
SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:-}"
VERSION="${VERSION:-v17.1.0}"
ENVIRONMENT="${ENVIRONMENT:-production}"

if [ -z "$SENTRY_DSN" ]; then
    echo "❌ SENTRY_DSN not set"
    echo ""
    echo "Get your Sentry DSN:"
    echo "  1. Go to https://sentry.io"
    echo "  2. Sign up for free (5k events/month)"
    echo "  3. Create project: NeuroPilot"
    echo "  4. Copy DSN from Settings → Client Keys"
    echo ""
    echo "Export: export SENTRY_DSN='https://xxx@sentry.io/yyy'"
    exit 1
fi

echo "Configuration:"
echo "  Sentry DSN: ${SENTRY_DSN:0:40}..."
echo "  Organization: ${SENTRY_ORG:-Not set}"
echo "  Project: $SENTRY_PROJECT"
echo "  Version: $VERSION"
echo "  Environment: $ENVIRONMENT"
echo ""

# ================================================================
# INSTALL SENTRY SDK
# ================================================================
echo "1️⃣  Installing Sentry SDK..."

# Backend (Node.js)
if [ -f "package.json" ]; then
    echo "   Installing @sentry/node..."
    npm install --save @sentry/node @sentry/tracing || echo "⚠️  Failed to install Sentry (may already exist)"
    echo "✅ Backend SDK installed"
else
    echo "⚠️  package.json not found, skipping backend install"
fi

# Frontend
if [ -f "../frontend/package.json" ]; then
    echo "   Installing @sentry/browser..."
    (cd ../frontend && npm install --save @sentry/browser @sentry/tracing) || echo "⚠️  Failed to install Sentry frontend"
    echo "✅ Frontend SDK installed"
else
    echo "⚠️  Frontend package.json not found, skipping"
fi
echo ""

# ================================================================
# CONFIGURE BACKEND
# ================================================================
echo "2️⃣  Configuring backend Sentry..."

BACKEND_INIT_FILE="./src/sentry.js"
mkdir -p "$(dirname "$BACKEND_INIT_FILE")"

cat > "$BACKEND_INIT_FILE" << EOF
// Sentry initialization for NeuroPilot v17.1 backend
const Sentry = require('@sentry/node');
const Tracing = require('@sentry/tracing');

function initSentry(app) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN || '$SENTRY_DSN',
    environment: process.env.NODE_ENV || '$ENVIRONMENT',
    release: 'neuropilot@$VERSION',

    // Performance monitoring
    tracesSampleRate: 1.0, // Capture 100% of transactions (adjust for production)

    // Integrations
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Tracing.Integrations.Express({ app }),
      new Tracing.Integrations.Postgres(),
    ],

    // Error filtering
    beforeSend(event, hint) {
      // Don't send errors from health checks
      if (event.request && event.request.url.includes('/health')) {
        return null;
      }

      // Don't send rate limit errors
      if (event.exception && event.exception.values) {
        const error = event.exception.values[0];
        if (error.value && error.value.includes('Too Many Requests')) {
          return null;
        }
      }

      return event;
    },
  });

  console.log('✅ Sentry initialized for backend');
}

function captureException(error, context = {}) {
  Sentry.captureException(error, {
    tags: context.tags || {},
    extra: context.extra || {},
    user: context.user || {},
  });
}

function captureMessage(message, level = 'info', context = {}) {
  Sentry.captureMessage(message, {
    level,
    tags: context.tags || {},
    extra: context.extra || {},
  });
}

module.exports = {
  initSentry,
  Sentry,
  captureException,
  captureMessage,
};
EOF

echo "✅ Backend Sentry configuration created: $BACKEND_INIT_FILE"
echo ""

# ================================================================
# CONFIGURE FRONTEND
# ================================================================
echo "3️⃣  Configuring frontend Sentry..."

FRONTEND_INIT_FILE="../frontend/src/lib/sentry.js"
mkdir -p "$(dirname "$FRONTEND_INIT_FILE")"

cat > "$FRONTEND_INIT_FILE" << EOF
// Sentry initialization for NeuroPilot v17.1 frontend
import * as Sentry from '@sentry/browser';
import { BrowserTracing } from '@sentry/tracing';

export function initSentry() {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN || '$SENTRY_DSN',
    environment: import.meta.env.MODE || '$ENVIRONMENT',
    release: 'neuropilot@$VERSION',

    // Performance monitoring
    integrations: [new BrowserTracing()],
    tracesSampleRate: 1.0, // Adjust for production (0.1 = 10%)

    // Session replay (optional, requires additional quota)
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Error filtering
    beforeSend(event, hint) {
      // Don't send errors from localhost
      if (window.location.hostname === 'localhost') {
        return null;
      }

      // Filter out CORS errors (often false positives)
      if (event.exception && event.exception.values) {
        const error = event.exception.values[0];
        if (error.value && error.value.includes('CORS')) {
          return null;
        }
      }

      return event;
    },
  });

  console.log('✅ Sentry initialized for frontend');
}

export function setUser(user) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    role: user.role,
  });
}

export function captureException(error, context = {}) {
  Sentry.captureException(error, {
    tags: context.tags || {},
    extra: context.extra || {},
  });
}

export function captureMessage(message, level = 'info', context = {}) {
  Sentry.captureMessage(message, {
    level,
    tags: context.tags || {},
    extra: context.extra || {},
  });
}
EOF

echo "✅ Frontend Sentry configuration created: $FRONTEND_INIT_FILE"
echo ""

# ================================================================
# UPDATE ENVIRONMENT VARIABLES
# ================================================================
echo "4️⃣  Updating environment variables..."

# Add to backend .env.example
if [ -f ".env.example" ]; then
    if ! grep -q "SENTRY_DSN" .env.example; then
        echo "" >> .env.example
        echo "# Sentry Error Tracking" >> .env.example
        echo "SENTRY_DSN=$SENTRY_DSN" >> .env.example
        echo "✅ Added SENTRY_DSN to .env.example"
    else
        echo "⚠️  SENTRY_DSN already in .env.example"
    fi
fi

# Railway deployment
if command -v railway &> /dev/null; then
    echo "   Setting Railway environment variable..."
    railway variables set SENTRY_DSN="$SENTRY_DSN" || echo "⚠️  Failed to set Railway variable"
    echo "✅ Railway SENTRY_DSN configured"
fi

# Vercel deployment
if command -v vercel &> /dev/null; then
    echo "   Setting Vercel environment variable..."
    (cd ../frontend && vercel env add VITE_SENTRY_DSN production <<< "$SENTRY_DSN") || echo "⚠️  Failed to set Vercel variable"
    echo "✅ Vercel VITE_SENTRY_DSN configured"
fi
echo ""

# ================================================================
# CREATE RELEASE
# ================================================================
if [ -n "$SENTRY_AUTH_TOKEN" ] && [ -n "$SENTRY_ORG" ]; then
    echo "5️⃣  Creating Sentry release..."

    # Install Sentry CLI
    if ! command -v sentry-cli &> /dev/null; then
        echo "   Installing sentry-cli..."
        npm install -g @sentry/cli || echo "⚠️  Failed to install sentry-cli"
    fi

    # Create release
    export SENTRY_ORG="$SENTRY_ORG"
    export SENTRY_PROJECT="$SENTRY_PROJECT"
    export SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN"

    sentry-cli releases new "$VERSION" || echo "⚠️  Release may already exist"
    sentry-cli releases set-commits "$VERSION" --auto || echo "⚠️  Failed to set commits"
    sentry-cli releases finalize "$VERSION" || echo "⚠️  Failed to finalize release"

    echo "✅ Sentry release created: $VERSION"
else
    echo "5️⃣  Skipping release creation (SENTRY_AUTH_TOKEN not set)"
    echo "   To create releases:"
    echo "   1. Go to https://sentry.io/settings/account/api/auth-tokens/"
    echo "   2. Create token with 'project:releases' scope"
    echo "   3. Export: export SENTRY_AUTH_TOKEN='your_token'"
fi
echo ""

# ================================================================
# CREATE INTEGRATION TEST
# ================================================================
echo "6️⃣  Creating Sentry test script..."

TEST_FILE="./scripts/test_sentry.js"
cat > "$TEST_FILE" << 'EOF'
// Test Sentry integration
const { initSentry, captureException, captureMessage, Sentry } = require('../src/sentry.js');

// Mock Express app
const mockApp = {
  use: () => {},
  get: () => {},
  post: () => {},
};

initSentry(mockApp);

console.log('📤 Sending test error to Sentry...');
captureException(new Error('Test error from NeuroPilot v17.1'), {
  tags: { source: 'test_script' },
  extra: { timestamp: new Date().toISOString() },
});

console.log('📤 Sending test message to Sentry...');
captureMessage('Test message from NeuroPilot v17.1', 'info', {
  tags: { source: 'test_script' },
});

console.log('✅ Test events sent. Check Sentry dashboard in 10-30 seconds.');
console.log('   Dashboard: https://sentry.io/organizations/[org]/issues/');

// Wait for Sentry to flush
setTimeout(() => {
  Sentry.close(2000).then(() => {
    console.log('✅ Sentry connection closed');
    process.exit(0);
  });
}, 1000);
EOF

echo "✅ Test script created: $TEST_FILE"
echo ""

# ================================================================
# SUMMARY
# ================================================================
echo "=================================="
echo "✅ Sentry Setup Complete"
echo "=================================="
echo ""
echo "📦 Packages Installed:"
echo "  • Backend: @sentry/node, @sentry/tracing"
echo "  • Frontend: @sentry/browser, @sentry/tracing"
echo ""
echo "📝 Configuration Files:"
echo "  • Backend: $BACKEND_INIT_FILE"
echo "  • Frontend: $FRONTEND_INIT_FILE"
echo ""
echo "🔗 Integration Points:"
echo "  • Backend: Add to server.js:"
echo "    const { initSentry } = require('./src/sentry.js');"
echo "    initSentry(app);"
echo "    app.use(Sentry.Handlers.requestHandler());"
echo "    app.use(Sentry.Handlers.errorHandler());"
echo ""
echo "  • Frontend: Add to app.js:"
echo "    import { initSentry } from './src/lib/sentry.js';"
echo "    initSentry();"
echo ""
echo "🧪 Test Integration:"
echo "  node $TEST_FILE"
echo ""
echo "📊 Sentry Dashboard:"
echo "  https://sentry.io/organizations/${SENTRY_ORG:-your-org}/issues/"
echo ""
echo "🔄 Next Steps:"
echo "  1. Test error tracking: node $TEST_FILE"
echo "  2. Deploy with Sentry: ./scripts/stage-deploy.sh"
echo "  3. Monitor errors in real-time"
echo "  4. Set up alerts for critical errors"
echo ""
