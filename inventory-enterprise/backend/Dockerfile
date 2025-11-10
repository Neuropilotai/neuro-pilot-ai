# syntax=docker/dockerfile:1.7
FROM ghcr.io/railwayapp/nixpacks:ubuntu-1745885067

WORKDIR /app
ENV NODE_ENV=production

# Copy package files for dependency installation
COPY package*.json ./

# Install production dependencies (Railway will handle caching)
RUN npm ci --omit=dev --no-audit --no-fund

# Copy application source
COPY . .

# Start the server
CMD ["node", "server-v21_1.js"]
