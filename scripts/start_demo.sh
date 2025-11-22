#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "${PROJECT_ROOT}/.." && pwd)"
LOGOS_ROOT="${WORKSPACE_ROOT}/logos"
HERMES_ROOT="${WORKSPACE_ROOT}/hermes"
DOCKER_COMPOSE_FILE="${LOGOS_ROOT}/infra/docker-compose.hcg.dev.yml"
HERMES_PID_FILE="/tmp/hermes.pid"
APOLLO_API_PID_FILE="/tmp/apollo-api.pid"
APOLLO_WEB_PID_FILE="/tmp/apollo-web.pid"

# Import common library
source "${PROJECT_ROOT}/scripts/lib/common.sh"

# Source .env if it exists
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  log_info "Sourcing .env file..."
  set -a
  source "${PROJECT_ROOT}/.env"
  set +a
fi

usage() {
    echo "Usage: $0 {start|status|stop}"
    exit 1
}

check_dependencies() {
    log_info "Checking dependencies..."
    check_command docker || exit 1
    check_command poetry || exit 1
    check_command npm || exit 1
    
    # Validate environment variables
    if ! python3 "${PROJECT_ROOT}/scripts/check_env.py"; then
        log_error "Environment validation failed."
        exit 1
    fi

    if [[ ! -f "${DOCKER_COMPOSE_FILE}" ]]; then
        log_error "Could not find docker compose file at ${DOCKER_COMPOSE_FILE}"
        exit 1
    fi

    if [[ ! -d "${HERMES_ROOT}" ]]; then
        log_error "Hermes repo not found at ${HERMES_ROOT}"
        exit 1
    fi
}

start_infra() {
    log_info "Ensuring Neo4j/Milvus/SHACL containers are running..."
    docker compose -f "${DOCKER_COMPOSE_FILE}" up -d neo4j milvus-standalone shacl-validation
}

start_hermes() {
    local status=$(get_pid_status "${HERMES_PID_FILE}")
    if [[ "$status" == "running"* ]]; then
        log_info "Hermes is already $status."
    else
        if [[ "$status" == "stale pid file" ]]; then
            log_warn "Removing stale Hermes PID file."
            rm -f "${HERMES_PID_FILE}"
        fi
        log_info "Launching Hermes on port 8080..."
        (
            cd "${HERMES_ROOT}"
            poetry install >/dev/null
            nohup poetry run hermes >/tmp/hermes.log 2>&1 &
            echo $! > "${HERMES_PID_FILE}"
        )
        log_success "Hermes started."
    fi
}

start_apollo() {
    log_info "Starting Apollo..."
    "${PROJECT_ROOT}/scripts/run_apollo.sh" --detach
}

show_status() {
    echo "=== LOGOS Demo Status ==="
    
    echo -n "Infra (Docker): "
    if docker compose -f "${DOCKER_COMPOSE_FILE}" ps --format '{{.State}}' | grep -q "running"; then
        echo -e "${GREEN}Running${NC}"
        docker compose -f "${DOCKER_COMPOSE_FILE}" ps --format "table {{.Name}}\t{{.State}}\t{{.Ports}}" | sed 's/^/  /'
    else
        echo -e "${RED}Not Running${NC}"
    fi

    echo -n "Hermes: "
    local h_status=$(get_pid_status "${HERMES_PID_FILE}")
    if [[ "$h_status" == "running"* ]]; then
        echo -e "${GREEN}$h_status${NC}"
    else
        echo -e "${RED}$h_status${NC}"
    fi

    echo -n "Apollo API: "
    local api_status=$(get_pid_status "${APOLLO_API_PID_FILE}")
    if [[ "$api_status" == "running"* ]]; then
        echo -e "${GREEN}$api_status${NC}"
    else
        # Fallback to port check if PID file missing but port open (e.g. started manually)
        if lsof -Pi :${APOLLO_PORT:-8082} -sTCP:LISTEN -t >/dev/null ; then
             echo -e "${GREEN}Running (Port ${APOLLO_PORT:-8082} open, no PID file)${NC}"
        else
             echo -e "${RED}$api_status${NC}"
        fi
    fi

    echo -n "Apollo Web: "
    local web_status=$(get_pid_status "${APOLLO_WEB_PID_FILE}")
    if [[ "$web_status" == "running"* ]]; then
        echo -e "${GREEN}$web_status${NC}"
    else
        if lsof -Pi :${WEBAPP_PORT:-3000} -sTCP:LISTEN -t >/dev/null ; then
             echo -e "${GREEN}Running (Port ${WEBAPP_PORT:-3000} open, no PID file)${NC}"
        else
             echo -e "${RED}$web_status${NC}"
        fi
    fi
}

stop_all() {
    log_info "Stopping all services..."
    
    if [[ -f "${HERMES_PID_FILE}" ]]; then
        local pid=$(cat "${HERMES_PID_FILE}")
        if ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid"
            log_success "Stopped Hermes ($pid)"
        fi
        rm -f "${HERMES_PID_FILE}"
    fi

    if [[ -f "${APOLLO_API_PID_FILE}" ]]; then
        local pid=$(cat "${APOLLO_API_PID_FILE}")
        if ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid"
            log_success "Stopped Apollo API ($pid)"
        fi
        rm -f "${APOLLO_API_PID_FILE}"
    fi

    if [[ -f "${APOLLO_WEB_PID_FILE}" ]]; then
        local pid=$(cat "${APOLLO_WEB_PID_FILE}")
        if ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid"
            log_success "Stopped Apollo Webapp ($pid)"
        fi
        rm -f "${APOLLO_WEB_PID_FILE}"
    fi
    
    # Cleanup orphans on ports
    local web_port="${WEBAPP_PORT:-3000}"
    if lsof -Pi :$web_port -sTCP:LISTEN -t >/dev/null ; then
        log_warn "Port $web_port still in use (orphan process?). Killing..."
        lsof -Pi :$web_port -sTCP:LISTEN -t | xargs kill
    fi

    local api_port="${APOLLO_PORT:-8082}"
    if lsof -Pi :$api_port -sTCP:LISTEN -t >/dev/null ; then
        log_warn "Port $api_port still in use (orphan process?). Killing..."
        lsof -Pi :$api_port -sTCP:LISTEN -t | xargs kill
    fi
    
    log_info "Stopping Docker infra..."
    docker compose -f "${DOCKER_COMPOSE_FILE}" stop
}

# Main logic
CMD=${1:-start}

case "$CMD" in
    start)
        check_dependencies
        start_infra
        start_hermes
        start_apollo
        ;;
    status)
        show_status
        ;;
    stop)
        stop_all
        ;;
    *)
        usage
        ;;
esac
