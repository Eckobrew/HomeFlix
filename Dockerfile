# Multi-stage Dockerfile for HomeFlix (Next.js Standalone)
# Optimized for Proxmox LXC Containers and lightweight deployments

FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm_config_cache=/tmp/.npm-cache npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm_config_cache=/tmp/.npm-cache npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install runtime utilities for media inspection, live transcoding & hardware acceleration
RUN apk add --no-cache \
    ffmpeg \
    libva-intel-driver \
    intel-media-driver \
    libva-utils

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
ENV DATA_DIR="/app/data"

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/config || exit 1

CMD ["node", "server.js"]
