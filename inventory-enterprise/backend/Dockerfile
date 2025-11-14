# syntax=docker/dockerfile:1.4
FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev --no-audit --no-fund

# Copy application code
COPY . .

# Expose port
EXPOSE 8080

# Start the server
CMD ["node", "server-v21_1.js"]
