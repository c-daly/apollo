#!/usr/bin/env bash
#
# Apollo Test Stack Manager
#
# Manages the full test stack (Neo4j, Milvus, Sophia) for Apollo testing.
# All services are started together - no need to run separate repos.
# Handles port conflicts, cleanup, and provides consistent environment for tests.
#
# Usage:
#   ./scripts/test_stack.sh [command]
#
# Commands:
#   up        Start test infrastructure
#   down      Stop and remove containers  
#   status    Show service health status
#   clean     Stop services and remove volumes
#   logs      Show container logs
#   ports     Check and display port availability
#   restart   Stop and start services
#   run       Start stack, run tests, stop stack
#
# Examples:
#   ./scripts/test_stack.sh up          # Start services
#   ./scripts/test_stack.sh status      # Check health
#   ./scripts/test_stack.sh run         # Full test run
#   ./scripts/test_stack.sh clean       # Full cleanup
#

set -euo pipefail

# Determine repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APOLLO_ROOT="${APOLLO_ROOT:-$(dirname "$SCRIPT_DIR")}"
export APOLLO_ROOT

# Stack configuration
STACK_DIR="${APOLLO_ROOT}/tests/e2e/stack/apollo"
COMPOSE_FILE="${STACK_DIR}/docker-compose.test.yml"
SOPHIA_OVERLAY="${APOLLO_ROOT}/tests/e2e/docker-compose.test.apollo.yml"
ENV_FILE="${STACK_DIR}/.env.test"

# Load environment from .env.test if it exists
if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

# Apollo uses 27xxx port range (consistent prefix) to avoid conflicts with other LOGOS repos
# These match the docker-compose.test.yml configuration
# Sophia is included via docker-compose.test.sophia.yml overlay
NEO4J_HTTP_PORT="${NEO4J_HTTP_PORT:-27474}"
NEO4J_BOLT_PORT="${NEO4J_BOLT_PORT:-27687}"
MILVUS_PORT="${MILVUS_PORT:-27530}"
MILVUS_HEALTH_PORT="${MILVUS_HEALTH_PORT:-27091}"
MINIO_PORT="${MINIO_PORT:-27900}"
MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-27901}"

NEO4J_CONTAINER="${NEO4J_CONTAINER:-apollo-test-neo4j}"
MILVUS_CONTAINER="${MILVUS_CONTAINER:-apollo-test-milvus}"

NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-neo4jtest}"

HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

# Export for child processes
export NEO4J_HTTP_PORT NEO4J_BOLT_PORT MILVUS_PORT MILVUS_HEALTH_PORT
export NEO4J_CONTAINER MILVUS_CONTAINER
export NEO4J_USER NEO4J_PASSWORD

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Port configuration as arrays (more portable than associative arrays)
PORT_LABELS=(
    "Neo4j HTTP"
    "Neo4j Bolt"
    "Milvus gRPC"
    "Milvus Health"
    "MinIO"
    "MinIO Console"
)

PORT_VALUES=(
    "$NEO4J_HTTP_PORT"
    "$NEO4J_BOLT_PORT"
    "$MILVUS_PORT"
    "$MILVUS_HEALTH_PORT"
    "$MINIO_PORT"
    "$MINIO_CONSOLE_PORT"
)

# Logging helpers
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_header() {
    echo ""
    echo -e "${BOLD}${CYAN}$1${NC}"
    echo -e "${CYAN}$(printf '=%.0s' {1..50})${NC}"
}

# Docker compose wrapper (includes Sophia overlay)
compose() {
    docker compose \
        --env-file "$ENV_FILE" \
        -f "$COMPOSE_FILE" \
        -f "$SOPHIA_OVERLAY" \
        "$@"
}

# Check if docker is available
check_docker() {
    if ! command -v docker &>/dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    if ! docker info &>/dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
}

# Check if a port is in use
check_port_in_use() {
    local port=$1
    if command -v ss >/dev/null 2>&1; then
        if ss -tulpn 2>/dev/null | grep -q ":${port} "; then
            return 0
        fi
    elif command -v lsof >/dev/null 2>&1; then
        if lsof -i ":${port}" >/dev/null 2>&1; then
            return 0
        fi
    elif command -v netstat >/dev/null 2>&1; then
        if netstat -tuln 2>/dev/null | grep -q ":${port} "; then
            return 0
        fi
    fi
    return 1
}

# Get process/container using a port
get_port_user() {
    local port=$1
    # First check if it's a docker container
    local container
    container=$(docker ps --format '{{.Names}}' --filter "publish=${port}" 2>/dev/null | head -1)
    if [[ -n "$container" ]]; then
        echo "container: $container"
        return
    fi
    # Try lsof (may require elevated permissions)
    if command -v lsof >/dev/null 2>&1; then
        local pid
        pid=$(lsof -i ":${port}" -t 2>/dev/null | head -1)
        if [[ -n "$pid" ]]; then
            echo "PID: $pid"
            return
        fi
    fi
    echo ""
}
# Find and stop containers using specific ports
stop_containers_on_ports() {
    log_info "Checking for containers using test ports..."
    local found=0
    
    for i in "${!PORT_LABELS[@]}"; do
        local label="${PORT_LABELS[$i]}"
        local port="${PORT_VALUES[$i]}"
        local container
        container=$(docker ps --format '{{.ID}} {{.Names}}' --filter "publish=${port}" 2>/dev/null | head -1)
        if [[ -n "$container" ]]; then
            local cid="${container%% *}"
            local cname="${container#* }"
            log_warn "Stopping container '$cname' using port ${port} (${label})..."
            docker stop "$cid" 2>/dev/null || true
            found=1
        fi
    done
    
    if [[ $found -eq 0 ]]; then
        log_info "No conflicting containers found"
    fi
}

# Check all test ports
cmd_ports() {
    log_header "Apollo Test Port Status"
    
    local conflicts=0
    for i in "${!PORT_LABELS[@]}"; do
        local label="${PORT_LABELS[$i]}"
        local port="${PORT_VALUES[$i]}"
        printf "  %-18s (port %s): " "$label" "$port"
        if check_port_in_use "$port"; then
            local user
            user=$(get_port_user "$port")
            if [[ -n "$user" ]]; then
                echo -e "${YELLOW}IN USE${NC} ($user)"
            else
                echo -e "${YELLOW}IN USE${NC}"
            fi
            conflicts=$((conflicts + 1))
        else
            echo -e "${GREEN}FREE${NC}"
        fi
    done
    
    echo ""
    if [[ $conflicts -gt 0 ]]; then
        log_warn "$conflicts port(s) in use. Run '$0 clean' or stop conflicting services."
        return 1
    else
        log_success "All ports are available"
        return 0
    fi
}


# Get container ID for a service
container_id() {
    local service=$1
    compose ps -q "$service" 2>/dev/null | head -n1
}

# Get container display name
container_display_name() {
    local container=$1
    docker inspect -f '{{.Name}}' "$container" 2>/dev/null | sed 's#^/##' || echo "$container"
}

# Wait for a container to be healthy
wait_for_container() {
    local service=$1
    local container=$2
    local display_name=${3:-$2}
    local deadline=$((SECONDS + HEALTH_TIMEOUT))
    
    while (( SECONDS < deadline )); do
        local status
        status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo "unknown")
        
        case "$status" in
            healthy)
                log_success "$service ($display_name) is healthy"
                return 0
                ;;
            running)
                # Container running but no healthcheck defined
                log_success "$service ($display_name) is running"
                return 0
                ;;
            unhealthy)
                log_error "$service ($display_name) is unhealthy"
                docker logs "$container" --tail=50 2>&1 || true
                return 1
                ;;
            starting)
                echo -n "."
                ;;
            *)
                log_warn "$service status: $status"
                ;;
        esac
        sleep 3
    done
    
    log_error "$service did not become healthy within ${HEALTH_TIMEOUT}s"
    docker logs "$container" --tail=50 2>&1 || true
    return 1
}

# Start all services
cmd_up() {
    check_docker
    log_header "Starting Apollo Test Stack"
    
    # Check and handle port conflicts
    stop_containers_on_ports
    
    # Bring down any existing containers from previous runs
    compose down 2>/dev/null || true
    
    log_info "Starting services..."
    if ! compose up -d; then
        log_error "Failed to start services"
        compose logs --tail=50 2>&1 || true
        return 1
    fi
    
    echo ""
    log_info "Waiting for services to become healthy..."
    echo -n "  "
    
    local services=("neo4j" "milvus")
    local failed=0
    
    for service in "${services[@]}"; do
        local cid
        cid=$(container_id "$service")
        if [[ -z "$cid" ]]; then
            log_error "Container for '$service' not found"
            ((failed++)) || true
            continue
        fi
        local display_name
        display_name=$(container_display_name "$cid")
        if ! wait_for_container "$service" "$cid" "$display_name"; then
            ((failed++)) || true
        fi
    done
    
    echo ""
    if [[ $failed -eq 0 ]]; then
        log_success "All local services are ready"
        echo ""
        log_info "Service endpoints:"
        echo "  Neo4j Browser: http://localhost:${NEO4J_HTTP_PORT}"
        echo "  Neo4j Bolt:    bolt://localhost:${NEO4J_BOLT_PORT}"
        echo "  Milvus:        localhost:${MILVUS_PORT}"
        
        # Check if Sophia is available (part of our stack)
        echo ""
        local sophia_port="${SOPHIA_PORT:-${LOGOS_SOPHIA_API_PORT:-48001}}"
        if curl -sf "http://localhost:${sophia_port}/health" &>/dev/null; then
            log_success "Sophia is available at http://localhost:${sophia_port}"
        else
            log_error "Sophia is NOT available at http://localhost:${sophia_port}"
            echo ""
            echo "  Sophia should be running as part of the test stack."
            echo "  Check logs: $0 logs sophia"
            return 1
        fi
        return 0
    else
        log_error "$failed service(s) failed to start"
        return 1
    fi
}

# Stop services
cmd_down() {
    log_header "Stopping Apollo Test Stack"
    
    compose down 2>/dev/null || true
    log_success "Services stopped"
}

# Full cleanup including volumes
cmd_clean() {
    log_header "Cleaning Apollo Test Stack"
    
    log_info "Stopping containers and removing volumes..."
    compose down -v 2>/dev/null || true
    
    # Also stop any orphaned containers on test ports
    stop_containers_on_ports
    
    log_success "Cleanup complete"
}

# Show logs
cmd_logs() {
    shift || true
    if [[ $# -eq 0 ]]; then
        compose logs --follow
    else
        compose logs --follow "$@"
    fi
}

# Show status
cmd_status() {
    log_header "Apollo Test Stack Status"
    
    echo ""
    echo "Container Status:"
    compose ps 2>/dev/null || echo "  No containers running"
    
    echo ""
    echo "Health Checks:"
    
    # Neo4j
    printf "  %-15s " "Neo4j:"
    if docker exec "$NEO4J_CONTAINER" cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "RETURN 1" &>/dev/null; then
        echo -e "${GREEN}healthy${NC} (bolt://localhost:${NEO4J_BOLT_PORT})"
    else
        echo -e "${RED}unhealthy${NC}"
    fi
    
    # Milvus
    printf "  %-15s " "Milvus:"
    if curl -sf "http://localhost:${MILVUS_HEALTH_PORT}/healthz" &>/dev/null; then
        echo -e "${GREEN}healthy${NC} (localhost:${MILVUS_PORT})"
    else
        echo -e "${RED}unhealthy${NC}"
    fi
    
    # Sophia (part of the stack via overlay)
    local sophia_port="${SOPHIA_PORT:-${LOGOS_SOPHIA_API_PORT:-48001}}"
    printf "  %-15s " "Sophia:"
    if curl -sf "http://localhost:${sophia_port}/health" &>/dev/null; then
        echo -e "${GREEN}healthy${NC} (http://localhost:${sophia_port})"
    else
        echo -e "${RED}unhealthy${NC}"
    fi
}

# Restart services
cmd_restart() {
    cmd_down
    cmd_up
}

# Seed test data
cmd_seed() {
    log_header "Seeding Test Data"
    
    local seed_script="${APOLLO_ROOT}/tests/e2e/seed_data.py"
    if [[ ! -f "$seed_script" ]]; then
        log_error "Seed script not found: $seed_script"
        return 1
    fi
    
    log_info "Running seed script..."
    export NEO4J_URI="bolt://localhost:${NEO4J_BOLT_PORT}"
    export NEO4J_USER
    export NEO4J_PASSWORD
    
    cd "$APOLLO_ROOT"
    poetry run python "$seed_script"
    log_success "Test data seeded"
}

# Run tests with stack management
cmd_run() {
    log_header "Apollo Integration Test Run"
    
    local test_result=0
    
    # Start services
    if ! cmd_up; then
        log_error "Failed to start test stack"
        return 1
    fi
    
    # Optionally seed data
    if [[ -f "${APOLLO_ROOT}/tests/e2e/seed_data.py" ]]; then
        cmd_seed || true
    fi
    
    # Run integration tests
    log_info "Running integration tests..."
    export NEO4J_URI="bolt://localhost:${NEO4J_BOLT_PORT}"
    export NEO4J_USER
    export NEO4J_PASSWORD
    export SOPHIA_HOST="localhost"
    export SOPHIA_PORT="${SOPHIA_PORT:-48001}"  # Real Sophia service port (tests skip if unavailable)
    export RUN_INTEGRATION_TESTS=1
    
    cd "$APOLLO_ROOT"
    if poetry run pytest tests/integration/ -v; then
        log_success "Tests passed"
    else
        log_error "Tests failed"
        test_result=1
    fi
    
    # Stop services
    cmd_down
    
    return $test_result
}

# Usage
usage() {
    cat <<EOF
${BOLD}Apollo Test Stack Manager${NC}

Usage: $0 [COMMAND]

Commands:
    up        Start test infrastructure (Neo4j, Milvus)
    down      Stop and remove containers
    status    Show service health status
    clean     Stop services and remove volumes (full cleanup)
    logs      Show container logs (optionally specify service)
    ports     Check and display port availability
    restart   Stop and start services
    seed      Seed test data into Neo4j
    run       Start stack, run integration tests, stop stack
    help      Show this help message

Port Configuration (Apollo uses 27xxx/29xxx range):
    Neo4j:  ${NEO4J_HTTP_PORT} (http), ${NEO4J_BOLT_PORT} (bolt)
    Milvus: ${MILVUS_PORT} (grpc), ${MILVUS_HEALTH_PORT} (health)
    MinIO:  ${MINIO_PORT}, ${MINIO_CONSOLE_PORT}
    Sophia: 48001 (ghcr.io/c-daly/sophia:latest)

Examples:
    $0 up              # Start services for manual testing
    $0 status          # Check health of all services
    $0 logs neo4j      # View Neo4j logs
    $0 run             # Full test run with automatic cleanup
    $0 clean           # Stop everything and clean volumes

Environment Variables:
    HEALTH_TIMEOUT     Seconds to wait for services (default: 120)
    APOLLO_ROOT        Override repository root detection
EOF
}

# Main entry point
main() {
    local command="${1:-help}"
    
    case "$command" in
        up|start)
            cmd_up
            ;;
        down|stop)
            cmd_down
            ;;
        status)
            cmd_status
            ;;
        clean)
            cmd_clean
            ;;
        logs)
            cmd_logs "$@"
            ;;
        ports)
            cmd_ports
            ;;
        restart)
            cmd_restart
            ;;
        seed)
            cmd_seed
            ;;
        run|test)
            cmd_run
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            usage
            exit 1
            ;;
    esac
}

main "$@"
