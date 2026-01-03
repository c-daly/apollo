# Spec Review: Apollo Standardization

## Checklist Validation

| Criterion | Status | Evidence |
|-----------|--------|----------|
| No pronouns without referents | PASS | No ambiguous pronouns found |
| No vague quantities | PASS | No vague quantities |
| No implied behavior | FAIL | Spec shows "After" code but doesn't show how existing fixtures (`infrastructure_ports`, `neo4j_config`, `milvus_config`) will derive values |
| Concrete examples | PASS | Before/after code examples provided |
| Explicit edge cases | N/A | Simple refactor, no edge cases |
| Defined interfaces | FAIL | `apollo.env` return types described but not exact dict keys; existing constants (SOPHIA_URL, NEO4J_URI, etc.) not mapped to new sources |
| Testable success criteria | FAIL | No success criteria section |

**Checklist Result:** 3/6 applicable criteria passed

## Implementer Dry-Run

### Behaviors Traced
| Behavior | Target File | Implementable? | Gaps |
|----------|-------------|----------------|------|
| Replace os.getenv with apollo.env | tests/e2e/conftest.py | PARTIAL | Need mapping of 10+ constants to dict keys |
| Fix comment | tests/unit/conftest.py | YES | None |
| Delete docker files | root | YES | Already staged |

### Questions for Spec Author
1. What dict keys does `get_neo4j_config()` return? (uri, user, password - need exact keys)
2. What dict keys does `get_milvus_config()` return? (host, port - need exact keys)
3. What dict keys does `get_sophia_config()` return? (host, port, url - need exact keys)
4. How to handle `NEO4J_HTTP_PORT` - is this in `get_neo4j_config()` or separate?
5. How to handle `MILVUS_METRICS_PORT` - is this in `get_milvus_config()` or separate?
6. Other e2e files import these constants - need backward compat exports?

### Implicit Dependencies Found
- Other test files (`seed_data.py`, `test_infrastructure.py`, `test_e2e_flow.py`) import config constants
- Must maintain module-level constants for backward compatibility

**Dry-Run Result:** NEEDS CLARIFICATION (6 questions)

## Status: NEEDS REVISION

### Issues Requiring Resolution
1. [CHECKLIST] Implied behavior: Need explicit mapping of old constants → new dict keys
2. [CHECKLIST] Interfaces: Document exact return types of apollo.env functions
3. [DRY-RUN] Backward compatibility: Other test files import constants from conftest
4. [DRY-RUN] Missing ports: NEO4J_HTTP_PORT, MILVUS_METRICS_PORT not addressed

### Recommendation
Return to design phase to add:
- Exact dict key mappings
- Backward-compatible constant exports
- Handling of ports not in standard configs
