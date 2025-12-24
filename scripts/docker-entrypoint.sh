#!/bin/bash
set -e

# Claude Code Configuration Constants
CLAUDE_CONFIG_DIR="$HOME/.claude"
CLAUDE_JSON_FILE="$HOME/.claude.json"
API_BASE_URL="https://api.z.ai/api/anthropic"
API_TIMEOUT_MS=3000000

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

# Configure Claude Code if API key is provided
if [ -n "${CLAUDE_API_KEY:-}" ]; then
    echo "🔑 Configuring Claude Code with provided API key..."
    
    # Create config directory if it doesn't exist
    mkdir -p "$CLAUDE_CONFIG_DIR"
    
    # Write settings.json with API configuration
    node --eval "
        const fs = require('fs');
        const path = require('path');
        
        const configDir = '$CLAUDE_CONFIG_DIR';
        const settingsPath = path.join(configDir, 'settings.json');
        
        const settings = fs.existsSync(settingsPath)
            ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
            : {};
        
        const updatedSettings = {
            ...settings,
            env: {
                ANTHROPIC_AUTH_TOKEN: '$CLAUDE_API_KEY',
                ANTHROPIC_BASE_URL: '$API_BASE_URL',
                API_TIMEOUT_MS: '$API_TIMEOUT_MS',
                CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1
            }
        };
        
        fs.writeFileSync(settingsPath, JSON.stringify(updatedSettings, null, 2), 'utf-8');
    "
    
    # Write .claude.json to skip onboarding
    node --eval "
        const fs = require('fs');
        const filePath = '$CLAUDE_JSON_FILE';
        
        const content = fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, 'utf-8'))
            : {};
        
        fs.writeFileSync(filePath, JSON.stringify({ ...content, hasCompletedOnboarding: true }, null, 2), 'utf-8');
    "
    
    echo "✅ Claude Code configured successfully"
else
    echo "ℹ️  No CLAUDE_API_KEY environment variable set. Skipping Claude Code configuration."
fi

# Ensure environment variables and directories (like prisma/data) exist
npm run ensure:env

# Run prisma db push to ensure schema matches
npx prisma db push

echo "👤 Seeding default admin user..."
node scripts/seed-admin.js

# Execute the main command
exec "$@"

