# Use official Node.js LTS image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY backend/package*.json ./
RUN npm install

# Copy backend code
COPY backend/ .

# Expose port
EXPOSE 3001

# Run server
CMD ["npm", "start"]
