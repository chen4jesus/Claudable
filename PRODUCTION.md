# Production Deployment Guide

This guide explains how to deploy Claudable using Docker Compose, which is the recommended method for production.

## Architecture

- **Caddy (Port 80)**: Reverse proxy and entry point. Automatically routes traffic.
- **Claudable App (Port 3000)**: The main Next.js application.
- **Internal Proxy**: The app acts as an internal router for preview subdomains (e.g., `project-id.localhost`), forwarding them to dynamic internal ports.

## Prerequisites

- Docker installed
- Docker Compose installed

## Deployment Steps

### 1. Configuration

Ensure you have a `.env` or `.env.local` file with your secrets.
Crucially, you must set `NEXT_PUBLIC_APP_URL` to the public URL of your Caddy instance (port 80).

**Example `.env`:**

```bash
# Security
JWT_SECRET="<generated-secret>"
ENCRYPTION_KEY="<generated-key>"

# Database
DATABASE_URL="file:./data/cc.db"

# Public URL (Points to Caddy)
# For local production simulation:
NEXT_PUBLIC_APP_URL="http://localhost"
# For real domain:
# NEXT_PUBLIC_APP_URL="http://your-domain.com"
```

### 2. Build and Run

Run the following command to build the image and start the services:

```bash
docker-compose up -d --build
```

### 3. Verification

- **Main App**: Visit `http://localhost` (or your domain).
- **Previews**: Create a project and start it. It will be accessible at `http://{project-id}.localhost`.

## Data Persistence

The `docker-compose.yml` mounts the following volumes to persist data:

- `./data`: SQLite database and configuration.
- `./data/projects`: User project files.
- `./prisma/data`: Prisma-related data.

## Troubleshooting

- **Ports**: Ensure port `80` is free on your host machine.
- **Logs**: Check logs with `docker-compose logs -f`.
