# File: Dockerfile (secure, multi-stage)
# NOTE: Replace pinned digests periodically as part of maintenance.

########################
# 0. Build stage
########################
FROM node:20-alpine@sha256:6178e78b972f79c335df281f4b7674a2d85071aae2af020ffa39f0a770265435 AS builder

ENV NODE_ENV=production
WORKDIR /app

# Install system packages needed for build (minimal)
RUN apk --no-cache add --virtual .build-deps \
      python3 make g++ \
  && addgroup -g 1001 -S appuser \
  && adduser -S -u 1001 -G appuser appuser

# Copy only manifests for cached dependency install
COPY package.json package-lock.json* ./

# Use npm ci for reproducible builds (requires package-lock.json)
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --no-audit --no-fund; \
    else \
      echo "WARNING: package-lock.json missing — falling back to npm install" && \
      npm install --omit=dev --no-audit --no-fund; \
    fi \
    && npm cache clean --force

# Copy source and build (if your project needs a build step)
COPY . .

# If you have a build step (e.g. bundling web assets), run it here:
# RUN npm run build

########################
# 1. Final runtime stage
########################
FROM node:20-alpine@sha256:6178e78b972f79c335df281f4b7674a2d85071aae2af020ffa39f0a770265435 AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Add tini for proper PID 1 handling
RUN apk --no-cache add tini && \
    addgroup -g 1001 -S appuser && adduser -S -u 1001 -G appuser appuser

# Copy only runtime artifacts from builder
COPY --from=builder --chown=appuser:appuser /app /app

# Ensure no secrets accidentally present
RUN rm -f /app/.env /app/*.pem /app/*.key || true

# Use non-root user
USER appuser

# Security: Run app in a directory with limited permissions (already set by COPY --chown)
# Recommend container run with read-only filesystem and dropped capabilities (see runtime flags below)

# Expose port (change to your port)
EXPOSE 8083

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8083/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Use tini and start the server
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
