FROM ubuntu:22.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Environment Variables:
#   CLAUDE_API_KEY - Z.AI API key for Claude Code (passed via docker run -e)
#   Example: docker run -e CLAUDE_API_KEY="your-key" -p 3000:3000 claudable


# 1. cd /var/local
WORKDIR /var/local/Claudable

# --- System Dependencies Layer (Cached) ---
# 2. sudo apt update
# 3. sudo apt upgrade
# 4. curl ... nodejs setup 
# 5. sudo apt install -y nodejs
# 6. sudo apt install -y python3 ...
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y curl git sudo build-essential && \
    curl -fsSL https://deb.nodesource.com/setup_current.x | bash - && \
    apt-get install -y nodejs && \
    apt-get install -y python3 python3-pip python3-venv python-is-python3 gosu && \
    rm -rf /var/lib/apt/lists/*

# --- Application Dependencies Layer (Cached) ---
# Copy only package files and prisma schema first to cache npm install
COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY scripts ./scripts/

# 7. npm install
RUN npm install
# Explicitly ensure prisma 6.1.0 as requested
RUN npm install prisma@6.1.0 --save-dev --save-exact

# 8. npx prisma generate
RUN npx prisma generate

# --- Application Source Layer (Changed frequently) ---
# git clone ... (Replaced with COPY . .)
COPY . .

# 9. npm run build
RUN npm run build

# Add default root user during build (using image's local data directory)
RUN DATABASE_URL="file:/var/local/Claudable/data/cc.db" npx prisma db push && \
    DATABASE_URL="file:/var/local/Claudable/data/cc.db" node scripts/seed-admin.js

# 10. npm install -g @anthropic-ai/claude-code
RUN npm install -g @anthropic-ai/claude-code

# 11. sudo useradd -m claude
# 12. sudo passwd claude
# Give claude near-root permissions for system tasks within the container
RUN useradd -m claude && \
    echo "claude:claude" | chpasswd && \
    # Add claude to sudo and root groups for elevated access
    usermod -aG sudo,root claude && \
    # Grant passwordless sudo for ALL commands (near-root permissions)
    echo "claude ALL=(ALL:ALL) NOPASSWD: ALL" > /etc/sudoers.d/claude && \
    chmod 0440 /etc/sudoers.d/claude

# 13. sudo chown -R claude:claude /var/local/Claudable
# Also give claude ownership of common system task directories
RUN chown -R claude:claude /var/local/Claudable && \
    # Give claude write access to /tmp and /var/tmp for temp operations
    chmod 1777 /tmp /var/tmp && \
    # Create a work directory claude fully owns for system tasks
    mkdir -p /home/claude/work && \
    chown -R claude:claude /home/claude

# 14. Setup Entrypoint
# (We copy it again or ensure it stands correct, though COPY . . handles it)
# We make sure it is executable
RUN cp scripts/docker-entrypoint.sh /usr/local/bin/ && \
    sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose data volume for persistence
VOLUME ["/var/local/Claudable/prisma/data"]
VOLUME ["/var/local/Claudable/data"]

# ============================================================
# ROOT SETUP COMPLETE - SWITCHING TO CLAUDE USER
# ============================================================
# All system installations and configuration done as root above.
# Claude will be the ultimate user who performs tasks in the container.
# Note: Entrypoint starts as root to fix volume permissions, then drops to claude.
# ============================================================

# Expose the application port range (Web + Preview ports)
EXPOSE 3000-4000

# Set working directory for claude user
WORKDIR /var/local/Claudable

ENV HOSTNAME "0.0.0.0"

ENTRYPOINT ["docker-entrypoint.sh"]

# 15. npm start (runs as claude via entrypoint gosu)
CMD ["npm", "start"]
