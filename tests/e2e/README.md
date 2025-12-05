# E2E Functional Tests

This directory contains end-to-end (E2E) functional tests for Apollo.

## Overview

The E2E tests validate complete system integration using pytest:

- **Infrastructure tests**: Verify Neo4j, Milvus, and Sophia are healthy
- **CLI tests**: Test Apollo CLI commands against real services
- **API tests**: Test Apollo backend API endpoints
- **Workflow tests**: End-to-end scenarios (goal -> plan -> execute -> verify)

All services are **required** for integration/E2E tests. Tests will **fail** 
(not skip) if any service is unavailable. The test stack is responsible for
ensuring all services are running.

## Quick Start

```bash
# Start sophia's test stack first (required):
cd ../sophia && ./scripts/test_stack.sh up && cd ../apollo

# Start Apollo's test stack (Neo4j, Milvus) - will check for Sophia
./scripts/test_stack.sh up

# Run e2e tests
./scripts/run_tests.sh e2e

# Run specific test file
poetry run pytest tests/e2e/test_infrastructure.py -v

# Run with markers
poetry run pytest tests/e2e/ -m "requires_neo4j" -v
poetry run pytest tests/e2e/ -m "requires_sophia" -v
```

## Test Files

| File | Description |
|------|-------------|
| `conftest.py` | Pytest fixtures and configuration |
| `test_infrastructure.py` | Service health checks |
| `test_cli_e2e.py` | CLI command tests |
| `test_api_e2e.py` | Backend API tests |
| `test_e2e_flow.py` | Legacy monolithic flow test |

## Prerequisites

- Docker and Docker Compose
- Python 3.9+
- Apollo installed: `pip install -e .` from repository root

## Docker Services

All services are **required** for E2E tests (tests fail if unavailable):

- **Neo4j**: Graph database for HCG (ports via NEO4J_HTTP_PORT/NEO4J_BOLT_PORT)
- **Milvus**: Vector database (ports via MILVUS_PORT/MILVUS_HEALTH_PORT)
- **Sophia**: From sophia repo (port via SOPHIA_PORT) - must be started separately

## Test Markers

- `@pytest.mark.e2e` - All e2e tests
- `@pytest.mark.requires_neo4j` - Tests requiring Neo4j
- `@pytest.mark.requires_sophia` - Tests requiring Sophia
- `@pytest.mark.requires_milvus` - Tests requiring Milvus
- `@pytest.mark.slow` - Long-running tests

## Environment Variables

Override service endpoints:

```bash
export NEO4J_URI=bolt://localhost:${NEO4J_BOLT_PORT:-27687}
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=neo4jtest
export SOPHIA_HOST=localhost
export SOPHIA_PORT=${LOGOS_SOPHIA_API_PORT:-48001}
export MILVUS_HOST=localhost
export MILVUS_PORT=${MILVUS_PORT:-29530}
```

## Legacy Components

The original monolithic test flow is still available:

- `run_e2e.sh` - Legacy test runner script
- `seed_data.py` - Populates initial Neo4j test data
- `test_e2e_flow.py` - Original E2E test runner class
- `mocks/sophia/` - Mock Sophia service implementation
