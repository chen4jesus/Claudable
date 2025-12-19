#!/bin/bash
set -e

# Run prisma db push to ensure schema matches
npx prisma db push

# Execute the main command
exec "$@"
