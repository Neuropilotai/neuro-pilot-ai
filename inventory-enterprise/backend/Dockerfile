# Multi-stage build for optimized production image
# Stage 1: Build dependencies
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Production image
FROM node:20-alpine

# Install security updates
RUN apk --no-cache upgrade && \
    apk add --no-cache tini && \
    addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY --chown=appuser:appuser . .

# Create necessary directories with proper permissions
RUN mkdir -p data logs backups locales && \
    chown -R appuser:appuser data logs backups locales

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8083

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8083/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["node", "server.js"]
