"""
End-to-End Test Fixtures for Apollo

Provides fixtures for testing complete Apollo workflows with real
Neo4j, Milvus, and Sophia services. Start the full test stack:

    ./scripts/test_stack.sh up

All services (including Sophia) are started together - no need to
run separate repos. Tests will FAIL (not skip) if any service is
unavailable. This is intentional - integration tests should not
silently pass when infrastructure is missing.

Based on sophia e2e test patterns.
"""

import os
from datetime import datetime, timezone
from uuid import uuid4

import pytest
import httpx

# E2E tests require the stack to be running
pytestmark = pytest.mark.e2e

# =============================================================================
# Service Configuration from environment
# Apollo uses 27xxx/29xxx port offset to avoid conflicts
# Sophia uses 4xxxx ports (real Sophia, not mock)
# =============================================================================

# Real Sophia config (from sophia repo, 4xxxx port range)
SOPHIA_PORT = os.getenv("SOPHIA_PORT", "48001")
SOPHIA_HOST = os.getenv("SOPHIA_HOST", "localhost")
SOPHIA_URL = os.getenv("SOPHIA_URL", f"http://{SOPHIA_HOST}:{SOPHIA_PORT}")

# Infrastructure ports (Apollo uses 27xxx/29xxx offset)
NEO4J_HTTP_PORT = os.getenv("NEO4J_HTTP_PORT", "27474")
NEO4J_BOLT_PORT = os.getenv("NEO4J_BOLT_PORT", "27687")
MILVUS_PORT = os.getenv("MILVUS_PORT", "29530")
MILVUS_METRICS_PORT = os.getenv("MILVUS_METRICS_PORT", "29091")

# Neo4j connection config
NEO4J_URI = os.getenv("NEO4J_URI", f"bolt://localhost:{NEO4J_BOLT_PORT}")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "neo4jtest")

# Milvus connection config
MILVUS_HOST = os.getenv("MILVUS_HOST", "localhost")


# =============================================================================
# Pytest Configuration
# =============================================================================


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers",
        "e2e: marks tests as end-to-end tests requiring running services",
    )
    config.addinivalue_line(
        "markers",
        "slow: marks tests as slow (deselect with '-m \"not slow\"')",
    )
    config.addinivalue_line(
        "markers",
        "requires_sophia: marks tests that require Sophia service",
    )
    config.addinivalue_line(
        "markers",
        "requires_neo4j: marks tests that require Neo4j",
    )
    config.addinivalue_line(
        "markers",
        "requires_milvus: marks tests that require Milvus",
    )


# =============================================================================
# Infrastructure Fixtures
# =============================================================================


@pytest.fixture(scope="session")
def infrastructure_ports() -> dict:
    """Port configuration for infrastructure services."""
    return {
        "neo4j_http": int(NEO4J_HTTP_PORT),
        "neo4j_bolt": int(NEO4J_BOLT_PORT),
        "sophia": int(SOPHIA_PORT),
        "milvus_grpc": int(MILVUS_PORT),
        "milvus_health": int(MILVUS_METRICS_PORT),
    }


@pytest.fixture(scope="session")
def neo4j_config() -> dict:
    """Neo4j connection configuration."""
    return {
        "uri": NEO4J_URI,
        "user": NEO4J_USER,
        "password": NEO4J_PASSWORD,
    }


@pytest.fixture(scope="session")
def sophia_config() -> dict:
    """Sophia service configuration."""
    return {
        "host": SOPHIA_HOST,
        "port": int(SOPHIA_PORT),
        "base_url": SOPHIA_URL,
    }


@pytest.fixture(scope="session")
def milvus_config() -> dict:
    """Milvus connection configuration."""
    return {
        "host": MILVUS_HOST,
        "port": int(MILVUS_PORT),
    }


@pytest.fixture(scope="session")
def sophia_url() -> str:
    """Base URL for Sophia API."""
    return SOPHIA_URL


# =============================================================================
# Client Fixtures
# =============================================================================


@pytest.fixture(scope="session")
def neo4j_driver(neo4j_config):
    """Neo4j driver for direct database access."""
    try:
        from neo4j import GraphDatabase
    except ImportError:
        pytest.fail("neo4j driver not installed. Run: poetry install")

    driver = GraphDatabase.driver(
        neo4j_config["uri"],
        auth=(neo4j_config["user"], neo4j_config["password"]),
    )
    yield driver
    driver.close()


@pytest.fixture(scope="session")
def sophia_client(sophia_config):
    """Apollo's SophiaClient for testing CLI workflows."""
    from apollo.client.sophia_client import SophiaClient
    from apollo.config.settings import SophiaConfig

    config = SophiaConfig(
        host=sophia_config["host"],
        port=sophia_config["port"],
    )
    return SophiaClient(config)


@pytest.fixture(scope="session")
def http_client() -> httpx.Client:
    """HTTP client for API testing."""
    client = httpx.Client(timeout=30)
    yield client
    client.close()


# =============================================================================
# Test Data Fixtures
# =============================================================================


@pytest.fixture
def unique_id() -> str:
    """Generate a unique ID for test isolation."""
    return f"test_{uuid4().hex[:8]}"


@pytest.fixture
def test_timestamp() -> str:
    """ISO format timestamp for test data."""
    return datetime.now(timezone.utc).isoformat()


# =============================================================================
# Health Check Helpers
# =============================================================================


def check_neo4j_health(ports: dict) -> bool:
    """Check if Neo4j is healthy via HTTP API."""
    try:
        resp = httpx.get(
            f"http://localhost:{ports['neo4j_http']}/",
            timeout=5,
        )
        return resp.status_code == 200
    except Exception:
        return False


def check_sophia_health(ports: dict) -> bool:
    """Check if Sophia service is healthy."""
    try:
        resp = httpx.get(
            f"http://localhost:{ports['sophia']}/health",
            timeout=5,
        )
        return resp.status_code == 200
    except Exception:
        return False


def check_milvus_health(ports: dict) -> bool:
    """Check if Milvus is healthy."""
    try:
        resp = httpx.get(
            f"http://localhost:{ports['milvus_health']}/healthz",
            timeout=5,
        )
        return resp.status_code == 200
    except Exception:
        return False


@pytest.fixture(scope="session", autouse=True)
def verify_infrastructure(infrastructure_ports):
    """Verify infrastructure is running.

    The test runner script (run_tests.sh e2e) starts the stack before
    running pytest. This fixture confirms everything is healthy.

    Integration/E2E tests should FAIL (not skip) if services are unavailable.
    The test stack is responsible for bringing up all required services.
    """
    if not check_neo4j_health(infrastructure_ports):
        pytest.fail(
            f"Neo4j not available on port {infrastructure_ports['neo4j_http']}. "
            f"Run: ./scripts/test_stack.sh up"
        )

    if not check_sophia_health(infrastructure_ports):
        pytest.fail(
            f"Sophia not available on port {infrastructure_ports['sophia']}. "
            f"Run: ./scripts/test_stack.sh up (ensures Sophia is running)"
        )

    if not check_milvus_health(infrastructure_ports):
        pytest.fail(
            f"Milvus not available on port {infrastructure_ports['milvus_health']}. "
            f"Run: ./scripts/test_stack.sh up"
        )
