#!/bin/bash
set -e

# Ensure environment variables and directories (like prisma/data) exist
npm run ensure:env

# Run prisma db push to ensure schema matches
npx prisma db push

# Execute the main command
exec "$@"
