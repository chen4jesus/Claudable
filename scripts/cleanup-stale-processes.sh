#!/bin/bash
# Cleanup stale processes for the claude user
# Kills processes running > 30 mins (1800s) with < 10s CPU time (zombies/stale)
# Excludes PIDs listed in /tmp/protected_pids AND all their descendants

PROTECTED_PIDS_FILE="/tmp/protected_pids"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

# Function to get all descendant PIDs of a given PID
get_descendants() {
    local parent=$1
    local children=$(ps -o pid --ppid "$parent" --no-headers 2>/dev/null | tr -d ' ')
    echo "$parent"
    for child in $children; do
        get_descendants "$child"
    done
}

# Build list of all protected PIDs (including descendants)
ALL_PROTECTED=""
if [ -f "$PROTECTED_PIDS_FILE" ]; then
    for pid in $(cat "$PROTECTED_PIDS_FILE"); do
        ALL_PROTECTED="$ALL_PROTECTED $(get_descendants $pid)"
    done
fi
# Convert to pipe-separated for awk
EXCLUDE_PATTERN=$(echo $ALL_PROTECTED | tr ' ' '|' | sed 's/^|//;s/|$//')

echo "$LOG_PREFIX Protected PIDs: $ALL_PROTECTED"

# Get stale processes and filter out protected PIDs and their descendants
STALE_PIDS=$(ps -u claude -o pid,etimes,cputime --no-headers 2>/dev/null | \
    awk -v exclude="$EXCLUDE_PATTERN" '
        BEGIN { split(exclude, pids, "|") }
        $2 > 1800 && $3 ~ /^00:00:0[0-9]$/ {
            protected = 0
            for (i in pids) { if ($1 == pids[i]) protected = 1 }
            if (!protected) print $1
        }
    ')

if [ -n "$STALE_PIDS" ]; then
    echo "$LOG_PREFIX Killing stale PIDs: $STALE_PIDS"
    echo "$STALE_PIDS" | xargs -r kill 2>/dev/null
else
    echo "$LOG_PREFIX No stale processes found to kill"
fi

exit 0
