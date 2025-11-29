FROM node:20-slim

WORKDIR /app

# Copy backend package files
COPY inventory-enterprise/backend/package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy backend source code
COPY inventory-enterprise/backend/ ./

# Copy frontend public files if they exist
COPY inventory-enterprise/frontend/public/ ./public/

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["sh", "-c", "node scripts/init-postgres.js && node server-v21_1.js"]
