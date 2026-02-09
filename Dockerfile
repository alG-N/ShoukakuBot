# Build stage
FROM node:20-alpine AS builder

# Install python3 for yt-dlp-exec postinstall
RUN apk add --no-cache python3

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for TypeScript compilation)
RUN npm ci

# Copy source code
COPY src ./src

# Compile TypeScript to JavaScript
RUN npx tsc

# Production stage
FROM node:20-alpine

# Install ffmpeg for mobile video processing (yt-dlp is in separate API container)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S altergolden -u 1001 -G nodejs

# Create logs and temp directories
RUN mkdir -p /app/logs /app/dist/services/video/temp && \
    chown -R altergolden:nodejs /app/logs /app/dist/services/video/temp

# Switch to non-root user
USER altergolden

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Expose health check port
EXPOSE 3000

# Start the bot
CMD ["node", "dist/index.js"]
