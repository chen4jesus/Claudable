# Production Deployment Guide for Claudable

This guide explains how to deploy Claudable in a production environment.

## Prerequisites

- Node.js 20+ installed
- PostgreSQL database (recommended for production) or SQLite (default)
- A process manager like PM2 (optional but recommended)

## 1. Environment Configuration

Create a `.env.production` file in the root directory. You can copy the example below:

```bash
# Database Connection (IMPORTANT: Use PostgreSQL for production)
DATABASE_URL="postgresql://user:password@localhost:5432/claudable_db"

# App URL (The public URL of your app)
NEXT_PUBLIC_APP_URL="https://your-domain.com"
NEXT_PUBLIC_API_BASE="https://your-domain.com"

# API Keys & Secrets
# ... (Add other keys from your .env.local)

# Production Optimization
NODE_ENV="production"
```

## 2. Build the Application

Build the standalone Next.js application:

```bash
npm ci              # Install dependencies (clean install)
npm run build       # Build the application
```

This will create a `.next/standalone` directory optimized for production.

## 3. Database Migration

Ensure your production database schema is up to date:

```bash
# For PostgreSQL (ensure DATABASE_URL is set)
npx prisma migrate deploy
```

## 4. Starting the Server

### Option A: Standard Start

```bash
npm start
```

### Option B: Standalone Mode (Recommended for Docker/Performance)

```bash
# Copy necessary static files/public folder if needed (Next.js automatically handles most)
# Run the standalone server
node .next/standalone/server.js
```

### Option C: Using PM2 (Production Process Manager)

```bash
npm install -g pm2
pm2 start npm --name "claudable" -- start
# OR for standalone
pm2 start .next/standalone/server.js --name "claudable"
```

## 5. Docker Deployment

Since a Dockerfile is not included by default, here is a recommended `Dockerfile` for production:

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "localhost"

CMD ["node", "server.js"]
```

Build and run with Docker:

```bash
docker build -t claudable .
docker run -p 3000:3000 -e DATABASE_URL="postgresql://..." claudable
```
