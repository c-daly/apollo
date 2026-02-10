#!/bin/bash
set -e
echo "=== Apollo Tests ==="
poetry run pytest -ra -q "$@"
