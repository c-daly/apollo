# Intake: Issue #131 - Apollo Standardization Completion

## What
Complete Apollo standardization by cleaning up orphaned docker files and ensuring test infrastructure uses shared LOGOS utilities.

## Why
Ensure Apollo follows LOGOS standards for consistency across repos.

## Context Gathered

### Current State
| Item | Status | Detail |
|------|--------|--------|
| Docker files in `containers/` | ✅ | 2 files present |
| Root docker files | ❌ | Orphaned copies: `Dockerfile`, `docker-compose.test.yml` |
| logos_config usage | ✅ | Used in `env.py`, `config/settings.py`, `api/server.py` |
| logos_test_utils usage | ❌ | Comment mentions it but no actual imports |

### logos_config (Already Integrated)
Apollo's `src/apollo/env.py` already imports:
- `logos_config.env.get_env_value`
- `logos_config.env.get_repo_root`
- `logos_config.env.load_env_file`
- `logos_config.ports.APOLLO_PORTS`

### logos_test_utils (Not Integrated)
Provides:
- `setup_logging` - structured logging
- `get_neo4j_config`, `get_milvus_config` - service configs
- `wait_for_neo4j`, `wait_for_milvus` - health waits
- Docker helpers, health checks

Apollo's e2e tests currently use raw `os.getenv()` with hardcoded defaults instead of these utilities.

## Scope

### Required (Acceptance Criteria)
1. ✅ Delete orphaned root docker files (already staged)
2. ✅ logos_config integrated (already done in env.py)
3. ⚠️ logos_test_utils integration (e2e/conftest.py uses raw os.getenv)

### Decision Point
The e2e conftest.py works but doesn't use logos_test_utils. Options:
- **Option A**: Refactor e2e/conftest.py to use logos_test_utils utilities
- **Option B**: Leave e2e as-is since it works, mark #131 as complete
- **Option C**: Just update the comment in unit/conftest.py (it's misleading)

## Success Criteria
- [ ] Root docker files deleted
- [ ] logos_test_utils properly integrated OR documented as not applicable
- [ ] Tests pass

## Constraints
- Don't break existing tests
- Follow patterns from hermes/sophia

## Workflow
**Classification**: COMPLEX (touches test infrastructure, needs careful approach)
