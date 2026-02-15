#!/bin/bash
set -euo pipefail
echo "=== Apollo Dev Services ==="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Delegate to the full-stack launcher
if [ -f "$SCRIPT_DIR/run_apollo.sh" ]; then
    exec "$SCRIPT_DIR/run_apollo.sh" "$@"
else
    echo "run_apollo.sh not found. Install dependencies and run manually."
    exit 1
fi
