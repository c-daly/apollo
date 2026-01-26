#!/bin/bash
set -e
echo "=== Apollo Local Development Setup ==="

# Check Node.js prerequisite
if ! command -v node &> /dev/null; then
    echo "Warning: Node.js not found. Web dashboard requires Node.js 18+"
fi

poetry install --with dev

poetry run python -c "from logos_config.ports import get_repo_ports; print(f'Apollo ports: {get_repo_ports(\"apollo\")}')"
echo "Setup complete. Run './scripts/run_tests.sh' to verify."
