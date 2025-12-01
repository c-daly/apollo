"""Integration tests for Apollo HCG (Neo4j) endpoints.

These tests validate Apollo's direct Neo4j integration for HCG graph data.
They require a running Neo4j instance with the HCG schema.

Prerequisites:
    - Neo4j running on bolt://localhost:7687 (or configured via NEO4J_URI)
    - Neo4j credentials: neo4j/neo4jtest (or configured via NEO4J_USER/NEO4J_PASSWORD)

To run:
    RUN_INTEGRATION_TESTS=1 pytest tests/integration/test_hcg_integration.py -v

Infrastructure setup:
    cd ../logos/infra && docker compose -f docker-compose.hcg.dev.yml up -d neo4j
"""

import os

import pytest
from fastapi.testclient import TestClient

from apollo.api.server import app
from apollo.config.settings import ApolloConfig


pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def skip_without_env():
    """Skip if RUN_INTEGRATION_TESTS not set."""
    if not os.getenv("RUN_INTEGRATION_TESTS"):
        pytest.skip(
            "Integration tests disabled. Set RUN_INTEGRATION_TESTS=1 to enable."
        )


@pytest.fixture(scope="module")
def config(skip_without_env):
    """Load and validate Apollo config."""
    cfg = ApolloConfig.load()
    if not cfg.hcg or not cfg.hcg.neo4j:
        pytest.skip("Neo4j not configured in Apollo config")
    return cfg


@pytest.fixture(scope="module")
def client(config):
    """TestClient with lifespan for HCG client initialization."""
    with TestClient(app) as c:
        yield c


class TestHCGHealth:
    """Test HCG health endpoint."""

    def test_health_returns_ok(self, client):
        """Health endpoint should return healthy status when Neo4j is connected."""
        response = client.get("/api/hcg/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["ok", "healthy"]
        # Verify we got a valid health response
        assert "status" in data


class TestHCGEntities:
    """Test HCG entity endpoints."""

    def test_get_entities_returns_list(self, client):
        """GET /api/hcg/entities should return a list."""
        response = client.get("/api/hcg/entities?limit=10")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_entities_with_type_filter(self, client):
        """GET /api/hcg/entities with type filter should work."""
        response = client.get("/api/hcg/entities?type=State&limit=5")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # If results exist, they should all be States
        for entity in data:
            assert entity.get("type") == "State" or "State" in entity.get("labels", [])

    def test_get_entities_pagination(self, client):
        """Pagination limit parameter should be honored."""
        # Test that limit restricts results
        response = client.get("/api/hcg/entities?limit=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 2

        # Test larger limit
        response = client.get("/api/hcg/entities?limit=10")
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 10


class TestHCGSnapshot:
    """Test HCG graph snapshot endpoint."""

    def test_get_snapshot_structure(self, client):
        """Snapshot should return entities and edges."""
        response = client.get("/api/hcg/snapshot?limit=20")

        assert response.status_code == 200
        data = response.json()

        # Verify structure
        assert "entities" in data
        assert "edges" in data
        assert "timestamp" in data
        assert isinstance(data["entities"], list)
        assert isinstance(data["edges"], list)


class TestHCGStatesAndProcesses:
    """Test state and process specific endpoints."""

    def test_get_states(self, client):
        """GET /api/hcg/states should return state entities."""
        response = client.get("/api/hcg/states?limit=10")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_processes(self, client):
        """GET /api/hcg/processes should return process entities."""
        response = client.get("/api/hcg/processes?limit=10")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_edges(self, client):
        """GET /api/hcg/edges should return causal edges."""
        response = client.get("/api/hcg/edges?limit=10")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
