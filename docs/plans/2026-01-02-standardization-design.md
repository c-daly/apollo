# Apollo Standardization Completion - Design

## Overview
Refactor e2e/conftest.py to use Apollo's existing `env.py` module (which wraps logos_config) instead of raw `os.getenv()` calls with hardcoded defaults.

## Approach
Use Apollo's existing `apollo.env` module and `APOLLO_PORTS` for consistent config.

## Interface Details

### apollo.env.get_neo4j_config() → dict
```python
{"uri": str, "user": str, "password": str}
```

### apollo.env.get_milvus_config() → dict
```python
{"host": str, "port": int, "healthcheck": str}
```

### apollo.env.get_sophia_config() → dict
```python
{"host": str, "port": int, "base_url": str}
```

### apollo.env.APOLLO_PORTS (dataclass)
```python
neo4j_http: 27474
neo4j_bolt: 27687
milvus_grpc: 27530
milvus_metrics: 27091
```

## Constant Mapping

| Old Constant | New Source |
|--------------|------------|
| `SOPHIA_PORT` | `_sophia["port"]` |
| `SOPHIA_HOST` | `_sophia["host"]` |
| `SOPHIA_URL` | `_sophia["base_url"]` |
| `NEO4J_HTTP_PORT` | `APOLLO_PORTS.neo4j_http` |
| `NEO4J_BOLT_PORT` | `APOLLO_PORTS.neo4j_bolt` |
| `NEO4J_URI` | `_neo4j["uri"]` |
| `NEO4J_USER` | `_neo4j["user"]` |
| `NEO4J_PASSWORD` | `_neo4j["password"]` |
| `MILVUS_HOST` | `_milvus["host"]` |
| `MILVUS_PORT` | `_milvus["port"]` |
| `MILVUS_METRICS_PORT` | `APOLLO_PORTS.milvus_metrics` |

## Changes

### 1. tests/e2e/conftest.py

**Replace lines 17-48 with:**
```python
from apollo.env import (
    APOLLO_PORTS,
    get_neo4j_config,
    get_milvus_config,
    get_sophia_config,
    load_stack_env,
)

# Load environment and configs at module level
_env = load_stack_env()
_neo4j = get_neo4j_config(_env)
_milvus = get_milvus_config(_env)
_sophia = get_sophia_config(_env)

# Backward-compatible exports for other test files
SOPHIA_PORT = _sophia["port"]
SOPHIA_HOST = _sophia["host"]
SOPHIA_URL = _sophia["base_url"]

NEO4J_HTTP_PORT = APOLLO_PORTS.neo4j_http
NEO4J_BOLT_PORT = APOLLO_PORTS.neo4j_bolt
NEO4J_URI = _neo4j["uri"]
NEO4J_USER = _neo4j["user"]
NEO4J_PASSWORD = _neo4j["password"]

MILVUS_HOST = _milvus["host"]
MILVUS_PORT = _milvus["port"]
MILVUS_METRICS_PORT = APOLLO_PORTS.milvus_metrics
```

### 2. tests/unit/conftest.py

**Line 9 - Remove misleading comment:**
```python
# Before:
# Import shared test utilities from logos_test_utils

# After:
# (delete the line or replace with accurate comment)
```

## Files Affected
| File | Action |
|------|--------|
| `Dockerfile` (root) | Delete |
| `docker-compose.test.yml` (root) | Delete |
| `tests/e2e/conftest.py` | Modify - replace os.getenv block |
| `tests/unit/conftest.py` | Modify - remove misleading comment |

## Backward Compatibility
All module-level constants remain exported for use by:
- `tests/e2e/seed_data.py`
- `tests/e2e/test_infrastructure.py`
- `tests/e2e/test_e2e_flow.py`

## Success Criteria
- [ ] All e2e tests pass with new config sourcing
- [ ] No hardcoded port numbers in conftest.py
- [ ] Config values come from apollo.env (which uses logos_config)

## Out of Scope
- Modifying apollo.env (already correct)
- Changing test logic (only config sourcing)
- Refactoring other test files (they import constants from conftest)
