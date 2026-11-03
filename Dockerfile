# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app
ARG APP_VERSION=dev
ENV NAV_APP_VERSION=$APP_VERSION
ENV NAV_DEPLOYMENT=docker

COPY backend/package*.json ./
RUN npm install --production

COPY backend/ ./

# Create data directory (actual data provided via volume mount)
RUN mkdir -p /app/data/uploads

# Copy frontend build output to backend/public
COPY --from=frontend-build /app/frontend/dist ./public

# Data volume for persistence
VOLUME /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "server.js"]
