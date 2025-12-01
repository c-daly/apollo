#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "${PROJECT_ROOT}/.." && pwd)"
LOGOS_ROOT="${WORKSPACE_ROOT}/logos"
DOCKER_COMPOSE_FILE="${LOGOS_ROOT}/infra/docker-compose.hcg.dev.yml"
CONFIG_FILE="${PROJECT_ROOT}/config.yaml"
APOLLO_API_PID_FILE="/tmp/apollo-api.pid"
APOLLO_WEB_PID_FILE="/tmp/apollo-web.pid"

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
  if [[ -n "${API_PID:-}" ]]; then
    kill "${API_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${WEB_PID:-}" ]]; then
    kill "${WEB_PID}" >/dev/null 2>&1 || true
  fi
  rm -f "${APOLLO_API_PID_FILE}" "${APOLLO_WEB_PID_FILE}"
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
        
        APOLLO_PORT="${APOLLO_PORT:-8082}"
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
    log_info "API logs: /tmp/apollo-api.log"
    log_info "Web logs: /tmp/apollo-webapp.log"
else
    trap cleanup EXIT INT TERM
    
    echo ""
    log_success "Apollo stack is up:"
    echo "  • API logs: tail -f /tmp/apollo-api.log"
    echo "  • Webapp logs: tail -f /tmp/apollo-webapp.log"
    echo "  • UI: http://localhost:${WEBAPP_PORT:-3000}"
    echo ""
    echo "Press Ctrl+C to stop both services."
    
    wait $API_PID $WEB_PID
fi
