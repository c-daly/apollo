#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/../logos/infra/docker-compose.hcg.dev.yml"
CONFIG_FILE="${ROOT_DIR}/config.yaml"

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "[run_apollo] Missing config.yaml. Copy config.example.yaml and customize it first." >&2
  exit 1
fi

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "${API_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${WEB_PID:-}" ]]; then
    kill "${WEB_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cd "${ROOT_DIR}"

ensure_dependency_container() {
  local container_name=$1
  local service_name=$2

  if ! command -v docker >/dev/null 2>&1; then
    echo "[run_apollo] Docker not found; skipping autostart for ${service_name}. Start it manually if needed." >&2
    return
  fi

  if [[ ! -f "${COMPOSE_FILE}" ]]; then
    echo "[run_apollo] Compose file ${COMPOSE_FILE} not found; skipping autostart for ${service_name}." >&2
    return
  fi

  if docker ps --filter "name=${container_name}" --format '{{.Names}}' | grep -q "${container_name}"; then
    echo "[run_apollo] ${service_name} (${container_name}) already running; skipping."
    return
  fi

  echo "[run_apollo] Starting ${service_name} via docker compose..."
  docker compose -f "${COMPOSE_FILE}" up -d "${service_name}"
}

ensure_dependency_container "logos-hcg-neo4j" "neo4j"
ensure_dependency_container "logos-hcg-milvus" "milvus-standalone"

echo "[run_apollo] Installing Python deps via Poetry (if needed)..."
poetry install --sync >/dev/null

echo "[run_apollo] Starting apollo-api (FastAPI) on port 8082..."
poetry run apollo-api >/tmp/apollo-api.log 2>&1 &
API_PID=$!

cd "${ROOT_DIR}/webapp"
if [[ ! -d node_modules ]]; then
  echo "[run_apollo] Installing webapp dependencies..."
  npm install >/dev/null
fi

WEBAPP_PORT="${WEBAPP_PORT:-3000}"
echo "[run_apollo] Starting Vite dev server on port ${WEBAPP_PORT}..."
npm run dev -- --port "${WEBAPP_PORT}" >/tmp/apollo-webapp.log 2>&1 &
WEB_PID=$!

cd "${ROOT_DIR}"

echo ""
echo "[run_apollo] Apollo stack is up:"
echo "  • API logs: tail -f /tmp/apollo-api.log"
echo "  • Webapp logs: tail -f /tmp/apollo-webapp.log"
echo "  • UI: http://localhost:${WEBAPP_PORT}"
echo ""
echo "Press Ctrl+C to stop both services."

wait
