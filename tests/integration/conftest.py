"""Integration test configuration for Apollo.

Integration tests run against a real Apollo service. The service must be running
before tests execute. Tests will FAIL (not skip) if the service is unavailable.

To run integration tests:
    1. Start the test stack:
       docker compose -f containers/docker-compose.test.yml -f containers/docker-compose.test.apollo.yml up -d

    2. Run tests:
       pytest tests/integration/ -v

Environment Variables:
    APOLLO_API_PORT  - Apollo API port (default: 27000 for test stack)
"""

import os
from typing import Generator

import httpx
import pytest


# Default to test stack port
APOLLO_API_PORT = int(os.getenv("APOLLO_API_PORT", "27000"))
APOLLO_BASE_URL = f"http://localhost:{APOLLO_API_PORT}"


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests (require services)"
    )


@pytest.fixture(scope="session")
def apollo_base_url() -> str:
    """Base URL for Apollo API."""
    return APOLLO_BASE_URL


@pytest.fixture(scope="session")
def integration_client() -> Generator[httpx.Client, None, None]:
    """HTTP client for integration tests.

    Tests FAIL if Apollo is not running - no skip logic.
    """
    with httpx.Client(base_url=APOLLO_BASE_URL, timeout=30.0) as client:
        # Verify Apollo is reachable - use the actual health endpoint
        try:
            response = client.get("/api/hcg/health")
            if response.status_code != 200:
                pytest.fail(
                    f"Apollo health check failed with status {response.status_code}. "
                    f"Ensure Apollo is running on {APOLLO_BASE_URL}"
                )
        except httpx.ConnectError:
            pytest.fail(
                f"Cannot connect to Apollo at {APOLLO_BASE_URL}. "
                "Start the test stack: docker compose -f containers/docker-compose.test.yml "
                "-f containers/docker-compose.test.apollo.yml up -d"
            )
        yield client
