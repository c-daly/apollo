#!/bin/bash
# E2E test runner script with convenience commands

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.e2e.yml"

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
    docker compose -f "${COMPOSE_FILE}" up -d
    
    echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
    sleep 5
    
    # Check Neo4j
    echo -n "Neo4j: "
    if docker compose -f "${COMPOSE_FILE}" exec -T neo4j cypher-shell -u neo4j -p testpassword "RETURN 1" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Ready${NC}"
    else
        echo -e "${RED}✗ Not ready${NC}"
    fi
    
    # Check Sophia
    echo -n "Sophia: "
    if curl -s -f http://localhost:8080/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Ready${NC}"
    else
        echo -e "${RED}✗ Not ready${NC}"
    fi
}

function stop_services() {
    echo -e "${BLUE}Stopping E2E test services...${NC}"
    docker compose -f "${COMPOSE_FILE}" down
    echo -e "${GREEN}Services stopped${NC}"
}

function show_logs() {
    docker compose -f "${COMPOSE_FILE}" logs "$@"
}

function seed_data() {
    echo -e "${BLUE}Seeding test data...${NC}"
    export NEO4J_URI=bolt://localhost:7687
    export NEO4J_USER=neo4j
    export NEO4J_PASSWORD=testpassword
    python "${SCRIPT_DIR}/seed_data.py"
}

function check_status() {
    echo -e "${BLUE}Service Status:${NC}"
    docker compose -f "${COMPOSE_FILE}" ps
    
    echo ""
    echo -e "${BLUE}Health Checks:${NC}"
    
    echo -n "Neo4j (bolt://localhost:7687): "
    if docker compose -f "${COMPOSE_FILE}" exec -T neo4j cypher-shell -u neo4j -p testpassword "RETURN 1" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
    else
        echo -e "${RED}✗ Unhealthy${NC}"
    fi
    
    echo -n "Sophia (http://localhost:8080): "
    if curl -s -f http://localhost:8080/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
    else
        echo -e "${RED}✗ Unhealthy${NC}"
    fi
}

function run_test() {
    echo -e "${BLUE}Running E2E test suite...${NC}"
    python "${SCRIPT_DIR}/test_e2e_flow.py"
}

function clean_all() {
    echo -e "${YELLOW}Cleaning up all E2E test resources...${NC}"
    docker compose -f "${COMPOSE_FILE}" down -v
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
