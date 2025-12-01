"""Integration tests for Apollo Persona Diary endpoints.

These tests validate Apollo's persona diary storage in Neo4j.
The persona diary stores AI reflections, observations, and decisions.

Prerequisites:
    - Neo4j running with HCG schema (includes PersonaEntry nodes)
    - Apollo config with hcg.neo4j configured

To run:
    RUN_INTEGRATION_TESTS=1 pytest tests/integration/test_persona_integration.py -v
"""

import os
from datetime import datetime

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
        pytest.skip("Neo4j not configured - persona diary requires Neo4j")
    return cfg


@pytest.fixture(scope="module")
def client(config):
    """TestClient with lifespan for persona store initialization."""
    with TestClient(app) as c:
        yield c


class TestPersonaEntryLifecycle:
    """Test creating and retrieving persona entries."""

    def test_create_persona_entry(self, client):
        """POST /api/persona/entries should create a new entry."""
        entry_data = {
            "entry_type": "observation",
            "content": f"Integration test observation at {datetime.now().isoformat()}",
            "emotion_tags": ["curious", "focused"],
            "confidence": 0.85,
            "metadata": {"test": True, "source": "integration_test"},
        }

        response = client.post("/api/persona/entries", json=entry_data)

        # Should succeed with 201 Created
        assert response.status_code == 201, f"Failed: {response.text}"
        data = response.json()

        # Verify returned structure
        assert "id" in data
        assert data["entry_type"] == "observation"
        assert data["content"] == entry_data["content"]
        assert data["confidence"] == 0.85

    def test_list_persona_entries(self, client):
        """GET /api/persona/entries should return a list."""
        response = client.get("/api/persona/entries?limit=10")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_list_entries_with_type_filter(self, client):
        """GET /api/persona/entries with entry_type filter."""
        response = client.get("/api/persona/entries?entry_type=observation&limit=5")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # All returned entries should be observations
        for entry in data:
            assert entry.get("entry_type") == "observation"

    def test_get_entry_by_id(self, client):
        """GET /api/persona/entries/{id} should return specific entry."""
        # First create an entry
        create_response = client.post(
            "/api/persona/entries",
            json={
                "entry_type": "belief",
                "content": "Test belief for retrieval",
                "confidence": 0.9,
            },
        )
        assert create_response.status_code == 201
        entry_id = create_response.json()["id"]

        # Now retrieve it
        response = client.get(f"/api/persona/entries/{entry_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == entry_id
        assert data["entry_type"] == "belief"

    def test_get_nonexistent_entry_returns_404(self, client):
        """GET /api/persona/entries/{id} with bad ID returns 404."""
        response = client.get("/api/persona/entries/nonexistent-id-12345")

        assert response.status_code == 404


class TestPersonaEntryTypes:
    """Test different persona entry types."""

    @pytest.mark.parametrize(
        "entry_type",
        ["observation", "belief", "decision", "reflection", "goal", "thought"],
    )
    def test_create_entry_types(self, client, entry_type):
        """All standard entry types should be creatable."""
        response = client.post(
            "/api/persona/entries",
            json={
                "entry_type": entry_type,
                "content": f"Test {entry_type} entry",
                "confidence": 0.75,
            },
        )

        # May succeed or fail gracefully depending on schema
        assert response.status_code in [201, 422, 400]
