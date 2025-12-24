#!/bin/bash
# Cleanup stale processes for the claude user
# Kills processes running > 30 mins (1800s) with < 10s CPU time (zombies/stale)

ps -u claude -o pid,etimes,cputime --no-headers 2>/dev/null | \
    awk '$2 > 1800 && $3 ~ /^00:00:0[0-9]$/ {print $1}' | \
    xargs -r kill 2>/dev/null

exit 0
