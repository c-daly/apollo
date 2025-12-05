#!/bin/bash
# E2E test runner script with convenience commands

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_COMPOSE_FILE="${SCRIPT_DIR}/stack/apollo/docker-compose.test.yml"
OVERLAY_COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.test.apollo.yml"
COMPOSE_ENV_FILE="${SCRIPT_DIR}/stack/apollo/.env.test"

# Port configuration (2xxxx prefix for apollo per LOGOS ecosystem standard)
NEO4J_HTTP_PORT="${NEO4J_HTTP_PORT:-27474}"
NEO4J_BOLT_PORT="${NEO4J_BOLT_PORT:-27687}"
SOPHIA_MOCK_PORT="${SOPHIA_MOCK_PORT:-28080}"
MILVUS_PORT="${MILVUS_PORT:-29530}"
MILVUS_METRICS_PORT="${MILVUS_METRICS_PORT:-29091}"

compose() {
    docker compose \
        --env-file "${COMPOSE_ENV_FILE}" \
        -f "${BASE_COMPOSE_FILE}" \
        -f "${OVERLAY_COMPOSE_FILE}" \
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
    echo -e "${BLUE}Starting E2E test services...${NC}"
    compose up -d
    
    echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
    sleep 5
    
    # Check Neo4j
    echo -n "Neo4j: "
    if compose exec -T neo4j cypher-shell -u neo4j -p neo4jtest "RETURN 1" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Ready${NC}"
    else
        echo -e "${RED}✗ Not ready${NC}"
    fi
    
    # Check Sophia
    echo -n "Sophia: "
    if curl -s -f "http://localhost:${SOPHIA_MOCK_PORT}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Ready${NC}"
    else
        echo -e "${RED}✗ Not ready${NC}"
    fi
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
    
    echo -n "Sophia (http://localhost:${SOPHIA_MOCK_PORT}): "
    if curl -s -f "http://localhost:${SOPHIA_MOCK_PORT}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
    else
        echo -e "${RED}✗ Unhealthy${NC}"
    fi
}

function run_test() {
    echo -e "${BLUE}Starting services...${NC}"
    start_services
    
    echo -e "${BLUE}Running E2E tests in container...${NC}"
    if compose run --rm test-runner; then
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
