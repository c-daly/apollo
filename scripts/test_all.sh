#!/usr/bin/env bash
#
# Apollo Full Test Suite Runner
#
# Convenience script that runs the complete test suite:
# 1. Cleans up any existing test containers/ports
# 2. Starts the test stack (Neo4j, Milvus, Mock Sophia)
# 3. Runs unit tests
# 4. Runs integration tests
# 5. Cleans up everything
#
# Usage:
#   ./scripts/test_all.sh [options]
#
# Options:
#   --unit-only       Run only unit tests (no stack needed)
#   --no-cleanup      Don't clean up after tests (for debugging)
#   --coverage        Generate coverage report
#   -v, --verbose     Verbose pytest output
#   -x, --exitfirst   Stop on first failure
#
# Examples:
#   ./scripts/test_all.sh                    # Full test run
#   ./scripts/test_all.sh --unit-only        # Just unit tests
#   ./scripts/test_all.sh --coverage         # With coverage report
#   ./scripts/test_all.sh --no-cleanup       # Keep stack running after
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APOLLO_ROOT="${APOLLO_ROOT:-$(dirname "$SCRIPT_DIR")}"

# Port configuration (2xxxx prefix for apollo per LOGOS ecosystem standard)
NEO4J_HTTP_PORT="${NEO4J_HTTP_PORT:-27474}"
NEO4J_BOLT_PORT="${NEO4J_BOLT_PORT:-27687}"
SOPHIA_MOCK_PORT="${SOPHIA_MOCK_PORT:-28080}"
MILVUS_PORT="${MILVUS_PORT:-29530}"
MILVUS_METRICS_PORT="${MILVUS_METRICS_PORT:-29091}"

# Options
RUN_UNIT=true
RUN_INTEGRATION=true
CLEANUP=true
COVERAGE=false
PYTEST_EXTRA_ARGS=()

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_header() {
    echo ""
    echo -e "${BOLD}${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${CYAN}  $1${NC}"
    echo -e "${BOLD}${CYAN}════════════════════════════════════════════════════════════${NC}"
}

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

usage() {
    cat <<EOF
${BOLD}Apollo Full Test Suite Runner${NC}

Usage: $0 [OPTIONS]

Options:
    --unit-only       Run only unit tests (no stack needed)
    --integration-only Run only integration tests
    --no-cleanup      Don't clean up after tests (for debugging)
    --coverage        Generate coverage report
    -v, --verbose     Verbose pytest output
    -x, --exitfirst   Stop on first failure
    -k PATTERN        Only run tests matching pattern
    -h, --help        Show this help message

Examples:
    $0                           # Full test run with cleanup
    $0 --unit-only               # Just unit tests, no docker needed
    $0 --coverage                # Full run with coverage report
    $0 --no-cleanup              # Keep stack running for debugging
    $0 -k "test_hcg" -v          # Run specific tests verbosely
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --unit-only)
            RUN_INTEGRATION=false
            shift
            ;;
        --integration-only)
            RUN_UNIT=false
            shift
            ;;
        --no-cleanup)
            CLEANUP=false
            shift
            ;;
        --coverage)
            COVERAGE=true
            shift
            ;;
        -v|--verbose)
            PYTEST_EXTRA_ARGS+=("-v")
            shift
            ;;
        -x|--exitfirst)
            PYTEST_EXTRA_ARGS+=("-x")
            shift
            ;;
        -k)
            PYTEST_EXTRA_ARGS+=("-k" "$2")
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Track results
UNIT_RESULT=0
INTEGRATION_RESULT=0
START_TIME=$(date +%s)

# Cleanup function
cleanup() {
    if [[ "$CLEANUP" == "true" ]]; then
        log_header "Cleanup"
        "$SCRIPT_DIR/test_stack.sh" clean
    else
        log_warn "Skipping cleanup (--no-cleanup specified)"
        log_info "To clean up manually: ./scripts/test_stack.sh clean"
    fi
}

# Set trap to cleanup on exit (unless --no-cleanup)
trap cleanup EXIT

cd "$APOLLO_ROOT"

log_header "Apollo Test Suite"
echo ""
log_info "Unit tests:        $(if $RUN_UNIT; then echo "enabled"; else echo "disabled"; fi)"
log_info "Integration tests: $(if $RUN_INTEGRATION; then echo "enabled"; else echo "disabled"; fi)"
log_info "Coverage:          $(if $COVERAGE; then echo "enabled"; else echo "disabled"; fi)"
log_info "Cleanup:           $(if $CLEANUP; then echo "enabled"; else echo "disabled"; fi)"

# Step 1: Clean up any existing containers
log_header "Step 1: Cleanup Existing Containers"
"$SCRIPT_DIR/test_stack.sh" clean

# Step 2: Start test stack (if running integration tests)
if [[ "$RUN_INTEGRATION" == "true" ]]; then
    log_header "Step 2: Start Test Stack"
    "$SCRIPT_DIR/test_stack.sh" up
else
    log_header "Step 2: Start Test Stack"
    log_info "Skipped (unit tests only)"
fi

# Build pytest args
PYTEST_ARGS=("-v")
if [[ "$COVERAGE" == "true" ]]; then
    PYTEST_ARGS+=("--cov=apollo" "--cov-report=term-missing" "--cov-report=xml" "--cov-report=html:htmlcov")
fi
PYTEST_ARGS+=("${PYTEST_EXTRA_ARGS[@]}")

# Step 3: Run unit tests
if [[ "$RUN_UNIT" == "true" ]]; then
    log_header "Step 3: Run Unit Tests"
    
    if poetry run pytest tests/unit/ "${PYTEST_ARGS[@]}"; then
        log_success "Unit tests passed"
        UNIT_RESULT=0
    else
        log_error "Unit tests failed"
        UNIT_RESULT=1
    fi
else
    log_header "Step 3: Run Unit Tests"
    log_info "Skipped (--integration-only)"
fi

# Step 4: Run integration tests
if [[ "$RUN_INTEGRATION" == "true" ]]; then
    log_header "Step 4: Run Integration Tests"
    
    export RUN_INTEGRATION_TESTS=1
    export NEO4J_URI="bolt://localhost:${NEO4J_BOLT_PORT:-27687}"
    export NEO4J_USER="neo4j"
    export NEO4J_PASSWORD="neo4jtest"
    export SOPHIA_HOST="localhost"
    export SOPHIA_PORT="${SOPHIA_MOCK_PORT:-28080}"
    
    if poetry run pytest tests/integration/ "${PYTEST_ARGS[@]}"; then
        log_success "Integration tests passed"
        INTEGRATION_RESULT=0
    else
        log_error "Integration tests failed"
        INTEGRATION_RESULT=1
    fi
else
    log_header "Step 4: Run Integration Tests"
    log_info "Skipped (--unit-only)"
fi

# Calculate duration
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

# Summary
log_header "Test Summary"
echo ""

if [[ "$RUN_UNIT" == "true" ]]; then
    if [[ $UNIT_RESULT -eq 0 ]]; then
        echo -e "  Unit Tests:        ${GREEN}PASSED${NC}"
    else
        echo -e "  Unit Tests:        ${RED}FAILED${NC}"
    fi
fi

if [[ "$RUN_INTEGRATION" == "true" ]]; then
    if [[ $INTEGRATION_RESULT -eq 0 ]]; then
        echo -e "  Integration Tests: ${GREEN}PASSED${NC}"
    else
        echo -e "  Integration Tests: ${RED}FAILED${NC}"
    fi
fi

echo ""
echo -e "  Duration:          ${MINUTES}m ${SECONDS}s"

if [[ "$COVERAGE" == "true" ]]; then
    echo ""
    log_info "Coverage reports:"
    echo "    Terminal:  see above"
    echo "    XML:       coverage.xml"
    echo "    HTML:      htmlcov/index.html"
fi

echo ""

# Exit with failure if any tests failed
TOTAL_RESULT=$((UNIT_RESULT + INTEGRATION_RESULT))
if [[ $TOTAL_RESULT -eq 0 ]]; then
    log_success "All tests passed!"
    exit 0
else
    log_error "Some tests failed"
    exit 1
fi
