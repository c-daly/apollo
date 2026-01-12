# Environment Debugging Session - 2026-01-10

## Context
After reinstalling conda, the LOGOS development environment broke. This document captures all issues encountered and fixes applied, along with recommendations for permanent solutions.

---

## Issues and Fixes

### 1. Stale Poetry Virtual Environments

**Symptom:** Services failed to start with import errors.

**Root Cause:** `.venv` directories in repos were created with Python 3.13 (base miniconda) but the LOGOS conda env uses Python 3.12. After conda reinstall, poetry was confused about what was installed.

**Fix Applied:**
- Deleted stale `.venv` directories
- Poetry now uses conda env directly (`poetry env info --path` shows conda env)

**Permanent Solution Needed:**
- Document that after conda reinstall, `.venv` directories should be deleted
- Consider adding a `make clean-venvs` target or pre-flight check in `run_apollo.sh`

---

### 2. Missing neo4j Package

**Symptom:**
```
ModuleNotFoundError: No module named 'neo4j'
```
From `logos_test_utils` import.

**Root Cause:** `poetry install --sync` removes packages not in the project's direct dependencies. `neo4j` is a transitive dependency via `logos_test_utils` but hermes doesn't list it directly.

**Fix Applied:**
```bash
/home/fearsidhe/miniconda3/envs/LOGOS/bin/pip install neo4j
```

**Permanent Solution Needed:**
- Add `neo4j` as explicit dependency in hermes `pyproject.toml`, OR
- Make `logos_test_utils` lazy-import neo4j (don't import at module top-level), OR
- Document this in setup instructions

---

### 3. NEO4J_PASSWORD Not Loaded

**Symptom:**
```
pydantic_core._pydantic_core.ValidationError: 1 validation error for Neo4jConfig
password
  Field required [type=missing, input_value={}, input_type=dict]
```

**Root Cause:** `sophia/api/app.py` uses `Neo4jConfig()` from `logos_config` (pydantic-settings), which reads from OS env vars. But sophia's `.env` file wasn't being loaded.

**Fix Applied:**
Added to `sophia/src/sophia/api/app.py`:
```python
from dotenv import load_dotenv
load_dotenv()
```

**Permanent Solution Needed:**
- Standardize `.env` loading across all repos (issue #433 tracks this)
- Consider using `sophia.env.get_neo4j_config()` which has defaults built in
- Document the env loading pattern

---

### 4. Webapp Missing .env File

**Symptom:** Webapp couldn't connect to sophia/hermes.

**Root Cause:** `webapp/.env` didn't exist, only `.env.example`.

**Fix Applied:**
- Copied `.env.example` to `.env`
- Set API tokens: `VITE_SOPHIA_API_KEY=sophia_dev`, `VITE_HERMES_API_KEY=test-token-12345`

**Permanent Solution Needed:**
- Add webapp `.env` generation to `render_test_stacks.py` or `run_apollo.sh`
- Or document that developers need to create it

---

### 5. Stale Processes on Ports

**Symptom:**
```
ERROR: [Errno 98] error while attempting to bind on address ('0.0.0.0', 47000): address already in use
```

**Root Cause:** Old service processes weren't killed before starting new ones. Multiple `run_apollo.sh` instances accumulated.

**Fix Applied:**
```bash
pkill -f "run_apollo.sh"
pkill -f "hermes.main"
pkill -f "sophia.api.app"
```

**Permanent Solution Needed:**
- Improve `run_apollo.sh` to kill existing processes before starting
- Add PID file management (partially exists but wasn't working)
- Add `run_apollo.sh stop` command

---

### 6. anyio ExceptionGroup Import Error

**Symptom:**
```
ImportError: cannot import name 'ExceptionGroup' from 'anyio._core._exceptions'
```

**Root Cause:** Package version mismatch after various pip installs. Stale `.pyc` bytecode cache.

**Fix Applied:**
```python
# Cleared pycache
for pycache in anyio_path.rglob('__pycache__'):
    shutil.rmtree(pycache)
```
Also reinstalled compatible versions:
```bash
pip install 'starlette>=0.40.0,<0.47.0' 'httpx>=0.27.0,<0.28.0'
```

**Permanent Solution Needed:**
- Pin compatible versions in all `pyproject.toml` files
- Add pre-flight version check in startup scripts
- Consider using `poetry lock --check` in CI

---

### 7. neo4j.time.DateTime Serialization

**Symptom:**
```
pydantic_core._pydantic_core.PydanticSerializationError: Unable to serialize unknown type: <class 'neo4j.time.DateTime'>
```

**Root Cause:** HCG endpoints passed raw neo4j properties dicts to Pydantic models. Any neo4j.time.DateTime values anywhere in the dict would fail serialization - not just the `created` field.

**Files Modified:** `sophia/src/sophia/api/app.py`

**Fix Applied:**
Added a utility function that recursively sanitizes all neo4j types:
```python
def sanitize_neo4j_properties(props: Dict[str, Any]) -> Dict[str, Any]:
    """Convert neo4j types to JSON-serializable Python types."""
    if not props:
        return props

    result = {}
    for key, value in props.items():
        if hasattr(value, "isoformat"):
            # neo4j.time.DateTime, datetime, date, time
            result[key] = value.isoformat()
        elif isinstance(value, dict):
            result[key] = sanitize_neo4j_properties(value)
        elif isinstance(value, list):
            result[key] = [
                sanitize_neo4j_properties(item) if isinstance(item, dict)
                else (item.isoformat() if hasattr(item, "isoformat") else item)
                for item in value
            ]
        else:
            result[key] = value
    return result
```

Applied to all HCG endpoints:
- `/hcg/snapshot` - entity properties, edge properties
- `/hcg/entities/{entity_id}` - entity properties
- `/hcg/edges` - edge properties

**Permanent Solution:** This utility is now the permanent solution. Consider moving it to a shared module if needed elsewhere.

---

### 8. CORS Preflight Failures

**Symptom:** Browser got 403 on preflight, curl worked fine.

**Root Cause:** CORS config had `allow_credentials=True` with `allow_origins=["*"]`. These are incompatible - browsers reject wildcard origins with credentials.

**File Modified:** `sophia/src/sophia/api/app.py` (line ~352)

**Fix Applied:**
```python
# Before
allow_origins=(get_env_value("CORS_ORIGINS", default="*") or "*").split(",")

# After
allow_origins=(get_env_value("CORS_ORIGINS", default="http://localhost:3000,http://localhost:3001") or "").split(",")
```

**Permanent Solution Needed:**
- Document CORS requirements
- Consider dynamic origin reflection for dev environments
- Add to standard service template

---

## Environment Architecture Clarified

| Environment | How services run | Config source |
|-------------|------------------|---------------|
| **Local dev** | `poetry run python -m <module>` | OS env vars, `.env` files |
| **Tests** | Docker containers | `.env.test` from `render_test_stacks.py` |
| **CI** | Docker containers from GHCR | `.env.test` rendered in workflow |

Key insight: Each repo is independently deployable, so:
- Git dependencies in `pyproject.toml` for dev iteration
- Containers for prod/test
- `logos_config` provides centralized defaults with port allocations
- `.env` files allow local overrides

---

## Files Modified This Session

| File | Changes |
|------|---------|
| `sophia/src/sophia/api/app.py` | Added `load_dotenv()`, added `sanitize_neo4j_properties()` utility, applied sanitization to all 4 HCG property usages, updated CORS origins |
| `apollo/webapp/.env` | Created from `.env.example`, added API tokens |
| `apollo/docs/2026-01-10-environment-debugging-session.md` | This document |

## Package Versions That Work

After all fixes, these versions work together:
- anyio: 4.11.0+ (NOT 3.7.1)
- starlette: 0.46.2
- Python: 3.12
- neo4j: 6.0.3

---

## Related Issues/Tickets

- Issue #433: Config standardization (env.py refactoring)
- `logos/docs/scratch/stack-integration/IMPLEMENTATION_PLAN.md`: Tracks standardization progress

---

### 9. anyio Version Mismatch (Recurring)

**Symptom:**
```
ImportError: cannot import name 'ExceptionGroup' from 'anyio._core._exceptions'
```
Caused 500 errors on all requests, manifesting as CORS errors in browser.

**Root Cause:** `poetry install` pins anyio to 3.7.1, but starlette's BaseHTTPMiddleware requires anyio 4.x for Python 3.12 compatibility. Every `poetry install` reverts the fix.

**Fix Applied:**
```bash
/home/fearsidhe/miniconda3/envs/LOGOS/bin/pip install 'anyio>=4.0.0'
```

**Permanent Solution Needed:**
- Update sophia's `pyproject.toml` to require `anyio>=4.0.0`
- Or pin starlette to a version compatible with anyio 3.x
- This is a recurring issue that will break on every poetry install

---

### 10. Missing Dependencies After Poetry Install

**Symptom:** Various `ModuleNotFoundError` for networkx, sqlalchemy after pip-installing anyio.

**Root Cause:** Pip-installing anyio sometimes removes dependencies that were installed by poetry.

**Fix Applied:**
```bash
poetry install --no-root  # Reinstall deps without replacing sophia package
```

Then manually upgrade anyio again after.

**Permanent Solution Needed:**
- Pin compatible versions in pyproject.toml
- Add anyio>=4.0.0 constraint to avoid this dance

---

### 11. Starting Sophia with Correct Environment

**Symptom:** `ModuleNotFoundError: No module named 'sophia'` when starting via nohup.

**Root Cause:** nohup doesn't inherit poetry's virtualenv or PYTHONPATH.

**Correct startup command:**
```bash
cd /home/fearsidhe/projects/LOGOS/sophia && \
PYTHONPATH=/home/fearsidhe/projects/LOGOS/sophia/src \
nohup /home/fearsidhe/miniconda3/envs/LOGOS/bin/python -m uvicorn sophia.api.app:app \
--host 0.0.0.0 --port 47000 > /tmp/sophia.log 2>&1 &
```

Or use `poetry run` in an interactive shell.

---

## Recommendations for Future

1. **Post-conda-reinstall checklist:**
   - Delete all `.venv` directories
   - Run `poetry install` in each repo
   - Verify `pip show neo4j` works
   - Check `anyio` version compatibility

2. **Startup script improvements:**
   - Kill existing processes before starting
   - Verify required env vars are set
   - Check port availability before binding

3. **CI/CD additions:**
   - Verify package version compatibility
   - Test local dev startup flow periodically

4. **Documentation:**
   - Add troubleshooting guide for common env issues
   - Document the `.env` file requirements per repo

---

## Session Continuation - 2026-01-10 07:45AM

### 12. Poetry Installing to Wrong Environment

**Symptom:** Hermes failed with `ModuleNotFoundError: No module named 'sentence_transformers'` despite `poetry install --extras ml` showing success.

**Root Cause:** Poetry was configured with `virtualenvs.in-project = true`, creating a `.venv` directory. But the shell was using the conda `LOGOS` environment. Packages installed to `.venv/` but Python ran from conda.

**Diagnosis:**
```bash
poetry env info --path  # Showed .venv path
which python            # Showed conda path
```

**Fix Applied:**
```bash
poetry config virtualenvs.create false
poetry install --extras ml
```
This makes poetry install directly into the active conda environment instead of creating a separate `.venv`.

**Permanent Solution:** This is the permanent solution when using poetry with conda. The config is user-level (`~/.config/pypoetry/config.toml`), so it persists.

---

### 13. Hermes Milvus Connection (503 Errors)

**Symptom:** Media upload page returned 503 errors. Hermes logs showed:
```
Failed to connect to Milvus: <MilvusException: (code=2, message=Fail connecting to server on localhost:17530...)>
```

**Root Cause:** Hermes expects Milvus on port 17530 (hermes offset), but only the shared dev Milvus was running on 19530.

**Fix Applied (temporary):** Started hermes test stack:
```bash
cd ~/projects/LOGOS/logos/infra/hermes
docker compose -f docker-compose.test.yml up -d
```

**Architecture Clarification:**
- Port offsets: hermes +10000 (17530), sophia +40000 (47530), etc.
- In production: All services share Milvus through Sophia
- For local dev: Can use shared Milvus on 19530 via `MILVUS_PORT=19530`
- For testing/CI: Each repo uses isolated instances

**Hermes Role:**
- Creates embeddings (sentence-transformers)
- Sometimes queries Milvus directly for efficiency (e.g., media uploads to avoid unnecessary hop to Sophia)
- Sophia is the primary Milvus gateway for most operations

**Permanent Solution Options:**
1. Set `MILVUS_PORT=19530` in hermes `.env` for local dev to use shared instance
2. Or always run hermes test stack when developing hermes features
3. Document the expected Milvus setup per development scenario

---

### Files Modified (continuation)

| File | Changes |
|------|---------|
| `~/.config/pypoetry/config.toml` | Set `virtualenvs.create = false` |
| Hermes test stack | Started Milvus container on port 17530 |

---

### Key Commands Added

```bash
# Poetry with conda (one-time config)
poetry config virtualenvs.create false

# Verify poetry is using conda
poetry env info --path  # Should show conda env path, not .venv

# Start hermes test stack (if not using shared Milvus)
cd ~/projects/LOGOS/logos/infra/hermes
docker compose -f docker-compose.test.yml up -d

# Or use shared dev Milvus
export MILVUS_PORT=19530
```
