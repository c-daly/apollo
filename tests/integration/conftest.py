"""Integration test configuration for Apollo.

This conftest provides shared fixtures for integration tests and documents
the testing strategy for different service tiers.

Service Tiers:
    Tier 1 - Neo4j Only (most tests):
        - HCG graph endpoints
        - Persona diary endpoints
        - Can run with just: docker compose -f docker-compose.hcg.dev.yml up neo4j

    Tier 2 - Neo4j + Hermes:
        - Chat/LLM endpoints
        - Requires Hermes running with LLM provider

    Tier 3 - Full Stack (optional):
        - Media upload (proxies to Sophia)
        - End-to-end workflows

Environment Variables:
    RUN_INTEGRATION_TESTS=1     - Enable integration tests (required)
    HERMES_AVAILABLE=1          - Enable Hermes-dependent tests
    SOPHIA_AVAILABLE=1          - Enable Sophia-dependent tests
    NEO4J_URI                   - Override Neo4j connection
    NEO4J_USER                  - Override Neo4j username
    NEO4J_PASSWORD              - Override Neo4j password
"""

import os
from typing import Generator

import pytest
from fastapi.testclient import TestClient

from apollo.api.server import app
from apollo.config.settings import ApolloConfig


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests (require services)"
    )
    config.addinivalue_line("markers", "tier1: Neo4j only tests")
    config.addinivalue_line("markers", "tier2: Neo4j + Hermes tests")
    config.addinivalue_line("markers", "tier3: Full stack tests")


@pytest.fixture(scope="session")
def integration_enabled() -> bool:
    """Check if integration tests are enabled."""
    return bool(os.getenv("RUN_INTEGRATION_TESTS"))


@pytest.fixture(scope="session")
def apollo_config() -> ApolloConfig:
    """Load Apollo configuration."""
    return ApolloConfig.load()


@pytest.fixture(scope="session")
def neo4j_available(apollo_config) -> bool:
    """Check if Neo4j is configured and reachable."""
    if not apollo_config.hcg or not apollo_config.hcg.neo4j:
        return False

    try:
        from apollo.data.hcg_client import HCGClient

        client = HCGClient(apollo_config.hcg.neo4j)
        client.connect()
        client.close()
        return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def hermes_available(apollo_config) -> bool:
    """Check if Hermes is configured and reachable."""
    if not apollo_config.hermes or not apollo_config.hermes.host:
        return False

    if not os.getenv("HERMES_AVAILABLE"):
        return False

    try:
        from apollo.client.hermes_client import HermesClient

        client = HermesClient(apollo_config.hermes)
        return client.health_check()
    except Exception:
        return False


@pytest.fixture(scope="module")
def integration_client(
    integration_enabled, neo4j_available
) -> Generator[TestClient, None, None]:
    """Shared TestClient for integration tests.

    Uses context manager to ensure lifespan events fire.
    """
    if not integration_enabled:
        pytest.skip("RUN_INTEGRATION_TESTS not set")

    if not neo4j_available:
        pytest.skip("Neo4j not available")

    with TestClient(app) as client:
        yield client
