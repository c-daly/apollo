# Apollo CLI Prototype Wiring

This document captures how the Apollo CLI talks to Sophia and Hermes. The bespoke HTTP layer has been removed—everything now flows through the generated Python SDKs so the CLI, browser, and automation suites share the same request/response contracts.

## Architecture

```
User ──► Apollo CLI commands
            │
            │ uses ServiceResponse helpers (src/apollo/sdk)
            ▼
logos_sophia_sdk / logos_hermes_sdk
            │
            ├── Sophia service (plan/state/simulate)
            │       │
            │       └── Hybrid Cognitive Graph (Neo4j + Milvus)
            │
            └── Hermes service (embeddings / LLM endpoints)
```

## Dual Surfaces Overview

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

The CLI and webapp share the same generated SDKs and request/response contracts,
so every surface interprets the same payloads and error semantics.

## Webapp Surface Overview

The webapp uses the same SDK-backed services as the CLI. It focuses on:
- **Chat**: Hermes `/llm` with persona context injection.
- **Graph Viewer**: HCG snapshot and entity inspection.
- **Diagnostics**: Logs, telemetry, and plan timeline via Apollo API.
- **Persona Diary**: Live updates from Neo4j-backed entries.

Configuration details live in the main README and `docs/API_CLIENTS.md`.

## Shared CWM State Envelope

Both CLI and web surfaces consume the same `CWMState` envelope so renderers can switch on `model_type` only:

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

Key points:

- `src/apollo/sdk/__init__.py` owns SDK construction, auth headers, and shared error handling. Both `SophiaClient` and `HermesClient` simply translate CLI arguments into SDK model instances.
- Every response inherits from `ServiceResponse`, which means CLI handlers, tests, and future APIs can rely on the same `success / data / error` schema.
- Configuration is centralized in `ApolloConfig`; host/port/API-key/timeout changes automatically feed the SDK `Configuration` objects.

## Sophia Endpoints Used by the CLI

| CLI Command(s)      | SDK Call                                        | HTTP Endpoint          |
|---------------------|-------------------------------------------------|------------------------|
| `status`            | `SystemApi.health_check`                        | `GET /health`          |
| `send`, `goal`, `plan` | `PlanningApi.create_plan` with different payloads | `POST /plan`           |
| `state`, `plans`    | `WorldModelApi.get_state` (cursor/limit filters) | `GET /state`           |
| `simulate`          | `PlanningApi.run_simulation`                    | `POST /simulate`       |

Execution (`apollo-cli execute`) remains informational because the Talos executor is exposed elsewhere; the command warns users accordingly.

## Hermes Endpoints Used by the CLI

| CLI Command | SDK Call                       | HTTP Endpoint      |
|-------------|--------------------------------|--------------------|
| `embed`     | `DefaultApi.embed_text`        | `POST /embed_text` |
| `chat`      | `DefaultApi.llm_generate`      | `POST /llm`        |

Speech/text-to-speech endpoints are still available via the same SDK but remain out of scope for this surface. The `apollo-cli chat` command shares its implementation with the browser chat panel: both compose metadata, inject persona diary context, and route responses/telemetry through Hermes + `/api/diagnostics/llm`.

## Configuration Path

1. `ApolloConfig.load()` reads `config.yaml`, environment overrides, or the built-in defaults.
2. `SophiaClient` and `HermesClient` pass the relevant `SophiaConfig` / `HermesConfig` sections to `build_sophia_sdk` / `build_hermes_sdk`.
3. API keys are assigned to the SDK `Configuration.access_token` field so Bearer auth is handled automatically.
4. Timeouts defined in config propagate to every SDK call through `_request_timeout`.

```
config.yaml
└── sophia.host / sophia.port / sophia.timeout / sophia.api_key
└── hermes.host / hermes.port / hermes.timeout / hermes.api_key / hermes.provider / hermes.model / hermes.temperature / hermes.max_tokens / hermes.system_prompt
```

## Error Handling

- All SDK invocations run through `execute_sophia_call` / `execute_hermes_call`.
- Authentication failures, HTTP transport errors, and unexpected exceptions are normalized into the `ServiceResponse` structure.
- CLI commands simply check `response.success` and display either pretty-printed YAML data (already serialized from SDK models) or the standardized error message.

## Diary Command

`apollo-cli diary` targets the persona diary endpoints exposed by `apollo-api`.
Those routes call into `PersonaDiaryStore`, which writes entries to Neo4j and
broadcasts them over the diagnostics WebSocket. The CLI routes requests through
`PersonaClient`, returning `ServiceResponse` objects and reading host/API details
from the `persona_api` config block. When the shared SDK picks up the persona
contract we can swap this helper for the generated client, but callers already
interact with it the same way as the Sophia/Hermes clients.

## Testing and Mocking

- Unit tests (`tests/test_client.py`) instantiate `SophiaClient`/`HermesClient` with default config; connection failures are surfaced via the shared response wrapper, so the tests do not need ad-hoc mocking.
- Integration/E2E suites can inject a mock `SophiaSDK`/`HermesSDK` instance when we need deterministic payloads (pass `sdk=` to the client constructor).
- Because the CLI relies solely on the generated packages, regenerating the SDK from the `logos` repo is the only step required when the API contract changes.

## Regenerating / Updating the Wiring

1. In the `logos` repository, run `./scripts/generate-sdks.sh` whenever `contracts/*.openapi.yaml` changes.
2. Update the `git+https://` dependency hashes in `pyproject.toml` here.
3. Run `poetry lock --no-update && poetry install`.
4. Re-run `pytest` and the manual CLI smoke to confirm the new contract works end-to-end.
