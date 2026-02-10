#!/bin/bash
set -euo pipefail
echo "=== Apollo Lint ==="
poetry run ruff check .
poetry run black --check .
