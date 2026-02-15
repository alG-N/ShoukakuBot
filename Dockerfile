# Build stage
FROM node:20-alpine AS builder

# Install build tools for native modules (@discordjs/opus requires C++ toolchain)
RUN apk add --no-cache python3 make gcc g++ libc-dev

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

# Prune devDependencies from builder (keeps compiled native modules intact)
RUN npm prune --omit=dev

# Production stage
FROM node:20-alpine

# Install runtime dependencies only (ffmpeg for video, no build tools needed)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files (for metadata only, no install needed)
COPY package*.json ./

# Copy pre-built node_modules from builder (includes compiled native modules)
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S shoukaku -u 1001 -G nodejs

# Create logs and temp directories
RUN mkdir -p /app/logs /app/dist/services/video/temp && \
    chown -R shoukaku:nodejs /app/logs /app/dist/services/video/temp

# Switch to non-root user
USER shoukaku

# Health check â€” uses the actual /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Expose health check port
EXPOSE 3000

# Start the bot
CMD ["node", "dist/index.js"]
