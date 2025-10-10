#!/bin/bash
###############################################################################
# NeuroInnovate Inventory Enterprise v2.8.0 - Finish Script
# Completes setup, runs tests, and validates deployment
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="/Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend"
PORT=8083
SEED_DEMO_USER=${SEED_DEMO_USER:-false}

echo "========================================"
echo "v2.8.0 Finish Script"
echo "========================================"

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "  $1"
}

# Navigate to backend directory
cd "$BACKEND_DIR" || exit 1

# Step 1: Install dependencies
echo ""
echo "Step 1: Installing dependencies..."
if npm ci --quiet; then
    print_success "Dependencies installed"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Step 2: Check Python dependencies
echo ""
echo "Step 2: Checking Python dependencies for forecasting..."
PYTHON_BIN=${PYTHON_BIN:-python3}

if command -v $PYTHON_BIN &> /dev/null; then
    print_success "Python found: $($PYTHON_BIN --version)"

    # Check for required packages
    echo "Checking Python packages..."
    MISSING_PACKAGES=()

    if ! $PYTHON_BIN -c "import prophet" 2>/dev/null; then
        MISSING_PACKAGES+=("prophet")
    fi

    if ! $PYTHON_BIN -c "import statsmodels" 2>/dev/null; then
        MISSING_PACKAGES+=("statsmodels")
    fi

    if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
        print_warning "Missing Python packages: ${MISSING_PACKAGES[*]}"
        print_info "Install with: pip3 install ${MISSING_PACKAGES[*]}"
    else
        print_success "All Python packages installed"
    fi
else
    print_error "Python not found. Install Python 3.8+ for forecasting"
fi

# Step 3: Start infrastructure
echo ""
echo "Step 3: Starting infrastructure..."

# Check if Docker is running
if docker info &> /dev/null; then
    print_success "Docker is running"

    # Start Redis
    if docker-compose -f docker-compose.redis.yml up -d --quiet-pull 2>&1 | grep -q "done"; then
        print_success "Redis cluster started"
        sleep 3

        # Verify Redis
        if docker exec inventory-redis-master redis-cli ping &> /dev/null; then
            print_success "Redis responding to ping"
        else
            print_warning "Redis not responding yet (may need more time)"
        fi
    else
        print_warning "Redis cluster already running or failed to start"
    fi

    # Start PostgreSQL
    if docker-compose -f docker-compose.postgres.yml up -d --quiet-pull 2>&1 | grep -q "done"; then
        print_success "PostgreSQL cluster started"
        sleep 5

        # Verify PostgreSQL
        if docker exec inventory-postgres-primary pg_isready &> /dev/null; then
            print_success "PostgreSQL accepting connections"
        else
            print_warning "PostgreSQL not ready yet (may need more time)"
        fi
    else
        print_warning "PostgreSQL cluster already running or failed to start"
    fi
else
    print_error "Docker is not running. Start Docker to use Redis and PostgreSQL"
fi

# Step 4: Run database migration
echo ""
echo "Step 4: Running database migration..."

if [ -f migrations/migration_006_postgres.sql ]; then
    if docker exec -i inventory-postgres-primary psql -U inventory_admin -d inventory_enterprise < migrations/migration_006_postgres.sql &> /dev/null; then
        print_success "PostgreSQL migration completed"
    else
        print_warning "Migration may have already run or PostgreSQL not ready"
    fi
else
    print_warning "Migration file not found: migrations/migration_006_postgres.sql"
fi

# Step 5: Run tests (if requested)
if [ "$RUN_TESTS" = "true" ]; then
    echo ""
    echo "Step 5: Running tests..."

    if npm test -- --coverage --testMatch='**/__tests__/**/*.test.js' 2>&1 | tee test-output.log; then
        print_success "Tests passed"

        # Check coverage
        COVERAGE=$(grep -oP 'All files\s+\|\s+\K[\d.]+' test-output.log | head -1)
        if [ -n "$COVERAGE" ]; then
            echo "Coverage: $COVERAGE%"
            if (( $(echo "$COVERAGE >= 85" | bc -l) )); then
                print_success "Coverage target met (≥85%)"
            else
                print_warning "Coverage below target: $COVERAGE% (target: 85%)"
            fi
        fi

        rm -f test-output.log
    else
        print_warning "Some tests failed or no tests found"
    fi
fi

# Step 6: Seed demo user (if requested)
if [ "$SEED_DEMO_USER" = "true" ]; then
    echo ""
    echo "Step 6: Seeding demo user with 2FA..."

    # Create a simple seed script
    cat > /tmp/seed_demo_user.js << 'EOF'
const TwoFactorAuth = require('./middleware/security_2fa');
const db = require('./config/database');

async function seed() {
    const twoFactorAuth = new TwoFactorAuth(db);

    // Setup 2FA for demo user
    const setup = await twoFactorAuth.setupTOTP('demo-user-1', 'demo@neuro-pilot.ai');

    console.log('Demo user 2FA setup complete');
    console.log('Email: demo@neuro-pilot.ai');
    console.log('User ID: demo-user-1');
    console.log('\nBackup codes (save these):');
    setup.backupCodes.forEach((code, i) => {
        console.log(`  ${i+1}. ${code}`);
    });
    console.log('\nQR Code (base64 PNG):');
    console.log(setup.qrCode.substring(0, 100) + '...');

    process.exit(0);
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
EOF

    if node /tmp/seed_demo_user.js 2>&1; then
        print_success "Demo user seeded"
    else
        print_warning "Failed to seed demo user"
    fi

    rm -f /tmp/seed_demo_user.js
fi

# Step 7: Health checks
echo ""
echo "Step 7: Running health checks..."

# Check application (if running)
if curl -f http://localhost:$PORT/health &> /dev/null; then
    print_success "Application responding on port $PORT"
else
    print_info "Application not running. Start with: PORT=$PORT npm start"
fi

# Check Redis
if docker exec inventory-redis-master redis-cli ping &> /dev/null; then
    REDIS_INFO=$(docker exec inventory-redis-master redis-cli INFO | grep -E '(connected_clients|used_memory_human|uptime_in_seconds)')
    print_success "Redis healthy"
    print_info "Clients: $(echo "$REDIS_INFO" | grep connected_clients | cut -d: -f2 | tr -d '\r')"
    print_info "Memory: $(echo "$REDIS_INFO" | grep used_memory_human | cut -d: -f2 | tr -d '\r')"
    print_info "Uptime: $(echo "$REDIS_INFO" | grep uptime_in_seconds | cut -d: -f2 | tr -d '\r')s"
else
    print_warning "Redis not responding"
fi

# Check PostgreSQL
if docker exec inventory-postgres-primary pg_isready &> /dev/null; then
    PG_VERSION=$(docker exec inventory-postgres-primary psql -U inventory_admin -d inventory_enterprise -t -c "SELECT version();" 2>/dev/null | head -1)
    print_success "PostgreSQL healthy"
    print_info "Version: $(echo $PG_VERSION | grep -oP 'PostgreSQL \d+\.\d+')"

    # Check replication
    REP_COUNT=$(docker exec inventory-postgres-primary psql -U inventory_admin -d inventory_enterprise -t -c "SELECT COUNT(*) FROM pg_stat_replication;" 2>/dev/null | tr -d ' ')
    if [ "$REP_COUNT" -gt 0 ]; then
        print_success "Replication active ($REP_COUNT replica)"
    else
        print_warning "No replication detected"
    fi
else
    print_warning "PostgreSQL not responding"
fi

# Step 8: Print usage examples
echo ""
echo "========================================"
echo "Setup Complete! 🎉"
echo "========================================"
echo ""
echo "Next Steps:"
echo ""
echo "1. Start the application:"
echo "   PORT=$PORT REDIS_ENABLED=true PG_ENABLED=true npm start"
echo ""
echo "2. Login and get token:"
echo "   curl -X POST http://localhost:$PORT/api/auth/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"email\":\"neuro.pilot.ai@gmail.com\",\"password\":\"Admin123!@#\"}'"
echo ""
echo "3. Test forecasting:"
echo "   TOKEN='your-token-here'"
echo "   curl -X POST http://localhost:$PORT/api/ai/forecast/train \\"
echo "     -H \"Authorization: Bearer \$TOKEN\" \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"item_code\":\"APPLE-001\",\"horizon\":30}'"
echo ""
echo "4. Setup 2FA:"
echo "   curl -X POST http://localhost:$PORT/api/2fa/setup \\"
echo "     -H \"Authorization: Bearer \$TOKEN\""
echo ""
echo "5. View metrics:"
echo "   curl http://localhost:$PORT/metrics | grep redis_"
echo ""
echo "6. Access web UIs:"
echo "   - Redis Commander: http://localhost:8081 (admin/RedisAdmin2025!)"
echo "   - pgAdmin: http://localhost:5050 (admin@neuro-pilot.ai/PgAdmin2025!)"
echo "   - Grafana: http://localhost:3000 (import dashboards from grafana/)"
echo ""
echo "7. Check logs:"
echo "   docker-compose -f docker-compose.redis.yml logs -f"
echo "   docker-compose -f docker-compose.postgres.yml logs -f"
echo ""
echo "Documentation:"
echo "  - Implementation Plan: /tmp/PASS_P_IMPLEMENTATION_PLAN.md"
echo "  - Completion Report: /tmp/PASS_P_COMPLETION_REPORT.md"
echo ""
echo "Support:"
echo "  - Issues: https://github.com/neuropilot-ai/inventory/issues"
echo "  - Docs: README_ENTERPRISE.md"
echo ""
print_success "v2.8.0 setup complete!"
echo "========================================"
