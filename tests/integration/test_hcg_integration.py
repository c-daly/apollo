"""Integration tests for Apollo HCG (Neo4j) endpoints.

These tests validate Apollo's HCG graph API against a running Apollo service.
Apollo must be running with Neo4j configured.

To run:
    1. Start test stack: docker compose -f docker-compose.test.yml -f docker-compose.test.apollo.yml up -d
    2. pytest tests/integration/test_hcg_integration.py -v
"""

import pytest
import httpx


pytestmark = pytest.mark.integration


class TestHCGHealth:
    """Test HCG health endpoint."""

    def test_health_returns_ok(self, integration_client: httpx.Client):
        """Health endpoint should return healthy status when Neo4j is connected."""
        response = integration_client.get("/api/hcg/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["ok", "healthy"]


class TestHCGEntities:
    """Test HCG entity endpoints."""

    def test_get_entities_returns_list(self, integration_client: httpx.Client):
        """GET /api/hcg/entities should return a list."""
        response = integration_client.get("/api/hcg/entities", params={"limit": 10})

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_entities_with_type_filter(self, integration_client: httpx.Client):
        """GET /api/hcg/entities with type filter should work."""
        response = integration_client.get(
            "/api/hcg/entities", params={"type": "State", "limit": 5}
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for entity in data:
            assert entity.get("type") == "State" or "State" in entity.get("labels", [])

    def test_get_entities_pagination(self, integration_client: httpx.Client):
        """Pagination limit parameter should be honored."""
        response = integration_client.get("/api/hcg/entities", params={"limit": 2})
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 2


class TestHCGSnapshot:
    """Test HCG graph snapshot endpoint."""

    def test_get_snapshot_structure(self, integration_client: httpx.Client):
        """Snapshot should return entities and edges."""
        response = integration_client.get("/api/hcg/snapshot", params={"limit": 20})

        assert response.status_code == 200
        data = response.json()

        assert "entities" in data
        assert "edges" in data
        assert "timestamp" in data
        assert isinstance(data["entities"], list)
        assert isinstance(data["edges"], list)


class TestHCGStatesAndProcesses:
    """Test state and process specific endpoints."""

    def test_get_states(self, integration_client: httpx.Client):
        """GET /api/hcg/states should return state entities."""
        response = integration_client.get("/api/hcg/states", params={"limit": 10})

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_processes(self, integration_client: httpx.Client):
        """GET /api/hcg/processes should return process entities."""
        response = integration_client.get("/api/hcg/processes", params={"limit": 10})

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_edges(self, integration_client: httpx.Client):
        """GET /api/hcg/edges should return causal edges."""
        response = integration_client.get("/api/hcg/edges", params={"limit": 10})

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
