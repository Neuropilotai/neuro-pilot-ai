# syntax=docker/dockerfile:1.7
FROM ghcr.io/railwayapp/nixpacks:ubuntu-1745885067

WORKDIR /app

# Copy only manifests first for better cache reuse
COPY package*.json ./

# Use npm cache directory (safe) — DO NOT mount into node_modules
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# Bring in the rest of the source
COPY . .

# Start the server
CMD ["node", "server-v21_1.js"]
