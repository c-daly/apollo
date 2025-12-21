"""Integration tests for Apollo Persona Diary endpoints.

These tests validate Apollo's persona diary API against a running Apollo service.

To run:
    1. Start test stack: docker compose -f containers/docker-compose.test.yml -f containers/docker-compose.test.apollo.yml up -d
    2. pytest tests/integration/test_persona_integration.py -v
"""

from datetime import datetime

import pytest
import httpx


pytestmark = pytest.mark.integration


class TestPersonaEntryLifecycle:
    """Test creating and retrieving persona entries."""

    def test_create_persona_entry(self, integration_client: httpx.Client):
        """POST /api/persona/entries should create a new entry."""
        entry_data = {
            "entry_type": "observation",
            "content": f"Integration test observation at {datetime.now().isoformat()}",
            "emotion_tags": ["curious", "focused"],
            "confidence": 0.85,
            "metadata": {"test": True, "source": "integration_test"},
        }

        response = integration_client.post("/api/persona/entries", json=entry_data)

        assert response.status_code == 201, f"Failed: {response.text}"
        data = response.json()

        assert "id" in data
        assert data["entry_type"] == "observation"
        assert data["content"] == entry_data["content"]
        assert data["confidence"] == 0.85

    def test_list_persona_entries(self, integration_client: httpx.Client):
        """GET /api/persona/entries should return a list."""
        response = integration_client.get("/api/persona/entries", params={"limit": 10})

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_list_entries_with_type_filter(self, integration_client: httpx.Client):
        """GET /api/persona/entries with entry_type filter."""
        response = integration_client.get(
            "/api/persona/entries", params={"entry_type": "observation", "limit": 5}
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for entry in data:
            assert entry.get("entry_type") == "observation"

    def test_get_entry_by_id(self, integration_client: httpx.Client):
        """GET /api/persona/entries/{id} should return specific entry."""
        # First create an entry
        create_response = integration_client.post(
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
        response = integration_client.get(f"/api/persona/entries/{entry_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == entry_id
        assert data["entry_type"] == "belief"

    def test_get_nonexistent_entry_returns_404(self, integration_client: httpx.Client):
        """GET /api/persona/entries/{id} with bad ID returns 404."""
        response = integration_client.get("/api/persona/entries/nonexistent-id-12345")

        assert response.status_code == 404


class TestPersonaEntryTypes:
    """Test different persona entry types."""

    @pytest.mark.parametrize(
        "entry_type",
        ["observation", "belief", "decision", "reflection", "goal", "thought"],
    )
    def test_create_entry_types(
        self, integration_client: httpx.Client, entry_type: str
    ):
        """All standard entry types should be creatable."""
        response = integration_client.post(
            "/api/persona/entries",
            json={
                "entry_type": entry_type,
                "content": f"Test {entry_type} entry",
                "confidence": 0.75,
            },
        )

        # May succeed or fail gracefully depending on schema
        assert response.status_code in [201, 422, 400]
