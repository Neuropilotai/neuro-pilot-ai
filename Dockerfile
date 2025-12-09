# NeuroPilot Inventory Enterprise V21.1
# Railway-optimized Dockerfile

FROM node:20-slim

# Install curl for healthcheck (minimal addition)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files first (for better layer caching)
COPY inventory-enterprise/backend/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

# Copy backend source code (includes backend/public/ with updated HTML files)
COPY inventory-enterprise/backend/ ./

# Copy frontend static files (merge with backend/public, backend files take precedence)
COPY inventory-enterprise/frontend/public/ ./public/ || true

# Railway provides PORT dynamically (usually 8080), expose for documentation
EXPOSE 8080

# Don't run as root for security
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 appuser \
    && chown -R appuser:nodejs /app
USER appuser

# NOTE: Removed Docker HEALTHCHECK - Railway handles healthchecks via /health endpoint
# Docker HEALTHCHECK can conflict with Railway's platform healthcheck logic

# Start the application
# init-postgres.js runs migrations, then starts server
# If init-postgres fails, server starts anyway (graceful degradation)
CMD ["sh", "-c", "node scripts/init-postgres.js 2>&1 || echo '[INIT] DB init skipped, continuing...'; exec node server-v21_1.js"]
