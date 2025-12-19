FROM ubuntu:22.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# 1. cd /var/local
WORKDIR /var/local/Claudable

# --- System Dependencies Layer (Cached) ---
# 2. sudo apt update
# 3. sudo apt upgrade
# 5. curl ... nodejs setup
# 7. sudo apt install -y nodejs
# 8. sudo apt install -y python3 ...
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y curl git sudo build-essential && \
    curl -fsSL https://deb.nodesource.com/setup_current.x | bash - && \
    apt-get install -y nodejs && \
    apt-get install -y python3 python3-pip python3-venv python-is-python3 && \
    rm -rf /var/lib/apt/lists/*

# --- Application Dependencies Layer (Cached) ---
# Copy only package files and prisma schema first to cache npm install
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# 11. npm install
RUN npm install

# 12. npx prisma generate
RUN npx prisma generate

# --- Application Source Layer (Changed frequently) ---
# 4. git clone ... (Replaced with COPY . .)
COPY . .

# 14. npm run build
RUN npm run build

# 15. npm install -g @anthropic-ai/claude-code
RUN npm install -g @anthropic-ai/claude-code

# 16. sudo useradd -m claude
# 17. sudo passwd claude
RUN useradd -m claude && \
    echo "claude:claude" | chpasswd && \
    usermod -aG sudo claude

# 18. sudo chown -R claude:claude /var/local/Claudable
RUN chown -R claude:claude /var/local/Claudable

# Setup Entrypoint
# (We copy it again or ensure it stands correct, though COPY . . handles it)
# We make sure it is executable
RUN cp scripts/docker-entrypoint.sh /usr/local/bin/ && \
    sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-entrypoint.sh

# 19. su - claude
USER claude

# Expose the application port
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]

# 20. npm start
CMD ["npm", "start"]
