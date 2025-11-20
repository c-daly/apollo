# Phase 2: Apollo Dual Surfaces Specification

## Overview

Phase 2 of Apollo introduces dual user surfaces: an enhanced CLI and a browser-based UI. Both interfaces consume a shared SDK generated from Sophia and Hermes OpenAPI specifications.

## Architecture

```
┌─────────────────────────────────────────┐
│         User Interfaces                  │
│  ┌──────────────┐   ┌────────────────┐  │
│  │   CLI Tool   │   │   Browser UI   │  │
│  │  (Terminal)  │   │  (React/Vite)  │  │
│  └──────┬───────┘   └────────┬───────┘  │
│         │                    │           │
│         └──────────┬─────────┘           │
│                    │                     │
└────────────────────┼─────────────────────┘
                     │
         ┌───────────▼──────────┐
         │   Shared SDK         │
         │  (TypeScript/Python) │
         │  Generated from      │
         │  OpenAPI Specs       │
         └───────────┬──────────┘
                     │
         ┌───────────▼──────────┐
         │   Sophia/Hermes      │
         │   REST APIs          │
         └──────────────────────┘
```

### Shared CWM State Envelope

Both Apollo surfaces consume the unified `CWMState` contract described in `logos/docs/phase2/PHASE2_SPEC.md`. Every `/state`, `/plan`, and `/simulate` response contains a `states` array whose elements follow the structure:

```json
{
  "state_id": "cwm_a_d7e1c2a7",
  "model_type": "CWM_A",
  "source": "orchestrator",
  "timestamp": "2025-11-20T04:15:00Z",
  "confidence": 0.92,
  "status": "observed",
  "links": {
    "plan_id": "plan_456",
    "entity_ids": ["entity_12"],
    "process_ids": ["proc_99"]
  },
  "tags": ["capability:perception"],
  "data": {
    "...": "model-specific payload"
  }
}
```

React diagnostics panes, CLI renderers, and persona diaries only switch on `model_type` to decide how to format `data`, ensuring CLI + browser stay in sync with Sophia/Hermes logs.

## Components

### 1. Shared SDK

**Purpose**: Provide type-safe, consistent API clients for both TypeScript (web) and Python (CLI).

**Generation**:
- Use `openapi-generator` for TypeScript client
- Use `openapi-generator` for Python client
- Source: OpenAPI 3.0 specifications for Sophia and Hermes

**Key Features**:
- Type definitions for all API models
- Request/response validation
- Error handling
- Authentication support

### 2. Enhanced CLI

**New Endpoints**:
- `/plan` - Plan generation with detailed steps
- `/state` - Enhanced state retrieval with graph data
- `/simulate` - Plan simulation and validation
- `/embed_text` - Text embedding for semantic search

**Structured Logging**:
All CLI commands output structured JSON logs for the diagnostics pipeline:
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "info",
  "command": "plan",
  "request": {...},
  "response": {...},
  "duration_ms": 1234
}
```

### 3. Browser UI (React + Vite)

#### 3.1 Chat Panel
- LLM-backed conversational interface
- Natural language command input
- Response streaming
- Command history

#### 3.2 Plan/Graph Viewer
- Interactive HCG visualization using Cytoscape
- Plan timeline view
- Node detail inspection
- Real-time updates

#### 3.3 Diagnostics Tabs

**Logs Tab**:
- Real-time log streaming
- Log level filtering
- Search and export

**Plan Timeline Tab**:
- Temporal view of plan execution
- Step-by-step progress
- Performance metrics

**Telemetry Tab**:
- System metrics
- API latency
- Resource usage

#### 3.4 Persona Diary
- Agent's internal state narrative
- Belief updates
- Decision explanations
- Temporal reasoning trace

### 4. Configuration

**Environment Variables** (`.env`):
```env
# Sophia API
VITE_SOPHIA_API_URL=http://localhost:8080
VITE_SOPHIA_API_KEY=<api_key>

# Hermes API
VITE_HERMES_API_URL=http://localhost:8081
VITE_HERMES_API_KEY=<api_key>

# Features
VITE_ENABLE_CHAT=true
VITE_ENABLE_DIAGNOSTICS=true
```

**Python CLI** (`.env` or `config.yaml`):
```yaml
sophia:
  api_url: http://localhost:8080
  api_key: ${SOPHIA_API_KEY}

hermes:
  api_url: http://localhost:8081
  api_key: ${HERMES_API_KEY}
```

### 5. CI/CD

**New Workflow**: `.github/workflows/phase2-apollo-web.yml`
- Lint web app
- Build web app
- Run web app tests
- Generate coverage reports

## API Endpoints

### Sophia Endpoints

#### POST /plan
Generate an execution plan for a goal.

**Request**:
```json
{
  "goal_id": "goal_123",
  "context": {},
  "constraints": []
}
```

**Response**:
```json
{
  "plan_id": "plan_456",
  "steps": [...],
  "estimated_duration": 300,
  "confidence": 0.95,
  "states": [
    {
      "state_id": "cwm_a_plan_456_summary",
      "model_type": "CWM_A",
      "status": "observed",
      "timestamp": "2025-11-20T04:12:00Z",
      "links": {
        "plan_id": "plan_456"
      },
      "data": {
        "entities": [...],
        "relations": [...],
        "validation": {
          "shacl_passed": true
        }
      }
    }
  ]
}
```

#### GET /state
Retrieve current agent state with HCG graph data.

**Response**:
```json
{
  "states": [
    {
      "state_id": "cwm_a_d7e1c2a7",
      "model_type": "CWM_A",
      "source": "orchestrator",
      "timestamp": "2025-11-20T04:15:00Z",
      "confidence": 0.92,
      "status": "observed",
      "links": {
        "entity_ids": ["entity_12"],
        "process_ids": ["proc_99"]
      },
      "tags": ["capability:actuation"],
      "data": {
        "entities": [...],
        "relations": [...],
        "validation": {
          "shacl_passed": true
        }
      }
    }
  ],
  "cursor": "opaque_state_cursor"
}
```

#### POST /simulate
Simulate plan execution without committing changes.

**Request**:
```json
{
  "plan_id": "plan_456",
  "context": {
    "state_ids": ["cwm_a_plan_456_summary"],
    "media_sample_id": "upload_17",
    "talos_metadata": null
  }
}
```

**Response**:
```json
{
  "simulation_id": "sim_789",
  "plan_id": "plan_456",
  "states": [
    {
      "state_id": "cwm_g_sim_plan_456_h3",
      "model_type": "CWM_G",
      "status": "imagined",
      "timestamp": "2025-11-20T04:13:00Z",
      "confidence": 0.76,
      "links": {
        "plan_id": "plan_456",
        "media_sample_id": "upload_17"
      },
      "data": {
        "imagined": true,
        "horizon_steps": 3,
        "frames": ["s3://...", "..."],
        "assumptions": ["talos_free_mode"]
      }
    }
  ],
  "issues": []
}
```

### Hermes Endpoints

#### POST /embed_text
Generate embeddings for text input.

**Request**:
```json
{
  "text": "Navigate to the kitchen",
  "model": "sentence-transformers"
}
```

**Response**:
```json
{
  "embedding": [0.1, 0.2, ..., 0.9],
  "dimension": 768
}
```

## Development Workflow

1. **Generate SDKs**:
   ```bash
   npm run generate:sdk
   ```

2. **Start Development Servers**:
   ```bash
   # Terminal 1: Sophia mock
   cd tests/e2e/mocks/sophia
   python sophia_mock.py

   # Terminal 2: Web app
   cd webapp
   npm run dev
   ```

3. **Run Tests**:
   ```bash
   # Python CLI
   pytest

   # Web app
   cd webapp
   npm test
   ```

## Migration from Phase 1

### CLI Changes
- Update `SophiaClient` to use generated SDK
- Add new command handlers for `/simulate` and `/embed_text`
- Implement structured logging

### Breaking Changes
- None - Phase 1 commands remain backward compatible
- New commands are additive

## Success Criteria

- ✅ TypeScript and Python SDKs generated from OpenAPI specs
- ✅ CLI commands use new SDK for all operations
- ✅ Browser UI renders all panels correctly
- ✅ Chat panel accepts and processes commands
- ✅ Graph viewer displays HCG structure
- ✅ Diagnostics show logs, timeline, and telemetry
- ✅ Persona diary shows agent reasoning
- ✅ Configuration via `.env` works
- ✅ CI workflow passes lint, build, and test

## Timeline

- **Week 1**: SDK generation and CLI updates
- **Week 2**: Browser UI foundation and chat panel
- **Week 3**: Graph viewer and diagnostics
- **Week 4**: Persona diary and CI/CD

## References

- [OpenAPI Specification](https://swagger.io/specification/)
- [openapi-generator](https://openapi-generator.tech/)
- [Cytoscape.js](https://js.cytoscape.org/)
- [React Query](https://tanstack.com/query/latest)
