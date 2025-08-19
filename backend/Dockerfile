FROM node:18-alpine
WORKDIR /app
COPY backend/package.json ./package.json
RUN npm install --only=production
COPY backend/server.js ./server.js
COPY .env /app/.env
EXPOSE 3001
CMD ["npm","start"]
