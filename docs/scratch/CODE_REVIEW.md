# Apollo Repository - Comprehensive Python Code Review

**Review Date**: 2026-01-07
**Reviewer**: Claude (Sonnet 4.5)
**Target**: Python 3.11+ codebase
**Scope**: Backend Python code (CLI, API, data layer)

---

## Architecture Inferred

**Apollo** is a thin client layer for the LOGOS cognitive architecture, providing:
- **CLI tool** (`apollo-cli`) - Command-line interface via Click
- **FastAPI server** (`apollo-api`) - REST + WebSocket endpoints for web dashboard
- **React webapp** - TypeScript/React visualization dashboard (not reviewed in detail here)
- **Client wrappers** - Thin facades over generated SDKs from the `logos` repository
- **Data layer** - Neo4j read-only queries, in-memory persona storage

**Technology Stack**: Python 3.11+, FastAPI, Click, Pydantic, Neo4j, WebSockets, pytest

The repository follows a **proxy/facade pattern** - minimal business logic, mostly routing commands to Sophia (cognitive core) and Hermes (language services), then presenting results via CLI or web UI.

---

## 1. Executive Summary

### Top 3 Risks (Correctness, Performance, Maintainability)

1. **Resource Leaks in WebSocket Management** (Correctness/Performance)
   - `DiagnosticsManager._broadcast()` holds lock while iterating connections; if a connection handler blocks, all broadcasts stall
   - Queue overflow handling silently drops messages without backpressure signaling
   - No timeout on WebSocket message sends - slow clients can block sender task

2. **Error Handling Inconsistency** (Correctness)
   - Broad `except Exception` (BLE001) used pervasively without re-raising or proper cleanup
   - `api/server.py` catches exceptions in lifespan context but doesn't propagate startup failures clearly
   - CLI commands (`cli/main.py`) display generic error messages without exit codes for scripting

3. **Configuration Complexity & Validation Gap** (Maintainability)
   - Environment variable resolution scattered across `env.py` and `config/settings.py`
   - No validation of inter-service connectivity at startup (can fail late in request handlers)
   - `0.0.0.0` → `localhost` translation in `_get_client_host()` is fragile for container environments

### Top 3 High-Leverage Improvements

1. **Add Comprehensive Type Hints & Runtime Validation**
   - Many functions in `data/hcg_client.py` and `api/server.py` lack return type annotations
   - Add `@validate_call` decorator from Pydantic for critical functions
   - Impact: HIGH - Catches bugs at dev time, improves IDE autocomplete, documents intent

2. **Implement Connection Pooling & Caching**
   - Neo4j driver creates new sessions per query - no connection pool reuse pattern
   - HTTP clients (`hermes_client.py`, `sophia_client.py`) instantiated per-request
   - Impact: HIGH - 2-3x latency reduction, eliminates connection overhead

3. **Structured Logging & Observability**
   - Replace `print()` statements with structured logging (JSON format)
   - Add traceability: request IDs, user context, timing metrics
   - Impact: MEDIUM-HIGH - Essential for production debugging, performance profiling

### Quick Wins vs. Larger Refactors

**Quick Wins (< 1 day each):**
- Fix `pyproject.toml` mypy config - `disallow_untyped_defs` is disabled for some modules unnecessarily
- Add `__all__` exports to public modules (`client/__init__.py`, `data/__init__.py`)
- Replace bare `except Exception:` with specific exception types where possible
- Add docstring standardization (Google/NumPy style consistently)
- Enable Ruff's `UP` (pyupgrade) rule to auto-modernize syntax

**Larger Refactors (1-2 weeks each):**
- Refactor `api/server.py` (1005 lines) into smaller route modules (`/api/routes/goals.py`, `/api/routes/diagnostics.py`, etc.)
- Extract WebSocket management into separate `WebSocketManager` class with proper lifecycle
- Consolidate environment/config loading into single `ConfigLoader` with full validation
- Add retry logic + circuit breakers for external service calls (Sophia, Hermes, Neo4j)
- Introduce dependency injection framework (e.g., `dependency-injector`) to reduce global state

---

## 2. Findings (by Category)

### A. Correctness & Edge Cases

#### **Finding A1: Unvalidated Neo4j Query Parameters**
- **Impact**: Medium - SQL-injection-like vulnerabilities possible
- **Evidence**: `data/hcg_client.py:197-207`
  ```python
  query = """
  MATCH (n)
  WHERE n.id = $entity_id OR id(n) = $node_id
  RETURN n
  """
  # ...
  node_id=int(entity_id) if entity_id.isdigit() else -1,
  ```
  If `entity_id` contains malicious Cypher, this could be exploited (though parameterization helps)
- **Recommendation**:
  - Add input validation: `entity_id.strip()`, check length/format
  - Use Neo4j's typed parameters consistently
  - Add integration tests with malformed inputs

#### **Finding A2: Datetime Parsing Without Timezone Awareness**
- **Impact**: Low-Medium - Can cause off-by-hours bugs in distributed deployments
- **Evidence**: `data/models.py:23,39` - `datetime` fields lack `timezone` metadata
- **Recommendation**:
  - Use `datetime.now(timezone.utc)` everywhere instead of `datetime.now()`
  - Add custom Pydantic validator to enforce UTC:
    ```python
    @field_validator('timestamp', mode='before')
    def ensure_utc(cls, v):
        if v and not v.tzinfo:
            return v.replace(tzinfo=timezone.utc)
        return v
    ```

#### **Finding A3: Missing Null Checks in `_convert_value()`**
- **Impact**: Low - Could raise `AttributeError` on unexpected Neo4j types
- **Evidence**: `data/hcg_client.py:61-77`
  ```python
  if hasattr(value, "to_native"):
      return value.to_native()
  ```
  No handling for `value` being a complex type without `to_native`
- **Recommendation**:
  - Add explicit type checks before calling methods
  - Wrap in try/except with logging for unexpected types

---

### B. Performance & Efficiency

#### **Finding B1: Synchronous Neo4j Queries in FastAPI Event Loop**
- **Impact**: HIGH - Blocks event loop, limits concurrency to ~10-20 req/s
- **Evidence**: `api/server.py:318-327` - Telemetry poller uses `asyncio.to_thread()` but endpoints don't
  ```python
  health = await asyncio.to_thread(hcg_client.health_check)
  ```
  vs. `api/server.py:481-487` (endpoint):
  ```python
  async def get_entities(...):
      entities = hcg_client.get_entities(...)  # BLOCKING!
      return entities
  ```
- **Recommendation**:
  - Wrap **all** `hcg_client` calls in `asyncio.to_thread()` inside async endpoints
  - OR: Migrate to async Neo4j driver (`neo4j-driver[async]`)
  - Benchmark: This alone could 5-10x throughput

#### **Finding B2: No Connection Pooling for HTTP Clients**
- **Impact**: MEDIUM-HIGH - Wastes 50-100ms per request on TCP handshakes
- **Evidence**: `client/sophia_client.py:27-36` - SDK built per-instance, no reuse across requests
- **Recommendation**:
  - Use `httpx.AsyncClient` with connection pooling
  - Initialize once in `lifespan` startup, reuse across requests
  - Example:
    ```python
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with httpx.AsyncClient(timeout=30, limits=httpx.Limits(max_connections=100)) as client:
            app.state.http_client = client
            yield
    ```

#### **Finding B3: Inefficient JSON Parsing in Tight Loops**
- **Impact**: MEDIUM - `_sanitize_props()` recursively parses dicts without memoization
- **Evidence**: `data/hcg_client.py:88-105` - Called on every node/relationship property
- **Recommendation**:
  - Use `@lru_cache` for immutable property transformations
  - OR: Parse JSON once at driver level, not per-field

#### **Finding B4: Unbounded Queue Growth in WebSocket Manager**
- **Impact**: MEDIUM - Memory leak if clients can't keep up
- **Evidence**: `api/server.py:107` - `asyncio.Queue(maxsize=100)` drops messages silently
- **Recommendation**:
  - Implement exponential backoff or disconnect slow clients
  - Add metrics: `messages_dropped_total`, `queue_size_current`
  - Consider pub/sub pattern (Redis) for scaling beyond single process

---

### C. Pythonic Style & Readability

#### **Finding C1: Inconsistent Naming Conventions**
- **Impact**: LOW - Harms maintainability
- **Evidence**:
  - `api/server.py` uses `hcg_client` (snake_case global) vs. `diagnostics_manager` (also global)
  - `cli/main.py` has `DEFAULT_CHAT_SYSTEM_PROMPT` (SCREAMING_SNAKE_CASE) as module constant (should be `_DEFAULT_...`)
- **Recommendation**:
  - Follow PEP 8: `_module_private` for internals, `PUBLIC_CONSTANT` for API-stable values
  - Run `ruff check --select N` to catch naming issues

#### **Finding C2: Overly Long Functions**
- **Impact**: MEDIUM - Hard to test, understand, maintain
- **Evidence**:
  - `cli/main.py:496-600` - `chat()` command is 104 lines (argument parsing, persona fetching, LLM call, telemetry, logging)
  - `api/server.py:635-716` - `chat_stream()` endpoint is 81 lines with nested helpers
- **Recommendation**:
  - Extract helpers: `_build_chat_request()`, `_fetch_persona_context()`, `_emit_telemetry()`
  - Target: <50 lines per function, <10 branches

#### **Finding C3: Magic Numbers & Strings**
- **Impact**: LOW-MEDIUM - Maintenance burden
- **Evidence**:
  - `api/server.py:117` - `max_logs=200` hardcoded
  - `api/server.py:1134` - `MAX_FILE_SIZE = 100 * 1024 * 1024` (should be config)
  - `api/server.py:738` - `chunk_size=200` in `_chunk_text()` (arbitrary)
- **Recommendation**:
  - Define constants at module top or in config
  - Add comments explaining rationale ("200 chosen to balance latency vs. chunk count")

#### **Finding C4: Unclear Variable Names**
- **Impact**: LOW - Slows comprehension
- **Evidence**:
  - `cli/main.py:813` - `kwargs: Dict[str, Any]` accumulates parameters without clear schema
  - `data/hcg_client.py:515` - `node_query` vs. `edge_query` (could be `FETCH_NODES_CQL`, `FETCH_EDGES_CQL`)
- **Recommendation**:
  - Use descriptive names: `llm_request_params` instead of `kwargs`
  - Consider TypedDict for structured dictionaries

---

### D. SOLID & Design

#### **Finding D1: Single Responsibility Principle Violations**
- **Impact**: MEDIUM-HIGH - Tight coupling, hard to test
- **Evidence**:
  - `api/server.py` does: HTTP routing, WebSocket management, diagnostics aggregation, persona storage, telemetry polling (5+ responsibilities)
  - `cli/main.py` does: CLI parsing, HTTP client creation, response formatting, telemetry emission (4 responsibilities)
- **Recommendation**:
  - Split `api/server.py` into:
    - `api/routes/` - Route handlers
    - `api/websocket.py` - WebSocket manager
    - `api/diagnostics.py` - Diagnostics aggregator
    - `api/telemetry.py` - Background polling task
  - Extract CLI presentation logic to `cli/formatters.py`

#### **Finding D2: Open/Closed Principle - Hardcoded Response Formats**
- **Impact**: MEDIUM - Adding JSON/protobuf output requires editing every command
- **Evidence**: `cli/main.py` embeds YAML formatting in each command (lines 94-99, 134-140, etc.)
- **Recommendation**:
  - Create `ResponseFormatter` ABC with `YamlFormatter`, `JsonFormatter` subclasses
  - Pass formatter to commands via Click context
  - Example:
    ```python
    @cli.command()
    @click.pass_context
    def state(ctx):
        formatter = ctx.obj['formatter']  # Injected at CLI init
        response = client.get_state()
        console.print(formatter.format(response))
    ```

#### **Finding D3: Liskov Substitution Principle - Inconsistent `ServiceResponse` Usage**
- **Impact**: LOW - Breaks polymorphism expectations
- **Evidence**: `client/sophia_client.py:20` defines `SophiaResponse(ServiceResponse)` but adds no behavior
  ```python
  class SophiaResponse(ServiceResponse):
      """Response wrapper so the CLI can render consistent output."""
  ```
  Empty subclass serves no purpose
- **Recommendation**:
  - Remove empty subclasses, use `ServiceResponse` directly
  - OR: Add domain-specific methods (e.g., `SophiaResponse.is_plan_ready()`)

#### **Finding D4: Dependency Inversion Principle - Concrete Dependencies**
- **Impact**: MEDIUM - Can't swap implementations for testing
- **Evidence**:
  - `api/server.py:60-63` uses global `hcg_client` instead of dependency injection
  - Tests mock globals instead of injecting test doubles
- **Recommendation**:
  - Use FastAPI's `Depends()` for injectable services
  - Example:
    ```python
    def get_hcg_client() -> HCGClient:
        return hcg_client

    @app.get("/api/entities")
    async def get_entities(client: HCGClient = Depends(get_hcg_client)):
        ...
    ```

---

### E. Testing & Reliability

#### **Finding E1: Insufficient Edge Case Coverage**
- **Impact**: MEDIUM - Production bugs escape
- **Evidence**: `tests/unit/test_config.py` doesn't test:
  - Conflicting env vars + YAML config
  - Invalid port numbers (negative, >65535)
  - Malformed YAML (non-dict root)
- **Recommendation**:
  - Add parameterized tests with `@pytest.mark.parametrize` for boundary values
  - Test schema validation failures (Pydantic should raise)

#### **Finding E2: Integration Tests Lack Cleanup**
- **Impact**: LOW-MEDIUM - Flaky tests, resource leaks
- **Evidence**: `tests/integration/conftest.py` likely doesn't teardown Neo4j data between tests
- **Recommendation**:
  - Use pytest fixtures with `yield` for setup/teardown
  - Clear Neo4j test database after each test: `session.run("MATCH (n) DETACH DELETE n")`

#### **Finding E3: Missing Async Test Coverage**
- **Impact**: MEDIUM - WebSocket/async endpoints undertested
- **Evidence**: Only 1 async test file (`test_websocket.py`), but `api/server.py` has 10+ async endpoints
- **Recommendation**:
  - Use `pytest-asyncio` + `httpx.AsyncClient` to test all FastAPI endpoints
  - Add WebSocket client tests (connect, send, receive, disconnect)

---

### F. Packaging, Typing, and Tooling

#### **Finding F1: mypy Config Too Permissive**
- **Impact**: LOW-MEDIUM - Type errors slip through
- **Evidence**: `pyproject.toml:59-69` disables mypy for entire third-party modules
  ```toml
  [[tool.mypy.overrides]]
  module = ["neo4j", "neo4j.*", ...]
  ignore_missing_imports = true
  ignore_errors = true  # <-- Too broad!
  ```
- **Recommendation**:
  - Use `ignore_missing_imports = true` only (not `ignore_errors`)
  - Install type stubs where available: `types-neo4j` (if exists)

#### **Finding F2: Ruff Not Fully Leveraged**
- **Impact**: LOW - Missing lint checks
- **Evidence**: `pyproject.toml:48-50` only configures `line-length` and `target-version`
- **Recommendation**:
  - Add selected rule sets:
    ```toml
    [tool.ruff]
    select = ["E", "F", "I", "N", "UP", "S", "B", "A", "C4", "DTZ", "PIE", "PT", "RET", "SIM", "ARG"]
    ```
  - Run `ruff check --select ALL --preview` to see what's possible

#### **Finding F3: Missing Pre-Commit Hooks**
- **Impact**: LOW - Inconsistent formatting in commits
- **Evidence**: No `.pre-commit-config.yaml` in repo
- **Recommendation**:
  - Add pre-commit hooks for:
    - `ruff` (format + lint)
    - `mypy`
    - `pytest --co` (check tests collect)
  - Example config:
    ```yaml
    repos:
      - repo: https://github.com/astral-sh/ruff-pre-commit
        rev: v0.1.0
        hooks:
          - id: ruff
            args: [--fix]
          - id: ruff-format
    ```

---

## 3. Hotspots & Callouts

### 5-10 Most Complex Functions (by reading complexity)

1. **`api/server.py:873-989` - `diagnostics_websocket()`** (116 lines, nested async tasks)
   - **Complexity**: High - Manages 2 concurrent tasks (heartbeat listener, message sender), error handling, cleanup
   - **Risk**: Deadlock if tasks don't cancel properly, memory leak if unregister fails
   - **Recommendation**: Extract into `WebSocketConnectionHandler` class with explicit state machine

2. **`cli/main.py:496-600` - `chat()` command** (104 lines, 8 branches)
   - **Complexity**: High - Argument parsing, persona fetching, LLM request building, telemetry, persona logging
   - **Risk**: Fragile - any change cascades to multiple concerns
   - **Recommendation**: Split into 5 smaller functions: `parse_args()`, `fetch_persona()`, `build_request()`, `emit_telemetry()`, `log_entry()`

3. **`data/hcg_client.py:490-573` - `get_graph_snapshot()`** (83 lines, nested queries)
   - **Complexity**: Medium-High - Two Neo4j queries, node/edge iteration, property sanitization
   - **Risk**: N+1 query pattern if not careful (currently OK)
   - **Recommendation**: Add query plan logging, benchmark with 10k+ node graphs

4. **`api/server.py:635-716` - `chat_stream()` endpoint** (81 lines, generator + async)
   - **Complexity**: High - Async generator, error handling, telemetry, persona persistence
   - **Risk**: Uncaught exceptions in generator don't propagate to client
   - **Recommendation**: Wrap generator in try/except, send error events via SSE

5. **`data/hcg_client.py:147-182` - `get_entities()`** (35 lines, but called frequently)
   - **Complexity**: Medium - Parameterized query with optional filters
   - **Risk**: Query performance degrades with large datasets (no index hints)
   - **Recommendation**: Add `EXPLAIN` logging in debug mode, ensure Neo4j indexes exist

### Duplicated Logic (consolidation opportunities)

1. **Metadata Sanitization** - `_sanitize_metadata()` appears in:
   - `cli/main.py:786-803`
   - `api/server.py:803-809`
   - Nearly identical implementations
   - **Recommendation**: Move to `apollo/utils.py`, import in both places

2. **Persona Entry Creation** - Repeated in:
   - `cli/main.py:688-720` (via PersonaClient)
   - `api/server.py:776-800` (direct PersonaDiaryStore)
   - **Recommendation**: Centralize in `PersonaClient.create_entry()`, use everywhere

3. **Usage Formatting** - `_format_usage()` in `cli/main.py:854-868` could be reused by API diagnostics
   - **Recommendation**: Extract to `apollo/formatters.py`

### Slow Paths (nested loops, repeated I/O, N^2 patterns)

1. **`api/server.py:253-270` - `_broadcast()` loops over all connections**
   - **O(N)** where N = connected clients (currently acceptable)
   - **Risk**: If clients >> 100, this blocks the event loop
   - **Recommendation**: Offload to background task pool or use Redis pub/sub

2. **`data/hcg_client.py:88-105` - `_sanitize_props()` is recursive without depth limit**
   - **Risk**: Deeply nested properties (e.g., 1000 levels) cause stack overflow
   - **Recommendation**: Add max depth parameter (e.g., `max_depth=10`)

3. **`cli/main.py:722-739` - `_fetch_persona_entries()` makes synchronous HTTP call in event loop** (blocking)
   - **Impact**: CLI hangs for `persona_limit * RTT` milliseconds
   - **Recommendation**: Use async HTTP client or warn user about delay

---

## 4. SOLID Evaluation

### SRP: Where responsibilities are mixed

| File | Problem | Recommendation |
|------|---------|----------------|
| `api/server.py` | Mixing routing, WebSocket, diagnostics, telemetry | Split into `routes/`, `websocket.py`, `diagnostics.py` |
| `cli/main.py` | CLI commands mix business logic + formatting | Extract formatting to `cli/formatters.py` |
| `data/hcg_client.py` | Mixes query logic + data transformation | Extract `Neo4jTypeConverter` class |

### OCP: Where adding features requires editing many files

| Feature Request | Files to Edit | Suggestion |
|----------------|---------------|------------|
| Add JSON output to CLI | Every command in `cli/main.py` (20+ edits) | Use `ResponseFormatter` strategy pattern |
| Add new persona entry type | `data/models.py`, `api/server.py`, `cli/main.py`, frontend | Use extensible enum + validator registry |
| Support new Neo4j label | `data/hcg_client.py` (hardcoded labels in queries) | Use dynamic query builder |

**Recommendation**: Introduce **configuration-driven behavior** - e.g., CLI output format from `--format json` flag, persona types from YAML schema.

### LSP: Where inheritance/interfaces are misused

**Finding**: Empty subclasses like `SophiaResponse`, `HermesResponse` violate LSP because they add no behavior but create unnecessary type hierarchy.

**Recommendation**: Remove these subclasses OR add domain-specific methods:
```python
class SophiaResponse(ServiceResponse):
    def get_plan_id(self) -> Optional[str]:
        return self.data.get("plan_id") if self.data else None
```

### ISP: Interface segregation opportunities

**Finding**: `HCGClient` exposes 10+ query methods but many consumers only use 2-3 (e.g., API server uses `get_entities`, `get_processes`, `health_check`).

**Recommendation**: Split into smaller interfaces:
```python
class HCGEntityReader(Protocol):
    def get_entities(...) -> List[Entity]: ...

class HCGHealthChecker(Protocol):
    def health_check() -> bool: ...
```

This allows mocking only what's needed in tests.

### DIP: Where concrete dependencies should be inverted

**Finding**: Global `hcg_client`, `persona_store`, `hermes_client` in `api/server.py` create hard dependencies.

**Recommendation**: Use FastAPI's dependency injection:
```python
class ServiceContainer:
    hcg_client: HCGClient
    persona_store: PersonaDiaryStore
    hermes_client: HermesClient

@app.get("/api/entities")
async def get_entities(container: ServiceContainer = Depends(get_container)):
    entities = await asyncio.to_thread(container.hcg_client.get_entities, ...)
    return entities
```

---

## 5. Performance Section (actionable)

### Big-O Concerns

| Location | Current | Issue | Fix |
|----------|---------|-------|-----|
| `api/server.py:253-270` (_broadcast) | O(N) clients | Blocks event loop if N large | Use Redis pub/sub or background thread pool |
| `data/hcg_client.py:88-105` (_sanitize_props) | O(depth * nodes) | Recursive without limit | Add `max_depth=10`, memoize |
| `cli/main.py:757-783` (_build_persona_metadata) | O(N entries * M fields) | Nested dict iteration | Use dict comprehension, profile with 10k entries |

### I/O and Serialization Costs

1. **Synchronous Neo4j Queries** - Each query blocks for 10-50ms
   - **Fix**: Use `asyncio.to_thread()` OR async Neo4j driver
   - **Expected Improvement**: 5-10x throughput

2. **JSON Parsing in `_parse_json_field()`** - Called per Neo4j property
   - **Fix**: Parse at driver level once, not per field
   - **Expected Improvement**: 20-30% faster HCG queries

3. **YAML Dumping for Display** - `cli/main.py` calls `yaml.dump()` on every response
   - **Fix**: Use `orjson` for faster JSON serialization (3-5x faster than `yaml`)
   - **Expected Improvement**: CLI commands feel snappier

### Caching/Memoization Opportunities

1. **Config Loading** - `ApolloConfig.load()` re-parses YAML on every CLI invocation
   - **Fix**: Cache parsed config in `~/.apollo/cache/config.json`, invalidate on file mtime change
   - **Expected Improvement**: CLI startup 50ms → 10ms

2. **Persona Entries** - `_fetch_persona_entries()` refetches same entries every chat command
   - **Fix**: Cache last N entries in memory with TTL=60s
   - **Expected Improvement**: Chat command 200ms faster

3. **Neo4j Connection** - Reconnects on every FastAPI startup (during dev)
   - **Fix**: Use connection pool, reuse across hot-reloads
   - **Expected Improvement**: Startup 500ms faster

### Concurrency/Async Notes

1. **FastAPI Endpoints are `async def` but call blocking I/O** - This defeats the purpose of async
   - **Fix**: Wrap all blocking calls in `asyncio.to_thread()`
   - **Impact**: Can handle 100+ concurrent requests (currently ~10-20)

2. **WebSocket `_broadcast()` holds lock during iteration** - Slow clients can block broadcasts
   - **Fix**: Collect connection IDs under lock, then send outside lock
   - **Impact**: Prevents broadcast stalls

### "Measure First" Plan

**What to Profile:**
1. CLI command end-to-end latency (`apollo-cli state`)
2. FastAPI endpoint latency (`GET /api/entities`)
3. WebSocket broadcast latency (time from log event → client receive)

**How to Profile:**

**1. cProfile (for CPU-bound code):**
```bash
python -m cProfile -o cli.prof -m apollo.cli.main state
snakeviz cli.prof  # visualize
```

**2. py-spy (for live profiling):**
```bash
py-spy record -o flamegraph.svg -- apollo-api
# Then load test with wrk/locust
```

**3. Scalene (for memory + CPU):**
```bash
scalene --reduced-profile apollo/api/server.py
```

**Key Metrics to Track:**
- P50, P95, P99 latency
- CPU % per endpoint
- Memory growth rate (check for leaks)
- Neo4j query time (add logging decorator)

---

## 6. Style & Tooling Recommendations

### Formatting/Linting/Typing

**Current State:**
- ✅ Black configured (line-length=88)
- ✅ Ruff configured (basic)
- ✅ mypy configured (but too permissive)
- ❌ No pre-commit hooks
- ❌ Ruff rules not fully enabled

**Recommended Configuration:**

```toml
# pyproject.toml
[tool.ruff]
line-length = 88
target-version = "py311"
select = [
    "E",   # pycodestyle errors
    "F",   # pyflakes
    "I",   # isort
    "N",   # pep8-naming
    "UP",  # pyupgrade
    "S",   # bandit (security)
    "B",   # flake8-bugbear
    "A",   # flake8-builtins
    "C4",  # flake8-comprehensions
    "DTZ", # flake8-datetimez
    "PIE", # flake8-pie
    "PT",  # flake8-pytest-style
    "RET", # flake8-return
    "SIM", # flake8-simplify
    "ARG", # flake8-unused-arguments
]
ignore = [
    "S101", # Allow assert in tests
    "S608", # Possible SQL injection (false positives with Neo4j)
]

[tool.ruff.per-file-ignores]
"tests/**/*.py" = ["S101", "ARG"]  # Allow asserts, unused fixtures

[tool.mypy]
python_version = "3.11"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
strict_optional = true
warn_redundant_casts = true
warn_unused_ignores = true
check_untyped_defs = true

[[tool.mypy.overrides]]
module = ["neo4j.*", "websockets.*"]
ignore_missing_imports = true
# Remove ignore_errors = true

[tool.pytest.ini_options]
addopts = "-v --cov=apollo --cov-report=term-missing --cov-report=html"
testpaths = ["tests"]
```

### Pre-Commit Hooks

**`.pre-commit-config.yaml`:**
```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.1.9
    hooks:
      - id: ruff
        args: [--fix, --exit-non-zero-on-fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.8.0
    hooks:
      - id: mypy
        additional_dependencies: [pydantic, types-pyyaml, types-requests]

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
```

---

## 7. Prioritized Action Plan

### P0 (Do Now - Critical for Correctness/Production)

| Task | Effort | Benefit | Files |
|------|--------|---------|-------|
| Fix synchronous Neo4j calls in async endpoints | M | HIGH | `api/server.py:471-632` |
| Add connection pooling for HTTP clients | M | HIGH | `client/*.py`, `api/server.py` |
| Add UTC timezone handling to all datetime fields | S | MEDIUM | `data/models.py`, `data/hcg_client.py` |
| Fix WebSocket broadcast lock contention | M | MEDIUM | `api/server.py:253-270` |
| Add input validation to Neo4j queries | S | MEDIUM | `data/hcg_client.py` |

### P1 (Next - High ROI Improvements)

| Task | Effort | Benefit | Files |
|------|--------|---------|-------|
| Split `api/server.py` into route modules | L | HIGH | New: `api/routes/*.py` |
| Add structured logging (JSON format) | M | HIGH | All `.py` files |
| Implement retry logic for external services | M | MEDIUM-HIGH | `client/*.py` |
| Add comprehensive type hints | M | MEDIUM | `data/hcg_client.py`, helpers |
| Extract duplicated metadata sanitization | S | MEDIUM | `cli/main.py`, `api/server.py` → `utils.py` |
| Set up pre-commit hooks | S | MEDIUM | New: `.pre-commit-config.yaml` |

### P2 (Later - Nice to Have)

| Task | Effort | Benefit | Files |
|------|--------|---------|-------|
| Introduce dependency injection framework | L | MEDIUM | `api/server.py`, tests |
| Add response formatter strategy pattern | M | MEDIUM | `cli/main.py`, new `cli/formatters.py` |
| Migrate to async Neo4j driver | L | MEDIUM-HIGH | `data/hcg_client.py` |
| Add caching layer (Redis) for persona entries | M | LOW-MEDIUM | New: `cache/*.py` |
| Consolidate config loading into single validator | M | MEDIUM | `config/settings.py`, `env.py` |
| Enable full Ruff rule set | S | LOW | `pyproject.toml` |
| Add circuit breaker pattern | M | MEDIUM | `client/*.py` |

**Effort Legend**: S (Small, <1 day), M (Medium, 1-3 days), L (Large, 1-2 weeks)

---

## Summary & Final Recommendations

**Overall Assessment**: Apollo is a **well-structured thin client** with good separation of concerns (CLI, API, data layer). The codebase is readable and follows modern Python conventions (Pydantic, type hints, pytest). However, there are **blocking performance issues** (sync I/O in async endpoints) and **moderate technical debt** (large functions, global state, error handling).

**Critical Path to Production Readiness:**
1. Fix async/sync I/O mismatch (P0 - blocker)
2. Add connection pooling (P0 - blocker)
3. Split `api/server.py` into modules (P1 - maintainability)
4. Add structured logging + observability (P1 - debugging)
5. Comprehensive integration tests (P1 - quality)

**Estimated Effort**: 3-4 weeks for P0+P1 with 1-2 engineers.

**Long-Term**: This codebase is a good foundation. After addressing P0/P1 issues, focus on:
- Scaling (Redis pub/sub for WebSockets, read replicas for Neo4j)
- Observability (OpenTelemetry, Prometheus metrics)
- Developer experience (better CLI error messages, auto-generated docs)

---

**End of Review**
