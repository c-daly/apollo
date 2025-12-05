# Apollo Testing Guide

This document describes the testing strategy, mock usage policies, and coverage goals for Apollo.

## Overview

Apollo has a tiered testing strategy:

| Tier | Type | Services | Runs In |
|------|------|----------|---------|
| 1 | Unit Tests | None (mocked) | CI always |
| 2 | Integration | Neo4j | CI with services |
| 3 | E2E | Full stack | CI with docker-compose |

## Running Tests

```bash
# Unit tests only (default, runs in CI)
poetry run pytest tests/ -m "not integration"

# Unit tests with coverage
poetry run pytest tests/ -m "not integration" --cov=apollo --cov-report=term --cov-report=xml

# Integration tests (requires services)
RUN_INTEGRATION_TESTS=1 poetry run pytest tests/integration/ -v

# E2E tests (requires docker-compose stack)
cd tests/e2e && ./run_e2e.sh
```

## Coverage Goals

- **Target**: 60%+ line coverage
- **Current**: ~61%
- **Report**: Generated as `coverage.xml` on every CI run
- **Dashboard**: Coverage reports uploaded to Codecov

## Mock Usage Policy

### When Mocking is Appropriate

1. **External Service Dependencies**: Mocking `GraphDatabase`, `requests`, etc. is appropriate for unit tests to ensure fast, deterministic execution.

2. **Infrastructure Isolation**: Unit tests should not require Neo4j, Hermes, or Sophia running.

3. **Error Conditions**: Mocking enables testing error paths that would be hard to trigger with real services.

### When Mocking is NOT Appropriate

1. **Integration Tests**: Tests in `tests/integration/` should use real services.

2. **E2E Tests**: Tests in `tests/e2e/` should test the full system flow.

3. **Data Model Tests**: Pure model validation doesn't need mocks at all.

### Mock Inventory

The following mocks are used in unit tests with justification:

| Mock Target | Files | Justification |
|-------------|-------|---------------|
| `GraphDatabase` | `test_persona_store.py`, `test_hcg_client.py` | Neo4j driver - external service |
| `HCGClient` | `conftest.py` | Graph operations for API tests |
| `PersonaDiaryStore` | `conftest.py` | Diary storage for API tests |
| `HermesClient` | `conftest.py` | LLM gateway for API tests |
| `SophiaClient` | `test_cli_sdk.py` | Cognitive core for CLI tests |
| `websockets` | `test_websocket.py` | WebSocket connections |

### Reducing Mock Explosion

To avoid testing mock behavior rather than real behavior:

1. **Keep mocks minimal**: Only mock what's necessary to isolate the unit under test.

2. **Use integration tests for real behavior**: The `tests/integration/` directory contains tests that hit real services.

3. **Document mock expectations**: Complex mock setups should have comments explaining expected behavior.

## Test Structure

```
tests/
├── conftest.py              # Shared fixtures (mocked clients)
├── e2e/                     # Full E2E tests with docker-compose
│   ├── docker-compose.test.apollo.yml
│   ├── mocks/sophia/        # Mock Sophia service
│   ├── seed_data.py         # Test data setup
│   ├── stack/               # Shared infrastructure templates
│   └── test_e2e_flow.py     # E2E test runner
├── integration/             # Real service integration tests
│   ├── conftest.py          # Integration fixtures
│   ├── test_hcg_integration.py
│   ├── test_hermes_integration.py
│   └── test_persona_integration.py
└── test_*.py                # Unit tests (mocked)
```

## Integration Test Tiers

Integration tests are marked with tiers based on service requirements:

### Tier 1 - Neo4j Only

```python
@pytest.mark.tier1
def test_hcg_health(client):
    """Test HCG endpoints with real Neo4j."""
    response = client.get("/api/hcg/health")
    assert response.status_code == 200
```

### Tier 2 - Neo4j + Hermes

```python
@pytest.mark.tier2
def test_chat_stream(client, requires_hermes):
    """Test chat endpoint with real Hermes."""
    response = client.post("/api/chat/stream", json={"message": "Hello"})
    assert response.status_code in [200, 503]
```

### Tier 3 - Full Stack

```python
@pytest.mark.tier3
def test_media_upload_to_sophia(client, requires_sophia):
    """Test media upload proxied to Sophia."""
    pass
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `RUN_INTEGRATION_TESTS=1` | Enable integration test execution |
| `HERMES_AVAILABLE=1` | Enable Hermes-dependent tests |
| `SOPHIA_AVAILABLE=1` | Enable Sophia-dependent tests |
| `NEO4J_URI` | Override Neo4j connection |
| `NEO4J_USER` | Override Neo4j username |
| `NEO4J_PASSWORD` | Override Neo4j password |

## Adding New Tests

### Unit Test Template

```python
"""Tests for [module name]."""

from unittest.mock import Mock, patch
import pytest

from apollo.module import MyClass


@pytest.fixture
def my_fixture():
    """Describe the fixture."""
    return MyClass(config=Mock())


class TestMyClass:
    """Test [class description]."""

    def test_method_success(self, my_fixture):
        """Test [expected behavior]."""
        result = my_fixture.method()
        assert result == expected

    def test_method_error(self, my_fixture):
        """Test [error handling]."""
        with pytest.raises(ValueError):
            my_fixture.method_with_error()
```

### Integration Test Template

```python
"""Integration tests for [feature]."""

import os
import pytest

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def skip_without_env():
    """Skip if integration tests not enabled."""
    if not os.getenv("RUN_INTEGRATION_TESTS"):
        pytest.skip("Integration tests disabled. Set RUN_INTEGRATION_TESTS=1")


class TestFeatureIntegration:
    """Test [feature] with real services."""

    def test_real_behavior(self, client, skip_without_env):
        """Test [behavior] against real [service]."""
        response = client.get("/api/endpoint")
        assert response.status_code == 200
```

## CI Configuration

### Unit Tests (Every PR)

```yaml
pytest tests/ -m "not integration" -v --cov=apollo --cov-report=xml
```

### Integration Tests (On-demand)

Integration tests run in CI when Neo4j is available:

```yaml
RUN_INTEGRATION_TESTS=1 pytest tests/integration/ -v
```

### E2E Tests (Every PR)

E2E tests run with docker-compose in the e2e.yml workflow.

## Debugging Tests

### Running a Single Test

```bash
poetry run pytest tests/test_hcg_client.py::test_health_check_success -v
```

### Verbose Output

```bash
poetry run pytest tests/ -v -s  # Show print statements
```

### Coverage for Single File

```bash
poetry run pytest tests/test_hcg_client.py --cov=apollo.data.hcg_client --cov-report=term-missing
```

## Common Issues

### "Module not measured" Warning

This can occur if the module is imported before coverage starts. Use `--cov-branch` or ensure imports happen inside test functions.

### Async Test Issues

Use `@pytest.mark.asyncio` for async tests. The `asyncio_mode = "auto"` in `pyproject.toml` handles most cases.

### Mock Not Patching

Ensure you patch where the object is used, not where it's defined:

```python
# Wrong: patches where GraphDatabase is defined
@patch("neo4j.GraphDatabase")

# Right: patches where GraphDatabase is imported
@patch("apollo.data.hcg_client.GraphDatabase")
```
