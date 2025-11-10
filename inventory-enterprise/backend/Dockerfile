# syntax=docker/dockerfile:1.7
FROM ghcr.io/railwayapp/nixpacks:ubuntu-1745885067

WORKDIR /app
ENV NODE_ENV=production
ENV NPM_CONFIG_CACHE=/root/.npm

# Copy manifests first for better layer caching
COPY package*.json ./

# Use BuildKit cache with Railway service-prefixed ID format
# Railway requires: id=s/<service-id>-<cache-name>
RUN --mount=type=cache,id=s/c4523800-800b-4200-9f84-90c142fd0168-npm,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# Bring in the rest of the source
COPY . .

# Start the server
CMD ["node", "server-v21_1.js"]
