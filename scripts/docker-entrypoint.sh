#!/bin/bash
set -e

# If running as root, fix permissions and drop privileges
if [ "$(id -u)" = '0' ]; then
    echo "Updating permissions for /var/local/Claudable/data"
    chown -R claude:claude /var/local/Claudable/data
    
    # Also fix prisma data if ignoring errors (in case volume wasn't mounted or is empty)
    # The shell script 'setup-env.js' will create dirs later, but if volume exists, we need rights.
    if [ -d "/var/local/Claudable/prisma" ]; then
        chown -R claude:claude /var/local/Claudable/prisma
    fi
    
    # Restart script as user claude
    exec gosu claude "$0" "$@"
fi

# --- Now running as user: claude ---

# Ensure environment variables and directories (like prisma/data) exist
npm run ensure:env

# Run prisma db push to ensure schema matches
# Override DATABASE_URL to absolute path to ensure we init the file at root/data (where App looks)
# and not prisma/data (where CLI looks by default relative to schema)
DATABASE_URL="file:/var/local/Claudable/data/cc.db" npx prisma db push

# Execute the main command
exec "$@"
