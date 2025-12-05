"""
End-to-End Test Fixtures for Apollo

Provides fixtures for testing complete Apollo workflows with real
Neo4j, Milvus, and mock Sophia services. The test stack must be running:

    ./scripts/test_stack.sh up

These tests validate the full Apollo system including:
- CLI commands against real services
- API endpoints with real database connectivity
- WebSocket diagnostics streaming
- Persona diary workflows

Based on sophia and logos e2e test patterns.
"""

import os
from datetime import datetime, timezone
from uuid import uuid4

import pytest
import httpx

# Load configuration from environment using apollo.env module
from apollo.env import get_neo4j_config, get_milvus_config, get_sophia_config

# E2E tests require the stack to be running
pytestmark = pytest.mark.e2e


# =============================================================================
# Service Configuration (loaded from environment)
# =============================================================================

# Load configs from environment - CI sets these, locally use defaults
_neo4j_config = get_neo4j_config()
_milvus_config = get_milvus_config()
_sophia_config = get_sophia_config()

# Neo4j config
NEO4J_URI = _neo4j_config["uri"]
NEO4J_USER = _neo4j_config["user"]
NEO4J_PASSWORD = _neo4j_config["password"]
# Extract port from URI for HTTP access (browser)
NEO4J_BOLT_PORT = NEO4J_URI.split(":")[-1] if ":" in NEO4J_URI else "7687"
NEO4J_HTTP_PORT = os.getenv("NEO4J_HTTP_PORT", "7474")

# Milvus config
MILVUS_HOST = _milvus_config["host"]
MILVUS_PORT = _milvus_config["port"]
MILVUS_METRICS_PORT = os.getenv("MILVUS_METRICS_PORT", "9091")

# Sophia config
SOPHIA_HOST = _sophia_config["host"]
SOPHIA_PORT = _sophia_config["port"]
SOPHIA_URL = _sophia_config["base_url"]


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
    """Sophia mock service configuration."""
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
    """Base URL for Sophia mock API."""
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
        pytest.skip("neo4j driver not available")

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
    """Check if Sophia mock is healthy."""
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
    running pytest. This fixture just confirms everything is healthy.
    """
    if not check_neo4j_health(infrastructure_ports):
        pytest.fail(
            f"Neo4j not available on port {infrastructure_ports['neo4j_http']}. "
            f"Run: ./scripts/test_stack.sh up"
        )

    if not check_sophia_health(infrastructure_ports):
        pytest.fail(
            f"Sophia mock not available on port {infrastructure_ports['sophia']}. "
            f"Run: ./scripts/test_stack.sh up"
        )

    # Milvus is optional
    if not check_milvus_health(infrastructure_ports):
        print("⚠️  Milvus not available (some tests may skip)")
