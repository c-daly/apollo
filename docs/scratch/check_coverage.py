#!/usr/bin/env python3
"""Check coverage specifically for P0 fix areas"""
import subprocess
import os

os.chdir("/home/fearsidhe/projects/LOGOS/apollo")

# Run pytest with coverage on specific modules
result = subprocess.run([
    ".venv/bin/pytest", 
    "tests/unit/test_p0_fixes.py",
    "--cov=src/apollo/api/server",
    "--cov=src/apollo/data/models", 
    "--cov=src/apollo/data/hcg_client",
    "--cov-report=term-missing",
    "-v"
], capture_output=True, text=True, env={**os.environ, "PYTHONPATH": "src"})

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)
