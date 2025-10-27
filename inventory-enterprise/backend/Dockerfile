# syntax=docker/dockerfile:1.6

# --- Base: pinned digest for reproducibility ---
FROM node:20-alpine@sha256:6178e78b972f79c335df281f4b7674a2d85071aae2af020ffa39f0a770265435 AS base
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps
RUN apk --no-cache upgrade && apk add --no-cache tini
# Create non-root user
RUN addgroup -g 1001 -S appuser && adduser -S -u 1001 -G appuser appuser
WORKDIR /app

# --- Builder: install deps with lockfile, fall back safely if lock missing ---
FROM base AS builder
# Pin npm via corepack for reproducibility
RUN corepack enable && corepack prepare npm@10.7.0 --activate

# Copy manifest & lock (lock is optional but preferred)
COPY package.json ./
# Only copy lockfile if it exists in repo; if not present, the next COPY will be skipped automatically
# (We'll handle both paths in the RUN step)
COPY package-lock.json ./ 2>/dev/null || true

# Use cache for npm to speed up builds
RUN --mount=type=cache,id=npm,target=/root/.npm \
    if [ -f package-lock.json ]; then \
      echo "🔒 Using package-lock.json with npm ci --omit=dev"; \
      npm ci --omit=dev --no-audit --no-fund; \
    else \
      echo "⚠️ No lockfile found. Falling back to npm install --omit=dev (LESS reproducible)."; \
      npm install --omit=dev --no-audit --no-fund; \
    fi && \
    npm cache clean --force

# Copy app source
COPY . .

# Optional: build step (uncomment if you have a compile step)
# RUN npm run build

# --- Runtime: minimal, non-root, read-only, healthcheck ---
FROM base AS runtime
USER appuser
WORKDIR /app

# Copy node_modules and app
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app ./

# Remove any accidentally copied secrets
RUN rm -f .env* *.pem *.key *.crt 2>/dev/null || true

# Expose port (adjust if needed)
EXPOSE 8083

# Healthcheck (adjust path if needed)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8083/api/health || exit 1

# Run with tini as PID 1
ENTRYPOINT ["/sbin/tini","--"]

# Read-only rootfs at runtime (platform policy; keep comment here for ops)
# On some platforms you can add args (Railway may handle runtime flags in service config)
# Example runtime flags (documented in runbook):
#   --read-only --tmpfs /tmp:rw,exec,nosuid,nodev --cap-drop ALL --cap-add NET_BIND_SERVICE

CMD ["node", "server.js"]
