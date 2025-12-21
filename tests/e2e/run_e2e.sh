#!/bin/bash
# E2E test runner script with convenience commands
#
# This script manages the full e2e test stack including Sophia.
# All services are started automatically - no need to run separate repos.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APOLLO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${APOLLO_ROOT}/containers/docker-compose.test.yml"
SOPHIA_OVERLAY="${APOLLO_ROOT}/containers/docker-compose.test.apollo.yml"
COMPOSE_ENV_FILE="${APOLLO_ROOT}/containers/.env.test"

# Port configuration (27xxx prefix for apollo per LOGOS ecosystem standard)
NEO4J_HTTP_PORT="${NEO4J_HTTP_PORT:-27474}"
NEO4J_BOLT_PORT="${NEO4J_BOLT_PORT:-27687}"
MILVUS_PORT="${MILVUS_PORT:-27530}"
MILVUS_METRICS_PORT="${MILVUS_METRICS_PORT:-27091}"

# Real Sophia uses 4xxxx ports (from sophia repo)
SOPHIA_PORT="${SOPHIA_PORT:-47000}"

compose() {
    docker compose \
        --env-file "${COMPOSE_ENV_FILE}" \
        -f "${COMPOSE_FILE}" \
        -f "${SOPHIA_OVERLAY}" \
        "$@"
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function print_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  test       Run the full E2E test suite (default)"
    echo "  up         Start services only"
    echo "  down       Stop and remove services"
    echo "  logs       Show service logs"
    echo "  seed       Seed test data"
    echo "  status     Check service status"
    echo "  clean      Clean up everything including volumes"
    echo "  help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                  # Run full test"
    echo "  $0 up              # Start services for manual testing"
    echo "  $0 logs            # View logs"
    echo "  $0 down            # Stop services"
}

function start_services() {
    echo -e "${BLUE}Starting E2E test services (Neo4j, Milvus, Sophia)...${NC}"
    compose up -d --build
    
    echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
    
    # Wait for Neo4j
    echo -n "Neo4j: "
    for i in {1..30}; do
        if compose exec -T neo4j cypher-shell -u neo4j -p neo4jtest "RETURN 1" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Ready${NC}"
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}✗ Not ready${NC}"
        fi
        sleep 2
    done
    
    # Wait for Sophia (part of our stack now)
    echo -n "Sophia: "
    for i in {1..30}; do
        if curl -s -f "http://localhost:${SOPHIA_PORT}/health" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Ready${NC}"
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}✗ Not ready${NC}"
        fi
        sleep 2
    done
}

function stop_services() {
    echo -e "${BLUE}Stopping E2E test services...${NC}"
    compose down
    echo -e "${GREEN}Services stopped${NC}"
}

function show_logs() {
    compose logs "$@"
}

function seed_data() {
    echo -e "${BLUE}Seeding test data...${NC}"
    export NEO4J_URI="bolt://localhost:${NEO4J_BOLT_PORT}"
    export NEO4J_USER=neo4j
    export NEO4J_PASSWORD=neo4jtest
    python "${SCRIPT_DIR}/seed_data.py"
}

function check_status() {
    echo -e "${BLUE}Service Status:${NC}"
    compose ps
    
    echo ""
    echo -e "${BLUE}Health Checks:${NC}"
    
    echo -n "Neo4j (bolt://localhost:${NEO4J_BOLT_PORT}): "
    if compose exec -T neo4j cypher-shell -u neo4j -p neo4jtest "RETURN 1" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
    else
        echo -e "${RED}✗ Unhealthy${NC}"
    fi
    
    echo -n "Sophia (http://localhost:${SOPHIA_PORT}): "
    if curl -s -f "http://localhost:${SOPHIA_PORT}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
    else
        echo -e "${RED}✗ Unhealthy${NC}"
    fi
}

function run_test() {
    echo -e "${BLUE}Starting services...${NC}"
    start_services
    
    echo -e "${BLUE}Running E2E tests...${NC}"
    
    # Run pytest directly on host (aligned with other LOGOS repos)
    cd "$SCRIPT_DIR/../.."
    if poetry run pytest tests/e2e/ -v -m "e2e"; then
        echo -e "${GREEN}✓ Tests passed${NC}"
        RESULT=0
    else
        echo -e "${RED}✗ Tests failed${NC}"
        RESULT=1
    fi
    
    echo -e "${BLUE}Stopping services...${NC}"
    stop_services
    
    return $RESULT
}

function clean_all() {
    echo -e "${YELLOW}Cleaning up all E2E test resources...${NC}"
    compose down -v
    echo -e "${GREEN}Cleanup complete${NC}"
}

# Main command handling
COMMAND="${1:-test}"

case "$COMMAND" in
    test)
        run_test
        ;;
    up)
        start_services
        ;;
    down)
        stop_services
        ;;
    logs)
        shift
        show_logs "$@"
        ;;
    seed)
        seed_data
        ;;
    status)
        check_status
        ;;
    clean)
        clean_all
        ;;
    help|--help|-h)
        print_usage
        ;;
    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        echo ""
        print_usage
        exit 1
        ;;
esac
