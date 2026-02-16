# Apollo OpenTelemetry Instrumentation

Apollo uses `logos_observability` (wrapping the OpenTelemetry SDK) to emit
traces from the REST API and CLI.

## API Endpoint Spans

| Endpoint | Span Name | Key Attributes |
|---|---|---|
| `GET /api/hcg/entities` | `apollo.api.hcg.entities` | `hcg.count` |
| `GET /api/hcg/snapshot` | `apollo.api.hcg.snapshot` | `hcg.entity_type`, `hcg.limit` |
| `POST /api/chat/stream` | `apollo.api.chat` | `chat.prompt_length`, `chat.provider`, `chat.model` |
| `POST /api/persona/entries` | `apollo.api.persona.create` | `persona.entry_type` |
| `POST /api/media/upload` | `apollo.api.media.upload` | `media.content_type`, `media.filename`, `media.size_bytes` |

FastAPI auto-instrumentation (`opentelemetry-instrumentation-fastapi`) also
creates HTTP-level spans for every request.

## CLI Command Spans

| Command | Span Name | Key Attributes |
|---|---|---|
| `apollo-cli goal` | `apollo.cli.goal` | `goal.description_length` |
| `apollo-cli plan` | `apollo.cli.plan` | `plan.goal` |
| `apollo-cli execute` | `apollo.cli.execute` | `execute.plan_id`, `execute.step` |
| `apollo-cli embed` | `apollo.cli.embed` | `embed.text_length` |
| `apollo-cli chat` | `apollo.cli.chat` | `chat.prompt_length` |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(none)_ | OTLP collector gRPC endpoint (e.g. `http://localhost:4317`) |
| `OTEL_SERVICE_NAME` | `apollo-api` / `apollo-cli` | Override the service name in exported traces |
| `OTEL_CONSOLE_EXPORT` | `false` | Set `true` to print spans to stdout (useful for debugging) |

When `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, spans are still created in-process
but are not exported to an external collector.

## Error Recording

Spans that encounter exceptions:
1. Set span status to `ERROR` with the exception message.
2. Record the exception via `span.record_exception(e)`, which adds an
   `exception` event with `exception.type`, `exception.message`, and
   `exception.stacktrace` attributes.

## Architecture Notes

- **API** initialises telemetry in the FastAPI lifespan and uses
  `FastAPIInstrumentor` for automatic HTTP-level spans.
- **CLI** initialises telemetry at module load time (before Click dispatches
  commands).
- **Browser-side OTel** (trace propagation from the frontend) is deferred to
  future work.
