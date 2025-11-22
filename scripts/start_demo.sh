#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "${PROJECT_ROOT}/.." && pwd)"
LOGOS_ROOT="${WORKSPACE_ROOT}/logos"
HERMES_ROOT="${WORKSPACE_ROOT}/hermes"
DOCKER_COMPOSE_FILE="${LOGOS_ROOT}/infra/docker-compose.hcg.dev.yml"
HERMES_PID_FILE="/tmp/hermes.pid"

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "[start_demo] OPENAI_API_KEY is not set. Export it before running this script." >&2
  exit 1
fi

if [[ ! -f "${DOCKER_COMPOSE_FILE}" ]]; then
  echo "[start_demo] Could not find docker compose file at ${DOCKER_COMPOSE_FILE}" >&2
  exit 1
fi

echo "[start_demo] Ensuring Neo4j/Milvus/SHACL containers are running..."
docker compose -f "${DOCKER_COMPOSE_FILE}" up -d neo4j milvus-standalone shacl-validation >/dev/null

if [[ ! -d "${HERMES_ROOT}" ]]; then
  echo "[start_demo] Hermes repo not found at ${HERMES_ROOT}" >&2
  exit 1
fi

if [[ -f "${HERMES_PID_FILE}" ]]; then
  if ! ps -p "$(cat "${HERMES_PID_FILE}")" >/dev/null 2>&1; then
    rm -f "${HERMES_PID_FILE}"
  fi
fi

if [[ ! -f "${HERMES_PID_FILE}" ]]; then
  echo "[start_demo] Launching Hermes on port 8080..."
  (
    cd "${HERMES_ROOT}"
    poetry install >/dev/null
    env OPENAI_API_KEY="${OPENAI_API_KEY}" nohup poetry run hermes >/tmp/hermes.log 2>&1 &
    echo $! > "${HERMES_PID_FILE}"
  )
else
  echo "[start_demo] Hermes already running (pid $(cat "${HERMES_PID_FILE}"))."
fi

echo "[start_demo] Starting Apollo API + webapp..."
cd "${PROJECT_ROOT}"
./scripts/run_apollo.sh
