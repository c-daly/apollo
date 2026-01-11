#!/usr/bin/env python3
"""Batch git operations for P0 fixes commit"""
import subprocess
import os

os.chdir("/home/fearsidhe/projects/LOGOS/apollo")

# Add files
files = [
    "src/apollo/api/server.py",
    "src/apollo/data/hcg_client.py", 
    "src/apollo/data/models.py",
    "tests/unit/conftest.py",
    "tests/unit/test_p0_fixes.py"
]

subprocess.run(["git", "add"] + files, check=True)
print(f"Added {len(files)} files")

# Commit
commit_msg = """fix: P0 critical fixes from code review

- P0.1: Wrap all blocking Neo4j calls in asyncio.to_thread()
- P0.2: Add HTTP connection pooling via shared httpx.AsyncClient
- P0.3: Add UTC timezone enforcement validators to all Pydantic models
- P0.4: WebSocket broadcast lock contention fix (copy-under-lock pattern)
- P0.5: Add validate_entity_id() for Cypher injection prevention
- Fix datetime.utcnow() deprecation warnings
- Add comprehensive test suite for all P0 fixes (26 tests)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"""

result = subprocess.run(["git", "commit", "-m", commit_msg], capture_output=True, text=True)
print(result.stdout)
if result.returncode != 0:
    print(f"Error: {result.stderr}")
else:
    print("Commit successful!")

# Show log
result = subprocess.run(["git", "log", "-1", "--oneline"], capture_output=True, text=True)
print(f"Latest commit: {result.stdout.strip()}")
