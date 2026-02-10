#!/bin/bash
set -euo pipefail
echo "=== Apollo Tests ==="
poetry run pytest -ra -q "$@"
