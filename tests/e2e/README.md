# E2E Functional Tests

This directory contains end-to-end (E2E) functional tests for the Apollo → Sophia → Talos → HCG prototype flow.

## Overview

The E2E test validates the complete system integration:

1. **Docker Compose**: Starts Neo4j and mock Sophia service (with Talos shim simulation)
2. **Seed Data**: Populates Neo4j with initial agent state and test objects
3. **Apollo CLI**: Sends pick-and-place command to Sophia
4. **Plan Execution**: Sophia generates plan and Talos shim executes deterministically
5. **State Updates**: HCG (Neo4j) reflects updated grasp and position
6. **Verification**: Apollo reads and reflects the updated state

## Prerequisites

- Docker and Docker Compose
- Python 3.9+
- Apollo installed: `pip install -e .` from repository root

## Test Components

### Docker Services

- **Neo4j**: Graph database for HCG (port 7474/7687)
- **Sophia Mock**: Flask service simulating Sophia cognitive core with Talos shim (port 8080)

### Test Scripts

- `docker-compose.e2e.yml`: Service orchestration
- `seed_data.py`: Populates initial test data
- `test_e2e_flow.py`: Main E2E test runner
- `mocks/sophia/`: Mock Sophia service implementation

## Running the Tests

### Quick Start

From the repository root:

```bash
# Run E2E tests (automatically manages docker-compose)
python tests/e2e/test_e2e_flow.py
```

The test script will:
1. Start Docker Compose services
2. Wait for services to be healthy
3. Seed test data
4. Execute test scenarios
5. Print detailed results
6. Clean up services

### Manual Testing

If you want to manually interact with the test environment:

```bash
# Start services
cd tests/e2e
docker compose -f docker-compose.e2e.yml up -d

# Wait for services to be healthy (check logs)
docker compose -f docker-compose.e2e.yml logs -f

# Seed data
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=testpassword
python seed_data.py

# Use Apollo CLI
apollo-cli status
apollo-cli send "pick up the red block and place it at the target location"
apollo-cli state
apollo-cli plans --recent 5

# Access Neo4j browser
# Open http://localhost:7474 in browser
# Login: neo4j / testpassword
# Run queries: MATCH (n) RETURN n

# Clean up
docker compose -f docker-compose.e2e.yml down -v
```

## Test Coverage

The E2E test validates:

### Test 1: Initial State Verification
- Agent entity exists in HCG
- Initial position at origin (0, 0, 0)
- Test objects (red_block, blue_block, green_cube) exist

### Test 2: Apollo Command Processing
- Apollo CLI sends command to Sophia
- Sophia generates pick-and-place plan with expected steps:
  - `move_to_object`: Navigate to target object
  - `grasp`: Grasp the object
  - `move_to_position`: Move to target location
  - `release`: Release the object

### Test 3: HCG State Updates (Talos Shim Execution)
- Agent grasping relationship created for object
- Agent position updated to target location (1.0, 1.0, 0.5)
- Agent state updated to "completed"
- Plan stored in HCG

### Test 4: Apollo State Reflection
- Apollo reads completed status
- Apollo reads grasped object name
- Apollo reads updated position

### Test 5: Plans API
- Apollo retrieves plan list from Sophia
- Plans include goal, status, and timestamps

## Architecture

```
┌─────────────┐
│  Apollo CLI │  ← User sends command
└──────┬──────┘
       │ HTTP POST /api/command
       ▼
┌─────────────────────────────────────────────┐
│          Sophia Mock Service                │
│  ┌────────────────────────────────────────┐ │
│  │ 1. Receive command                     │ │
│  │ 2. Generate plan                       │ │
│  │ 3. Simulate Talos shim execution       │ │
│  │ 4. Update HCG state via Cypher queries │ │
│  └────────────────────────────────────────┘ │
└──────────────┬──────────────────────────────┘
               │ Bolt protocol
               ▼
        ┌─────────────┐
        │   Neo4j     │  ← HCG state storage
        │  (Graph DB) │
        └─────────────┘
```

## CI Integration

The E2E test can be integrated into CI pipelines with an optional skip flag.

### GitHub Actions Example

```yaml
e2e-test:
  runs-on: ubuntu-latest
  # Can be skipped with workflow dispatch input
  if: ${{ github.event.inputs.skip_e2e != 'true' }}
  
  steps:
    - uses: actions/checkout@v4
    
    - name: Set up Python
      uses: actions/setup-python@v5
      with:
        python-version: '3.11'
    
    - name: Install dependencies
      run: |
        pip install -e ".[dev]"
    
    - name: Run E2E tests
      run: |
        python tests/e2e/test_e2e_flow.py
```

## Troubleshooting

### Services not starting

```bash
# Check service logs
docker compose -f tests/e2e/docker-compose.e2e.yml logs

# Verify Docker is running
docker ps
```

### Neo4j connection issues

```bash
# Wait for Neo4j to be ready (can take 20-30 seconds)
docker compose -f tests/e2e/docker-compose.e2e.yml logs neo4j

# Test connection manually
cypher-shell -a bolt://localhost:7687 -u neo4j -p testpassword
```

### Port conflicts

If ports 7474, 7687, or 8080 are already in use:

```bash
# Stop conflicting services or modify ports in docker-compose.e2e.yml
docker compose -f tests/e2e/docker-compose.e2e.yml down
# Edit docker-compose.e2e.yml to use different ports
```

### Clean slate

```bash
# Complete cleanup including volumes
docker compose -f tests/e2e/docker-compose.e2e.yml down -v
docker system prune -f
```

## Mock Services

### Sophia Mock

The Sophia mock service (`mocks/sophia/sophia_mock.py`) simulates:

- **Command Processing**: Parses pick-and-place commands
- **Plan Generation**: Creates deterministic plans with predefined steps
- **Talos Shim**: Simulates hardware execution by updating HCG state directly
- **State Management**: Maintains agent state, grasps, and positions in Neo4j

The mock is intentionally simple and deterministic for testing purposes.

## Extending the Tests

To add new test scenarios:

1. Add test objects in `seed_data.py`
2. Extend command parsing in `mocks/sophia/sophia_mock.py`
3. Add test methods in `test_e2e_flow.py`
4. Update assertions to match expected behavior

## Phase 1 Gate Compliance

This E2E test satisfies the acceptance criteria for Phase 1 gate c-daly/logos#163:

- ✅ Compose up + seed data
- ✅ Apollo CLI requests pick-and-place plan from Sophia
- ✅ Talos shim executes deterministically and updates HCG state
- ✅ Apollo reflects updated grasp/position; Neo4j shows state changes
- ✅ Script/logs included; CI job may be skip-able but documented

## Related Documentation

- [Main README](../../README.md)
- [Prototype Wiring](../../docs/PROTOTYPE-WIRING.md)
- [Apollo CLI Documentation](../../docs/README.md)
