# Apollo CLI Prototype Wiring

This document captures how the modern Apollo CLI talks to Sophia and Hermes during the Phase 2 prototype push. The bespoke HTTP layer from Phase 1 has been removed—everything now flows through the generated Python SDKs so the CLI, browser, and automation suites share the same request/response contracts.

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

Execution (`apollo-cli execute`) remains informational in Phase 2 because the Talos executor is exposed elsewhere; the command warns users accordingly.

## Hermes Endpoints Used by the CLI

| CLI Command | SDK Call                       | HTTP Endpoint      |
|-------------|--------------------------------|--------------------|
| `embed`     | `DefaultApi.embed_text`        | `POST /embed_text` |

Additional Hermes endpoints (LLM generation, speech, etc.) are available via the same SDK but are not yet wired into the CLI.

## Configuration Path

1. `ApolloConfig.load()` reads `config.yaml`, environment overrides, or the built-in defaults.
2. `SophiaClient` and `HermesClient` pass the relevant `SophiaConfig` / `HermesConfig` sections to `build_sophia_sdk` / `build_hermes_sdk`.
3. API keys are assigned to the SDK `Configuration.access_token` field so Bearer auth is handled automatically.
4. Timeouts defined in config propagate to every SDK call through `_request_timeout`.

```
config.yaml
└── sophia.host / sophia.port / sophia.timeout / sophia.api_key
└── hermes.host / hermes.port / hermes.timeout / hermes.api_key
```

## Error Handling

- All SDK invocations run through `execute_sophia_call` / `execute_hermes_call`.
- Authentication failures, HTTP transport errors, and unexpected exceptions are normalized into the `ServiceResponse` structure.
- CLI commands simply check `response.success` and display either pretty-printed YAML data (already serialized from SDK models) or the standardized error message.

## Diary Command

`apollo-cli diary` targets the persona diary endpoints exposed by `apollo-api`, which now simply proxy to Sophia’s `/persona/entries` service. The CLI routes those requests through `PersonaClient`, returning `ServiceResponse` objects and reading host/API details from the `persona_api` config. Once the persona contract lands in the shared SDKs we can swap this helper for an auto-generated client, but callers already treat it just like Sophia/Hermes responses.

## Testing and Mocking

- Unit tests (`tests/test_client.py`) instantiate `SophiaClient`/`HermesClient` with default config; connection failures are surfaced via the shared response wrapper, so the tests do not need ad-hoc mocking.
- Integration/E2E suites can inject a mock `SophiaSDK`/`HermesSDK` instance when we need deterministic payloads (pass `sdk=` to the client constructor).
- Because the CLI relies solely on the generated packages, regenerating the SDK from the `logos` repo is the only step required when the API contract changes.

## Regenerating / Updating the Wiring

1. In the `logos` repository, run `./scripts/generate-sdks.sh` whenever `contracts/*.openapi.yaml` changes.
2. Update the `git+https://` dependency hashes in `pyproject.toml` here.
3. Run `poetry lock --no-update && poetry install`.
4. Re-run `pytest` and the manual CLI smoke to confirm the new contract works end-to-end.
