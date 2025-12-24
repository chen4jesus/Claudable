#!/bin/bash
# Cleanup stale processes for the claude user
# Kills processes running > 30 mins (1800s) with < 10s CPU time (zombies/stale)
# Excludes PIDs listed in /tmp/protected_pids (set by docker-entrypoint.sh)

PROTECTED_PIDS_FILE="/tmp/protected_pids"

# Build exclusion pattern from protected PIDs file
EXCLUDE_PIDS=""
if [ -f "$PROTECTED_PIDS_FILE" ]; then
    EXCLUDE_PIDS=$(cat "$PROTECTED_PIDS_FILE" | tr '\n' '|' | sed 's/|$//')
fi

# Get stale processes and filter out protected PIDs
ps -u claude -o pid,etimes,cputime --no-headers 2>/dev/null | \
    awk -v exclude="$EXCLUDE_PIDS" '
        BEGIN { split(exclude, pids, "|") }
        $2 > 1800 && $3 ~ /^00:00:0[0-9]$/ {
            protected = 0
            for (i in pids) { if ($1 == pids[i]) protected = 1 }
            if (!protected) print $1
        }
    ' | xargs -r kill 2>/dev/null

exit 0
