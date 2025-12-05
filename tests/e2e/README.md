# E2E Functional Tests

This directory contains end-to-end (E2E) functional tests for Apollo.

## Overview

The E2E tests validate complete system integration using pytest:

- **Infrastructure tests**: Verify Neo4j, Milvus, and Sophia mock are healthy
- **CLI tests**: Test Apollo CLI commands against real services
- **API tests**: Test Apollo backend API endpoints
- **Workflow tests**: End-to-end scenarios (goal -> plan -> execute -> verify)

## Quick Start

```bash
# Start the test stack
./scripts/test_stack.sh up

# Run all e2e tests
./scripts/run_tests.sh e2e

# Run specific test file
poetry run pytest tests/e2e/test_infrastructure.py -v

# Run with markers
poetry run pytest tests/e2e/ -m "requires_neo4j" -v
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

- **Neo4j**: Graph database for HCG (ports 27474/27687)
- **Sophia Mock**: Flask service simulating Sophia (port 28080)
- **Milvus**: Vector database (ports 29530/29091)

## Test Markers

- `@pytest.mark.e2e` - All e2e tests
- `@pytest.mark.requires_neo4j` - Tests requiring Neo4j
- `@pytest.mark.requires_sophia` - Tests requiring Sophia mock
- `@pytest.mark.requires_milvus` - Tests requiring Milvus
- `@pytest.mark.slow` - Long-running tests

## Environment Variables

Override service endpoints:

```bash
export NEO4J_URI=bolt://localhost:27687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=neo4jtest
export SOPHIA_HOST=localhost
export SOPHIA_PORT=28080
export MILVUS_HOST=localhost
export MILVUS_PORT=29530
```

## Legacy Components

The original monolithic test flow is still available:

- `run_e2e.sh` - Legacy test runner script
- `seed_data.py` - Populates initial Neo4j test data
- `test_e2e_flow.py` - Original E2E test runner class
- `mocks/sophia/` - Mock Sophia service implementation
