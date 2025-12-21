# Authentication & Service Configuration

This document explains how authentication flows between LOGOS services and the environment variables/configuration required to run the stack.

## Service Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Apollo Stack                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│   │   Webapp     │────▶│  Apollo API  │────▶│   Hermes     │                │
│   │  (port 3000) │     │ (port 27000) │     │ (port 17000) │                │
│   └──────────────┘     └──────┬───────┘     └──────┬───────┘                │
│                               │                     │                        │
│                               │  SOPHIA_API_KEY     │  SOPHIA_API_KEY        │
│                               │  (from config.yaml) │  (from env)            │
│                               ▼                     ▼                        │
│                        ┌─────────────────────────────┐                       │
│                        │          Sophia             │                       │
│                        │       (port 47000)          │                       │
│                        │                             │                       │
│                        │  Validates tokens against   │                       │
│                        │  SOPHIA_API_TOKEN env var   │                       │
│                        └─────────────────────────────┘                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Token Flow

### 1. Sophia (Token Validator)

Sophia reads `SOPHIA_API_TOKEN` from its environment and validates incoming `Authorization: Bearer <token>` headers against it.

```bash
# Sophia startup - MUST have this set
SOPHIA_API_TOKEN="sophia_dev" poetry run uvicorn sophia.api.app:app --host 0.0.0.0 --port 47000
```

**Without this token set, Sophia will return 500 errors on any authenticated endpoint.**

### 2. Hermes (Token Forwarder)

Hermes reads `SOPHIA_API_KEY` or `SOPHIA_API_TOKEN` from its environment and includes it in requests forwarded to Sophia (e.g., `/ingest/media`).

```bash
# Hermes startup
SOPHIA_API_KEY="sophia_dev" \
SOPHIA_HOST="localhost" \
SOPHIA_PORT="47000" \
poetry run python -m hermes.main
```

**Environment Variables for Hermes → Sophia:**

| Variable | Default | Description |
|----------|---------|-------------|
| `SOPHIA_API_KEY` | (none) | Token to send to Sophia (preferred) |
| `SOPHIA_API_TOKEN` | (none) | Alternative name for the token |
| `SOPHIA_HOST` | `localhost` | Sophia hostname |
| `SOPHIA_PORT` | `47000` | Sophia port (LOGOS offset default) |

### 3. Apollo API (Token Forwarder)

Apollo API reads Sophia credentials from `config.yaml` (preferred) or `SOPHIA_API_TOKEN` environment variable.

**config.yaml (recommended):**
```yaml
sophia:
  host: localhost
  port: 47000
  timeout: 30
  api_key: "sophia_dev"  # Must match Sophia's SOPHIA_API_TOKEN

hermes:
  host: localhost
  port: 17000
  timeout: 30
```

Apollo uses this token for:
- `/api/media/samples` → proxies to Sophia `/media/samples`
- `/api/media/samples/{id}` → proxies to Sophia `/media/samples/{id}`
- HCG operations (graph queries)

## Common Issues

### 403 Forbidden on Media Endpoints

**Symptom:**
```json
{"detail": "Sophia request failed: {\"detail\":\"Invalid authentication token\"}"}
```

**Cause:** Token mismatch between Apollo/Hermes and Sophia.

**Fix:** Ensure all services use the same token:
1. Sophia started with `SOPHIA_API_TOKEN="sophia_dev"`
2. Apollo `config.yaml` has `sophia.api_key: "sophia_dev"`
3. Hermes started with `SOPHIA_API_KEY="sophia_dev"`

### 500 Internal Server Error on Sophia

**Symptom:**
```
RuntimeError: SOPHIA_API_TOKEN environment variable must be set for authentication
```

**Cause:** Sophia was started without `SOPHIA_API_TOKEN`.

**Fix:** Restart Sophia with the token:
```bash
SOPHIA_API_TOKEN="sophia_dev" poetry run uvicorn sophia.api.app:app --port 47000
```

### 422 Unprocessable Entity on Media Upload

**Symptom:**
```json
{"detail": "Input should be 'image', 'video' or 'audio'", "input": "IMAGE"}
```

**Cause:** Media type case mismatch. Sophia expects lowercase (`image`), older code sent uppercase (`IMAGE`).

**Fix:** Use lowercase media types: `image`, `video`, `audio`.

### 503 Service Unavailable - Cannot Connect to Sophia

**Symptom:**
```json
{"detail": "Cannot connect to Sophia service: All connection attempts failed"}
```

**Cause:** Wrong `SOPHIA_PORT` (LOGOS default is 47000).

**Fix:** Set correct port:
```bash
SOPHIA_PORT="47000" poetry run hermes
```

## Quick Start: Full Stack with Auth

```bash
# Terminal 1: Start Sophia
cd sophia
SOPHIA_API_TOKEN="sophia_dev" poetry run uvicorn sophia.api.app:app --host 0.0.0.0 --port 47000

# Terminal 2: Start Hermes
cd hermes
SOPHIA_API_KEY="sophia_dev" SOPHIA_HOST="localhost" SOPHIA_PORT="47000" poetry run hermes

# Terminal 3: Start Apollo (reads from config.yaml)
cd apollo
# Ensure config.yaml has: sophia.api_key: "sophia_dev"
./scripts/run_apollo.sh
```

## Verification Commands

```bash
# Check Sophia is running and healthy
curl http://localhost:47000/health
# Expected: {"status":"healthy","components":{"neo4j":true,"milvus":true},...}

# Check Hermes is running
curl http://localhost:17000/health
# Expected: {"status":"degraded",...} (degraded is OK without ML services)

# Check Apollo API
curl http://localhost:27000/api/diagnostics/logs
# Expected: JSON array of log entries

# Test media upload (full chain)
curl -X POST http://localhost:27000/api/media/upload \
  -F "file=@test.png" \
  -F "media_type=image"
# Expected: {"sample_id":"ms_...","file_path":"media_storage/image/..."}

# Test media library retrieval
curl http://localhost:27000/api/media/samples
# Expected: {"samples":[...],"total":N,...}
```

## Configuration Files

### Apollo config.yaml

```yaml
sophia:
  host: localhost
  port: 47000
  timeout: 30
  api_key: "sophia_dev"  # MUST match Sophia's SOPHIA_API_TOKEN

hermes:
  host: localhost
  port: 17000
  timeout: 30

hcg:
  neo4j_uri: bolt://localhost:27687
  neo4j_user: neo4j
  neo4j_password: password
```

### run_apollo.sh Environment

The `scripts/run_apollo.sh` script sets these for Hermes:

```bash
export SOPHIA_API_KEY="${SOPHIA_API_KEY:-sophia_dev}"
export SOPHIA_HOST="${SOPHIA_HOST:-localhost}"
export SOPHIA_PORT="${SOPHIA_PORT:-47000}"
```

## Token Values

For development, use `sophia_dev` as the token value everywhere. This is a presence check only - Sophia validates that the token matches but doesn't enforce cryptographic security in dev mode.

**Production deployments should use strong, unique tokens and proper secrets management.**
