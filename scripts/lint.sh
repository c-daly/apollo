#!/bin/bash
set -e
echo "=== Apollo Lint ==="
ruff check .
black --check .
