# Apollo Scripts

This directory contains utility scripts for development and testing.

## Test Scripts

### `test_stack.sh`

Manages the test infrastructure (Neo4j, Milvus, Mock Sophia) for Apollo testing.

```bash
# Start test services
./scripts/test_stack.sh up

# Check service health
./scripts/test_stack.sh status

# Check port availability
./scripts/test_stack.sh ports

# Stop services
./scripts/test_stack.sh down

# Full cleanup including volumes
./scripts/test_stack.sh clean

# Start stack, run integration tests, stop stack
./scripts/test_stack.sh run
```

### `run_tests.sh`

Unified test runner for unit, integration, and E2E tests.

```bash
# Run unit tests (default)
./scripts/run_tests.sh

# Run unit tests with specific pattern
./scripts/run_tests.sh unit -k "test_hcg"

# Run integration tests (requires test stack)
./scripts/run_tests.sh integration

# Run tests with coverage
./scripts/run_tests.sh coverage

# Run all tests (unit + integration)
./scripts/run_tests.sh all
```

## Port Configuration

Apollo uses port ranges that avoid conflicts with other LOGOS repositories:

| Service | Port(s) | Description |
|---------|---------|-------------|
| Neo4j HTTP | 27474 | Neo4j browser |
| Neo4j Bolt | 27687 | Neo4j bolt protocol |
| Milvus gRPC | 29530 | Milvus vector DB |
| Milvus Health | 29091 | Milvus health endpoint |
| MinIO | 29000-29001 | Object storage |

Other repositories use different ranges:
- Hermes: 1xxxx
- Apollo: 2xxxx (this repo)
- Logos: 3xxxx
- Sophia: 4xxxx
- Talos: 5xxxx

Note: Sophia service is **required** and managed by the sophia repo.
Start sophia's test stack before Apollo's: `cd ../sophia && ./scripts/test_stack.sh up`
Apollo's test_stack.sh will verify Sophia is available.

## Development Scripts

### `run_apollo.sh`

Start the Apollo API server for development.

### `start_demo.sh`

Start the demo environment with all dependencies.

### `check_env.py`

Check environment configuration and dependencies.

## Prerequisites

- Docker and Docker Compose
- Python 3.11+
- Poetry
