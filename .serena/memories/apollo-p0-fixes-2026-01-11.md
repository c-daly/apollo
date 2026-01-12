# Apollo P0 Fixes - 2026-01-11

## Branch
`feature/code-review-fixes` - PR #147

## Fixes Implemented

### P0.1 - Async Neo4j Execution
- All sync Neo4j calls wrapped in `asyncio.to_thread()`
- Affects: persona endpoints, HCG query endpoints

### P0.2 - HTTP Connection Pooling
- Shared `httpx.AsyncClient` created in lifespan context
- Stored at `app.state.http_client`
- All media endpoints (`/api/media/upload`, `/api/media/{id}`, `/api/media/{id}/download`) use shared client

### P0.3 - UTC Timezone Handling
- Pydantic `field_validator` in models.py adds UTC to naive datetimes
- All `datetime.now()` calls use `datetime.now(timezone.utc)`
- Applied to: Entity, PersonaEntry models

### P0.4 - WebSocket Broadcast Lock
- Copy-under-lock pattern: `connections = list(self._connections.values())` inside lock
- Telemetry update moved inside lock to prevent race condition
- Iteration happens outside lock

### P0.5 - Input Validation
- `validate_entity_id()` function in hcg_client.py
- Whitelist regex: `^[\w\-.:]+$` (alphanumeric, hyphen, underscore, dot, colon)
- Applied to all methods accepting entity IDs:
  - HCGClient: get_causal_edges, get_plan_history, get_state_history, get_graph_snapshot
  - PersonaDiaryStore: get_entry, list_entries

## Test File
`tests/unit/test_p0_fixes.py` - comprehensive tests for all fixes

## Greptile Reviews
All issues addressed across reviews #2251231 through #2251645
