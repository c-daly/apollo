# Hermes Setup Guide

Hermes is the stateless LLM/embedding gateway for Project LOGOS. Apollo’s CLI and
webapp talk to Hermes via the `/llm`, `/embed_text`, and diagnostics endpoints, so
running Hermes with a real provider is the easiest way to get “production-like”
behavior locally.

## 1. Prerequisites

- Python 3.11+
- [Poetry](https://python-poetry.org/) 1.6+ (preferred) or a virtualenv with pip
- (Optional) Docker if you want Milvus persistence
- An API key for the upstream provider (OpenAI-compatible key for now)

## 2. Configure a Provider

Set the provider and credentials before launching Hermes. You can export them in
your shell or place them in a `.env` file that your process manager loads. When
pointing Hermes at OpenAI, the same `OPENAI_API_KEY` you already have in your
environment can be forwarded via `HERMES_LLM_API_KEY`.

```bash
export HERMES_LLM_PROVIDER=openai           # defaults to echo if omitted
export HERMES_LLM_API_KEY=sk-...
export HERMES_LLM_MODEL=gpt-4o-mini         # optional override
# Optional: point to a compatible gateway (Azure, self-hosted, etc.)
# export HERMES_LLM_BASE_URL=https://api.openai.com/v1
```

Hermes falls back to the deterministic `echo` provider if no credentials are
present, so double-check `/health` for the active provider if responses look
like loopbacks.

## 3. Start the Stack (Recommended)

Use the Apollo launcher script to start Sophia, Hermes, the Apollo API, and the webapp together:

```bash
./scripts/run_apollo.sh
```

Hermes will be available at `http://localhost:17000` by default. Override with `HERMES_PORT` if needed.

> **Tip:** If you need the ML-heavy endpoints (Whisper, TTS, embeddings), install
> the `ml` extras described in `hermes/README.md`. The `/llm` gateway only needs
> the lightweight dependencies, so the default `poetry install --with dev`
> remains fast.

You should see logs like:

```
INFO:hermes.main:Hermes API startup complete
INFO:     Uvicorn running on http://0.0.0.0:17000
```

Check health + provider:

```bash
curl http://localhost:17000/health
```

## 4. Point Apollo at Hermes

### Webapp `.env`

```env
VITE_HERMES_API_URL=http://localhost:17000
VITE_HERMES_API_KEY=                       # optional bearer token for Hermes
VITE_HERMES_TIMEOUT=30000
VITE_HERMES_LLM_PROVIDER=openai
VITE_HERMES_LLM_MODEL=gpt-4o-mini
VITE_HERMES_LLM_TEMPERATURE=0.2
VITE_HERMES_LLM_MAX_TOKENS=512
VITE_HERMES_SYSTEM_PROMPT=
```

### CLI `config.yaml`

```yaml
hermes:
  host: localhost
  port: 17000
  timeout: 30
  api_key: ""         # optional if Hermes itself is open
  provider: openai
  model: gpt-4o-mini
  temperature: 0.2
  max_tokens: 512
  system_prompt: ""
```

## 5. Run the Apollo Stack

1. Start Hermes (see above).
2. Launch Apollo’s API + webapp:

   ```bash
   cd ../apollo
   ./scripts/run_apollo.sh
   ```

3. Open `http://localhost:3000` (or the port you specified) and use the chat tab.

When you send a chat prompt now:

- The browser streams to Apollo’s `POST /api/chat/stream` endpoint. Apollo then
  calls Hermes `/llm` with your configured provider/model (OpenAI via
  `OPENAI_API_KEY`, Azure, etc.) and forwards chunks back to the UI.
- Apollo persists the response to the persona diary (`POST /api/persona/entries`)
  on your behalf, so Sophia’s Neo4j store keeps a record of the exchange without
  requiring the browser to make a second API call.
- Diagnostics telemetry reflects the real `/llm` latency and token usage because
  the server records metrics once the streamed response finishes.

To confirm Sophia storage, open the Persona Diary tab or query via:

```bash
curl "http://localhost:27000/api/persona/entries?limit=5" | jq
```

You should see the chat turns recorded as `observation` entries with metadata
that references the Hermes response IDs and provider details.
