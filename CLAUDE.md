# CLAUDE.md — apollo

## What This Is

Thin client UI and command layer for LOGOS. Apollo has two halves:
- **Python backend** (`src/apollo/`) — FastAPI service + CLI bridging the UI to Sophia and Hermes
- **React webapp** (`webapp/`) — TypeScript/React dashboard with HCG visualization, chat, diagnostics, and media management

Apollo does not own business logic. It proxies to Sophia (cognition) and Hermes (language/embeddings) via their SDKs.

## Dependencies

- **Python** >=3.12, **Poetry** for backend dependency management
- **Node** >=18, **npm** >=9 for the webapp
- **Sophia** (port 47000) — cognitive core (planning, state, goals, simulation)
- **Hermes** (port 17000) — language services (LLM chat, embeddings, STT/TTS)
- **Neo4j** (7474/7687) — HCG graph storage (shared infrastructure, default ports)
- **Milvus** (19530) — vector embeddings (shared infrastructure, default ports)
- SDKs: `logos-sophia-sdk` and `logos-hermes-sdk` from logos foundry (git tags)
- Webapp vendors: `@logos/sophia-sdk` and `@logos/hermes-sdk` from `webapp/vendor/`

Apollo API port: **27000** (defined via `logos_config.ports`).

## Key Commands

### Python backend

```bash
poetry install                                   # install deps
poetry run apollo-api                            # start FastAPI on port 27000
poetry run apollo-cli                            # CLI entry point

# Lint & format
poetry run ruff check --fix .
poetry run ruff format .
poetry run mypy src/

# Test
poetry run pytest tests/                         # all tests
poetry run pytest tests/unit/                    # unit only (no services)
```

### React webapp

```bash
cd webapp && npm install                         # install deps
cd webapp && npm run dev                         # Vite dev server
cd webapp && VITE_MOCK_DATA_MODE=true npm run dev  # dev with mock data

# Lint & format
cd webapp && npm run lint
cd webapp && npm run lint:fix
cd webapp && npm run format

# Test
cd webapp && npm test                            # Vitest unit tests
cd webapp && npm run test:e2e                    # Playwright E2E
cd webapp && npm run type-check                  # tsc --noEmit

# Build
cd webapp && npm run build                       # tsc + vite build
```

---

## Architecture

```
apollo/
├── src/apollo/
│   ├── api/server.py        # FastAPI app — all REST + WebSocket endpoints
│   ├── cli/main.py          # Click CLI (apollo-cli)
│   ├── client/              # Typed clients for Sophia, Hermes, Persona
│   ├── config/settings.py   # Pydantic config (ApolloConfig, Neo4jConfig, etc.)
│   ├── data/
│   │   ├── hcg_client.py    # Neo4j HCG queries
│   │   ├── models.py        # Pydantic models (Entity, State, Process, etc.)
│   │   ├── persona_store.py # Persona diary storage
│   │   └── websocket_server.py  # Standalone WS server for HCG streaming
│   ├── sdk/                 # SDK wrappers (build_sophia_sdk, build_hermes_sdk)
│   └── env.py               # Environment helpers, port resolution
├── webapp/
│   ├── src/
│   │   ├── pages/           # Dashboard, Explorer
│   │   ├── components/      # ChatPanel, DiagnosticsPanel, GraphViewer,
│   │   │   │                  MediaUploadPanel, MediaLibraryPanel, PersonaDiary
│   │   │   └── hcg-explorer/  # HCG Explorer (Three.js 3D + Cytoscape 2D)
│   │   ├── hooks/           # useHCG, useWebSocket, useDiagnostics, etc.
│   │   ├── lib/             # API clients (sophia-client, hermes-client, etc.)
│   │   ├── fixtures/        # CWM mock data and types
│   │   └── types/           # TypeScript type definitions
│   └── vendor/              # Vendored @logos/sophia-sdk, @logos/hermes-sdk
├── tests/                   # Python tests (unit/, integration/)
├── examples/                # Usage demos
└── docs/                    # Design docs, API docs, plans
```

## Endpoints

All endpoints are defined in `src/apollo/api/server.py`.

### HCG (`/api/hcg/`)

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/hcg/health` | `HealthResponse` |
| GET | `/api/hcg/entities` | `List[Entity]` |
| GET | `/api/hcg/entities/{entity_id}` | `Entity` |
| GET | `/api/hcg/states` | `List[State]` |
| GET | `/api/hcg/processes` | `List[Process]` |
| GET | `/api/hcg/edges` | `List[CausalEdge]` |
| GET | `/api/hcg/plans` | `List[PlanHistory]` |
| GET | `/api/hcg/history` | `List[StateHistory]` |
| GET | `/api/hcg/snapshot` | `GraphSnapshot` |

### Chat (`/api/chat/`)

| Method | Path | Returns |
|--------|------|---------|
| POST | `/api/chat/stream` | SSE stream (proxies to Hermes LLM) |

### Diagnostics (`/api/diagnostics/`)

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/diagnostics/logs` | Recent diagnostic log entries |
| POST | `/api/diagnostics/llm` | Ingest LLM diagnostic metrics |
| GET | `/api/diagnostics/metrics` | Telemetry snapshot |

### Persona (`/api/persona/`)

| Method | Path | Returns |
|--------|------|---------|
| POST | `/api/persona/entries` | `PersonaEntry` (201) |
| GET | `/api/persona/entries` | `List[PersonaEntry]` |
| GET | `/api/persona/entries/{entry_id}` | `PersonaEntry` |

### Media (`/api/media/`)

| Method | Path | Returns |
|--------|------|---------|
| POST | `/api/media/upload` | Proxied upload to Hermes |
| GET | `/api/media/samples` | List media samples |
| GET | `/api/media/samples/{sample_id}` | Single sample |

### WebSocket

| Path | Purpose |
|------|---------|
| `/ws/diagnostics` | Real-time diagnostics logs + telemetry (heartbeat, message queue) |

---

## Frontend Components

### Pages
- **Dashboard** — tabbed view: Chat, Graph Viewer, Diagnostics, Persona Diary, Upload Media, Media Library
- **Explorer** — full-page HCG Explorer visualization

### HCG Explorer (`webapp/src/components/hcg-explorer/`)
Interactive graph visualization of Sophia's Hierarchical Causal Graph:
- **ThreeRenderer** — 3D force-directed layout using Three.js + @react-three/fiber
- **CytoscapeRenderer** — 2D directed-acyclic-graph layout using Cytoscape.js
- Semantic clustering via embedding service
- Temporal playback, entity filtering, search
- Falls back to mock data when API is unavailable (`VITE_MOCK_DATA_MODE`)

### Key libraries
- React 18, React Router, TanStack React Query
- Three.js / @react-three/fiber / @react-three/drei for 3D rendering
- Cytoscape.js + dagre for 2D graph layout
- D3 + d3-force-3d for force simulation

---

## Conventions & Gotchas

- **Ruff** for Python linting + formatting; **ESLint + Prettier** for webapp
- Config uses `logos_config` for port allocation — no config files needed
- Vendored webapp SDKs (`webapp/vendor/`) must be updated when foundry publishes new SDK versions
- `VITE_MOCK_DATA_MODE=true` runs the webapp without backend services
- WebSocket at `/ws/diagnostics` uses heartbeat and message queuing for connection management
- The standalone `websocket_server.py` (port 8765) is separate from the FastAPI WebSocket endpoint
- CLI commands (`apollo-cli`) mirror many API capabilities: status, state, send, plans, goal, plan, execute, simulate, embed, chat, diary
- Backward compatibility required unless explicitly breaking

## Docs

Documentation in `docs/`:
- `API_CLIENTS.md` — client configuration
- `AUTHENTICATION.md` — API key setup
- `HCG_DATA_LAYER.md` — Neo4j data access patterns
- `HERMES_SETUP.md` — Hermes integration
- `PERSONA_DIARY.md`, `PERSONA_LLM_INTEGRATION.md` — persona system
- `WEBSOCKET_PROTOCOL.md` — WebSocket protocol spec
- `TESTING.md` — test strategy and patterns
- `PROTOTYPE-WIRING.md` — end-to-end wiring guide
- `observability/` — OpenTelemetry setup
- `plans/` — design and implementation plans

## Issue Templates

| Template | Use For |
|----------|---------|
| `task.yml` | Apollo-specific tasks |
| `infrastructure-task.yml` | HCG, ontology, CI/CD (in logos repo) |
| `research-task.yml` | Research/investigation (in logos repo) |
| `documentation-task.yml` | Docs updates (in logos repo) |
