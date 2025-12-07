#!/usr/bin/env bash
#
# Apollo Test Runner
#
# Unified test runner for unit, integration, and E2E tests.
# Handles environment setup, coverage reporting, and result formatting.
#
# Usage:
#   ./scripts/run_tests.sh [type] [options]
#
# Types:
#   unit        Run unit tests only (default, no external services)
#   integration Run integration tests (requires test stack)
#   e2e         Run E2E tests (uses docker-compose stack)
#   all         Run all test types
#   coverage    Run tests with coverage report
#
# Examples:
#   ./scripts/run_tests.sh                     # Run unit tests
#   ./scripts/run_tests.sh unit                # Run unit tests
#   ./scripts/run_tests.sh integration         # Run integration tests
#   ./scripts/run_tests.sh coverage            # Run with coverage
#   ./scripts/run_tests.sh unit -k "test_hcg"  # Run specific tests
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APOLLO_ROOT="${APOLLO_ROOT:-$(dirname "$SCRIPT_DIR")}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

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

# Check if test stack is running
check_stack() {
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "apollo-test-neo4j"; then
        return 0
    fi
    return 1
}

# Run unit tests
run_unit_tests() {
    log_header "Running Unit Tests"
    
    cd "$APOLLO_ROOT"
    
    local pytest_args=("tests/" "-m" "not integration" "-v")
    
    # Add any extra args passed to the script
    if [[ $# -gt 0 ]]; then
        pytest_args+=("$@")
    fi
    
    log_info "pytest ${pytest_args[*]}"
    poetry run pytest "${pytest_args[@]}"
}

# Run integration tests
run_integration_tests() {
    log_header "Running Integration Tests"
    
    # Check if stack is running
    if ! check_stack; then
        log_warn "Test stack not running. Starting it now..."
        "${SCRIPT_DIR}/test_stack.sh" up
    fi
    
    cd "$APOLLO_ROOT"
    
    # Export environment for integration tests
    export RUN_INTEGRATION_TESTS=1
    export NEO4J_URI="${NEO4J_URI:-bolt://localhost:${NEO4J_BOLT_PORT:-27687}}"
    export NEO4J_USER="${NEO4J_USER:-neo4j}"
    export NEO4J_PASSWORD="${NEO4J_PASSWORD:-neo4jtest}"
    export SOPHIA_HOST="${SOPHIA_HOST:-localhost}"
    export SOPHIA_PORT="${SOPHIA_PORT:-${LOGOS_SOPHIA_API_PORT:-48001}}"
    
    local pytest_args=("tests/integration/" "-v")
    
    # Add any extra args passed to the script
    if [[ $# -gt 0 ]]; then
        pytest_args+=("$@")
    fi
    
    log_info "pytest ${pytest_args[*]}"
    poetry run pytest "${pytest_args[@]}"
}

# Run E2E tests
run_e2e_tests() {
    log_header "Running E2E Tests"
    
    # Check if stack is running
    if ! check_stack; then
        log_warn "Test stack not running. Starting it now..."
        "${SCRIPT_DIR}/test_stack.sh" up
    fi
    
    cd "$APOLLO_ROOT"
    
    # Export environment for e2e tests
    export NEO4J_URI="${NEO4J_URI:-bolt://localhost:27687}"
    export NEO4J_USER="${NEO4J_USER:-neo4j}"
    export NEO4J_PASSWORD="${NEO4J_PASSWORD:-neo4jtest}"
    export SOPHIA_HOST="${SOPHIA_HOST:-localhost}"
    export SOPHIA_PORT="${SOPHIA_PORT:-${LOGOS_SOPHIA_API_PORT:-48001}}"
    export MILVUS_HOST="${MILVUS_HOST:-localhost}"
    export MILVUS_PORT="${MILVUS_PORT:-27530}"
    
    local pytest_args=("tests/e2e/" "-v" "-m" "e2e")
    
    # Add any extra args passed to the script
    if [[ $# -gt 0 ]]; then
        pytest_args+=("$@")
    fi
    
    log_info "pytest ${pytest_args[*]}"
    poetry run pytest "${pytest_args[@]}"
}

# Run tests with coverage
run_coverage() {
    log_header "Running Tests with Coverage"
    
    cd "$APOLLO_ROOT"
    
    local pytest_args=(
        "tests/"
        "-m" "not integration"
        "-v"
        "--cov=apollo"
        "--cov-report=term-missing"
        "--cov-report=xml"
        "--cov-report=html:htmlcov"
    )
    
    # Add any extra args passed to the script
    if [[ $# -gt 0 ]]; then
        pytest_args+=("$@")
    fi
    
    log_info "pytest ${pytest_args[*]}"
    poetry run pytest "${pytest_args[@]}"
    
    echo ""
    log_success "Coverage report generated"
    log_info "  Terminal: see above"
    log_info "  XML:      coverage.xml"
    log_info "  HTML:     htmlcov/index.html"
}

# Run all tests
run_all_tests() {
    log_header "Running All Tests"
    
    local failed=0
    
    # Unit tests
    if ! run_unit_tests; then
        log_error "Unit tests failed"
        ((failed++)) || true
    fi
    
    # Integration tests
    if ! run_integration_tests; then
        log_error "Integration tests failed"
        ((failed++)) || true
    fi
    
    echo ""
    if [[ $failed -eq 0 ]]; then
        log_success "All tests passed"
        return 0
    else
        log_error "$failed test suite(s) failed"
        return 1
    fi
}

# Usage
usage() {
    cat <<EOF
${BOLD}Apollo Test Runner${NC}

Usage: $0 [TYPE] [OPTIONS]

Types:
    unit        Run unit tests only (default, no external services)
    integration Run integration tests (requires test stack running)
    e2e         Run E2E tests (uses docker-compose stack)
    all         Run unit and integration tests
    coverage    Run unit tests with coverage reporting

Options:
    Any additional arguments are passed to pytest.

Examples:
    $0                           # Run unit tests
    $0 unit                      # Run unit tests
    $0 integration               # Run integration tests
    $0 coverage                  # Run with coverage
    $0 unit -k "test_hcg"        # Run specific tests
    $0 unit -x                   # Stop on first failure
    $0 unit --tb=short           # Short tracebacks

Prerequisites:
    Unit tests:        None (uses mocked dependencies)
    Integration tests: Test stack running (./scripts/test_stack.sh up)
    E2E tests:         Docker Compose available

Environment Variables:
    NEO4J_URI          Neo4j connection URI (default: bolt://localhost:27687)
    NEO4J_USER         Neo4j username (default: neo4j)
    NEO4J_PASSWORD     Neo4j password (default: neo4jtest)
    SOPHIA_HOST        Sophia mock host (default: localhost)
    SOPHIA_PORT        Sophia mock port (default: 28080)
EOF
}

# Main entry point
main() {
    local test_type="${1:-unit}"
    shift || true
    
    case "$test_type" in
        unit)
            run_unit_tests "$@"
            ;;
        integration|int)
            run_integration_tests "$@"
            ;;
        e2e)
            run_e2e_tests "$@"
            ;;
        all)
            run_all_tests "$@"
            ;;
        coverage|cov)
            run_coverage "$@"
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            # If it looks like a pytest option, assume unit tests
            if [[ "$test_type" == -* ]]; then
                run_unit_tests "$test_type" "$@"
            else
                log_error "Unknown test type: $test_type"
                echo ""
                usage
                exit 1
            fi
            ;;
    esac
}

main "$@"
