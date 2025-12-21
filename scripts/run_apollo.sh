#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "${PROJECT_ROOT}/.." && pwd)"
LOGOS_ROOT="${WORKSPACE_ROOT}/logos"
HERMES_ROOT="${WORKSPACE_ROOT}/hermes"
SOPHIA_ROOT="${WORKSPACE_ROOT}/sophia"
DOCKER_COMPOSE_FILE="${LOGOS_ROOT}/infra/docker-compose.hcg.dev.yml"
CONFIG_FILE="${PROJECT_ROOT}/config.yaml"
APOLLO_API_PID_FILE="/tmp/apollo-api.pid"
APOLLO_WEB_PID_FILE="/tmp/apollo-web.pid"
HERMES_PID_FILE="/tmp/hermes.pid"
SOPHIA_PID_FILE="/tmp/sophia.pid"

# Import common library
source "${PROJECT_ROOT}/scripts/lib/common.sh"

# Source .env if present
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  log_info "Sourcing .env file..."
  set -a
  source "${PROJECT_ROOT}/.env"
  set +a
fi

DETACH=false
SEED_DATA=false
for arg in "$@"; do
  case $arg in
    -d|--detach)
      DETACH=true
      ;;
    --seed)
      SEED_DATA=true
      ;;
  esac
done

cleanup() {
  log_info "Stopping Apollo services..."
  if [[ -n "${SOPHIA_PID:-}" ]]; then
    kill "${SOPHIA_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${HERMES_PID:-}" ]]; then
    kill "${HERMES_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${API_PID:-}" ]]; then
    kill "${API_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${WEB_PID:-}" ]]; then
    kill "${WEB_PID}" >/dev/null 2>&1 || true
  fi
  rm -f "${APOLLO_API_PID_FILE}" "${APOLLO_WEB_PID_FILE}" "${HERMES_PID_FILE}" "${SOPHIA_PID_FILE}"
}

start_sophia() {
    local status=$(get_pid_status "${SOPHIA_PID_FILE}")
    if [[ "$status" == "running"* ]]; then
        log_info "Sophia is already $status."
        SOPHIA_PID=$(cat "${SOPHIA_PID_FILE}")
    else
        if [[ "$status" == "stale pid file" ]]; then
            log_warn "Removing stale Sophia PID file."
            rm -f "${SOPHIA_PID_FILE}"
        fi
        
        SOPHIA_PORT="${SOPHIA_PORT:-47000}"
        # Token for authenticating incoming requests (matched by Hermes/Apollo)
        export SOPHIA_API_TOKEN="${SOPHIA_API_TOKEN:-sophia_dev}"
        log_info "Starting Sophia on port ${SOPHIA_PORT}..."
        
        cd "${SOPHIA_ROOT}"
        poetry install --sync >/dev/null 2>&1 || true

        if [ "$DETACH" = true ]; then
            SOPHIA_API_TOKEN="${SOPHIA_API_TOKEN}" nohup poetry run uvicorn sophia.api.app:app --host 0.0.0.0 --port "${SOPHIA_PORT}" >/tmp/sophia.log 2>&1 &
            SOPHIA_PID=$!
            echo $SOPHIA_PID > "${SOPHIA_PID_FILE}"
        else
            SOPHIA_API_TOKEN="${SOPHIA_API_TOKEN}" poetry run uvicorn sophia.api.app:app --host 0.0.0.0 --port "${SOPHIA_PORT}" >/tmp/sophia.log 2>&1 &
            SOPHIA_PID=$!
            echo $SOPHIA_PID > "${SOPHIA_PID_FILE}"
        fi
        cd "${PROJECT_ROOT}"
    fi
}

start_hermes() {
    local status=$(get_pid_status "${HERMES_PID_FILE}")
    if [[ "$status" == "running"* ]]; then
        log_info "Hermes is already $status."
        HERMES_PID=$(cat "${HERMES_PID_FILE}")
    else
        if [[ "$status" == "stale pid file" ]]; then
            log_warn "Removing stale Hermes PID file."
            rm -f "${HERMES_PID_FILE}"
        fi
        
        HERMES_PORT="${HERMES_PORT:-17000}"
        log_info "Starting Hermes on port ${HERMES_PORT}..."
        
        # Pass LLM API key to Hermes (provider-agnostic)
        export HERMES_LLM_API_KEY="${HERMES_LLM_API_KEY:-${OPENAI_API_KEY:-}}"
        # Token for Hermes→Sophia authentication (just needs to be present)
        export SOPHIA_API_KEY="${SOPHIA_API_KEY:-sophia_dev}"
        # Sophia connection settings
        export SOPHIA_HOST="${SOPHIA_HOST:-localhost}"
    export SOPHIA_PORT="${SOPHIA_PORT:-47000}"
        
        cd "${HERMES_ROOT}"
        poetry install --sync >/dev/null 2>&1 || true

        if [ "$DETACH" = true ]; then
            HERMES_PORT="${HERMES_PORT}" HERMES_LLM_API_KEY="${HERMES_LLM_API_KEY}" SOPHIA_API_KEY="${SOPHIA_API_KEY}" SOPHIA_HOST="${SOPHIA_HOST}" SOPHIA_PORT="${SOPHIA_PORT}" nohup poetry run python -m hermes.main >/tmp/hermes.log 2>&1 &
            HERMES_PID=$!
            echo $HERMES_PID > "${HERMES_PID_FILE}"
        else
            HERMES_PORT="${HERMES_PORT}" HERMES_LLM_API_KEY="${HERMES_LLM_API_KEY}" SOPHIA_API_KEY="${SOPHIA_API_KEY}" SOPHIA_HOST="${SOPHIA_HOST}" SOPHIA_PORT="${SOPHIA_PORT}" poetry run python -m hermes.main >/tmp/hermes.log 2>&1 &
            HERMES_PID=$!
            echo $HERMES_PID > "${HERMES_PID_FILE}"
        fi
        cd "${PROJECT_ROOT}"
    fi
}

start_api() {
    local status=$(get_pid_status "${APOLLO_API_PID_FILE}")
    if [[ "$status" == "running"* ]]; then
        log_info "Apollo API is already $status."
        API_PID=$(cat "${APOLLO_API_PID_FILE}")
    else
        if [[ "$status" == "stale pid file" ]]; then
            log_warn "Removing stale Apollo API PID file."
            rm -f "${APOLLO_API_PID_FILE}"
        fi
        
        APOLLO_PORT="${APOLLO_PORT:-27000}"
        log_info "Starting apollo-api (FastAPI) on port ${APOLLO_PORT}..."
        
        # Ensure poetry env is ready
        poetry install --sync >/dev/null

        if [ "$DETACH" = true ]; then
            nohup poetry run apollo-api >/tmp/apollo-api.log 2>&1 &
            API_PID=$!
            echo $API_PID > "${APOLLO_API_PID_FILE}"
        else
            poetry run apollo-api >/tmp/apollo-api.log 2>&1 &
            API_PID=$!
            echo $API_PID > "${APOLLO_API_PID_FILE}"
        fi
    fi
}

start_webapp() {
    local status=$(get_pid_status "${APOLLO_WEB_PID_FILE}")
    if [[ "$status" == "running"* ]]; then
        log_info "Apollo Webapp is already $status."
        WEB_PID=$(cat "${APOLLO_WEB_PID_FILE}")
    else
        if [[ "$status" == "stale pid file" ]]; then
            log_warn "Removing stale Apollo Webapp PID file."
            rm -f "${APOLLO_WEB_PID_FILE}"
        fi

        WEBAPP_PORT="${WEBAPP_PORT:-3000}"
        log_info "Starting Vite dev server on port ${WEBAPP_PORT}..."
        
        cd "${PROJECT_ROOT}/webapp"
        if [[ ! -d node_modules ]]; then
            log_info "Installing webapp dependencies..."
            npm install >/dev/null
        fi

        if [ "$DETACH" = true ]; then
            nohup npm run dev -- --port "${WEBAPP_PORT}" >/tmp/apollo-webapp.log 2>&1 &
            WEB_PID=$!
            echo $WEB_PID > "${APOLLO_WEB_PID_FILE}"
        else
            npm run dev -- --port "${WEBAPP_PORT}" >/tmp/apollo-webapp.log 2>&1 &
            WEB_PID=$!
            echo $WEB_PID > "${APOLLO_WEB_PID_FILE}"
        fi
        cd "${PROJECT_ROOT}"
    fi
}

# Main execution
cd "${PROJECT_ROOT}"

# Check infra (redundant if called from start_demo but good for standalone)
if [[ -f "${DOCKER_COMPOSE_FILE}" ]]; then
    log_info "Ensuring infra containers are up..."
    docker compose -f "${DOCKER_COMPOSE_FILE}" up -d neo4j milvus-standalone >/dev/null 2>&1 || true
fi

# Start in dependency order: Sophia → Hermes → Apollo
start_sophia
start_hermes
start_api
start_webapp

# Seed database if requested
if [ "$SEED_DATA" = true ]; then
    SEED_SCRIPT="${PROJECT_ROOT}/tests/e2e/seed_data.py"
    if [[ -f "$SEED_SCRIPT" ]]; then
        log_info "Seeding database..."
        sleep 3  # Give services a moment to initialize
        poetry run python "$SEED_SCRIPT" && log_success "Database seeded." || log_warn "Seed script failed."
    else
        log_warn "Seed script not found at $SEED_SCRIPT"
    fi
fi

if [ "$DETACH" = true ]; then
    log_success "Apollo stack started in background."
    log_info "Sophia logs: /tmp/sophia.log"
    log_info "Hermes logs: /tmp/hermes.log"
    log_info "API logs: /tmp/apollo-api.log"
    log_info "Web logs: /tmp/apollo-webapp.log"
else
    trap cleanup EXIT INT TERM
    
    echo ""
    log_success "Apollo stack is up:"
    echo "  • Sophia logs: tail -f /tmp/sophia.log"
    echo "  • Hermes logs: tail -f /tmp/hermes.log"
    echo "  • API logs: tail -f /tmp/apollo-api.log"
    echo "  • Webapp logs: tail -f /tmp/apollo-webapp.log"
    echo "  • Sophia: http://localhost:${SOPHIA_PORT:-47000}"
    echo "  • Hermes: http://localhost:${HERMES_PORT:-17000}"
    echo "  • API: http://localhost:${APOLLO_PORT:-27000}"
    echo "  • UI: http://localhost:${WEBAPP_PORT:-3000}"
    echo ""
    echo "Press Ctrl+C to stop all services."
    
    wait $SOPHIA_PID $HERMES_PID $API_PID $WEB_PID
fi
