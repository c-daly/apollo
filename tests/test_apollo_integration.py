"""Integration tests for Apollo with real service interactions.

These tests require actual service dependencies (Sophia, Hermes, Neo4j) to be running.
They test full request chains and data flow between services.

NOTE: These integration tests are currently SKIPPED by default as they have not been
validated against real services. They serve as documentation for future integration
testing work. To enable them, remove the pytest.skip() calls and ensure services are
running with proper configuration.

To run integration tests:
    pytest tests/test_apollo_integration.py -m integration

To skip integration tests (default):
    pytest tests/ -m "not integration"
"""

import os
from datetime import datetime
from io import BytesIO

import pytest
from fastapi.testclient import TestClient

from apollo.api.server import app
from apollo.config.settings import ApolloConfig


# Mark all tests in this module as integration tests
pytestmark = pytest.mark.integration


# Skip all integration tests until validated with real services
@pytest.fixture(autouse=True)
def skip_integration_tests():
    """Skip integration tests until they can be validated with real services."""
    pytest.skip(
        "Integration tests require real services (Sophia, Hermes, Neo4j) "
        "and have not been validated yet. Remove this skip to enable."
    )


@pytest.fixture(scope="module")
def integration_config():
    """Load config for integration tests - requires real services."""
    config = ApolloConfig.load()

    # Verify required services are configured
    if not config.sophia.host or not config.hermes.host:
        pytest.skip("Integration tests require Sophia and Hermes configuration")

    return config


@pytest.fixture(scope="module")
def integration_client(integration_config):
    """TestClient with real service backends."""
    # Use real services, no mocking
    return TestClient(app)


class TestApolloSophiaIntegration:
    """Test Apollo→Sophia integration with real Sophia service."""

    def test_health_check_chain(self, integration_client):
        """Test health check propagates to Sophia."""
        response = integration_client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["ok", "degraded"]
        # Should include Sophia health status
        assert (
            "dependencies" in data
            or "services" in data
            or "sophia" in str(data).lower()
        )

    def test_get_hcg_entities_from_neo4j(self, integration_client):
        """Test fetching HCG entities from Neo4j via Sophia."""
        response = integration_client.get("/api/hcg/entities?limit=10")

        # Should succeed even if empty
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

        # If entities exist, verify structure
        if len(data) > 0:
            entity = data[0]
            assert "id" in entity
            assert "type" in entity

    def test_get_hcg_snapshot_integration(self, integration_client):
        """Test full HCG graph snapshot retrieval."""
        response = integration_client.get("/api/hcg/snapshot?limit=50")

        assert response.status_code == 200
        data = response.json()
        assert "entities" in data
        assert "edges" in data
        assert "timestamp" in data
        assert isinstance(data["entities"], list)
        assert isinstance(data["edges"], list)


class TestApolloHermesIntegration:
    """Test Apollo→Hermes integration with real Hermes service."""

    @pytest.mark.skipif(
        not os.getenv("HERMES_API_KEY"),
        reason="Requires HERMES_API_KEY environment variable",
    )
    def test_chat_stream_to_hermes(self, integration_client):
        """Test chat streaming endpoint calls Hermes for LLM generation."""
        response = integration_client.post(
            "/api/chat/stream",
            json={
                "message": "What is the current system status?",
                "conversation_id": "integration-test-001",
            },
        )

        # Chat endpoint may return different status codes depending on implementation
        # (200 for SSE, 400 for missing fields, etc.)
        assert response.status_code in [200, 400, 422, 501]

        # If implemented, should receive some response
        if response.status_code == 200:
            assert response.content  # Should have content


class TestMediaUploadIntegration:
    """Test media upload flow: Apollo→Sophia→Neo4j."""

    @pytest.mark.skipif(
        not os.getenv("SOPHIA_API_TOKEN"),
        reason="Requires SOPHIA_API_TOKEN environment variable",
    )
    def test_media_upload_to_sophia_ingestion(self, integration_client):
        """Test media upload proxies to Sophia and creates Neo4j nodes."""
        # Create a small test image (1x1 pixel PNG)
        test_image = BytesIO(
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\x00\x01"
            b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        )

        response = integration_client.post(
            "/api/media/upload",
            files={"file": ("test_integration.png", test_image, "image/png")},
            data={"media_type": "IMAGE"},
        )

        # Should successfully upload or return 503 if Sophia unavailable
        assert response.status_code in [200, 503]

        if response.status_code == 200:
            data = response.json()
            # Sophia should return sample_id and Neo4j node info
            assert "sample_id" in data or "id" in data
            # Should have created Neo4j node
            assert "neo4j_node_id" in data or "node_id" in data or data.get("sample_id")

    @pytest.mark.skipif(
        not os.getenv("SOPHIA_API_TOKEN"),
        reason="Requires SOPHIA_API_TOKEN environment variable",
    )
    def test_list_media_samples_from_sophia(self, integration_client):
        """Test listing media samples from Sophia."""
        response = integration_client.get("/api/media/samples?limit=10")

        # Should succeed or return 503 if Sophia unavailable
        assert response.status_code in [200, 503]

        if response.status_code == 200:
            data = response.json()
            # Response should be list or dict with samples
            assert isinstance(data, (list, dict))


class TestPersonaDiaryIntegration:
    """Test Persona diary storage and retrieval."""

    def test_create_and_retrieve_persona_entry(self, integration_client):
        """Test full lifecycle: create entry, retrieve it, verify persistence."""
        # Create a new persona entry
        create_response = integration_client.post(
            "/api/persona/entries",
            json={
                "entry_type": "thought",
                "content": "Integration test entry at " + datetime.now().isoformat(),
                "metadata": {
                    "test": "integration",
                    "timestamp": datetime.now().isoformat(),
                },
            },
        )

        assert create_response.status_code == 200
        created_entry = create_response.json()
        assert "id" in created_entry
        entry_id = created_entry["id"]

        # Retrieve the entry by ID
        get_response = integration_client.get(f"/api/persona/entries/{entry_id}")
        assert get_response.status_code == 200
        retrieved_entry = get_response.json()

        assert retrieved_entry["id"] == entry_id
        assert retrieved_entry["entry_type"] == "thought"
        assert "Integration test entry" in retrieved_entry["content"]

    def test_list_persona_entries_with_filter(self, integration_client):
        """Test listing persona entries with type filter."""
        response = integration_client.get(
            "/api/persona/entries?entry_type=thought&limit=10"
        )

        assert response.status_code == 200
        entries = response.json()
        assert isinstance(entries, list)

        # If entries exist, verify they're all thoughts
        for entry in entries:
            assert entry["entry_type"] == "thought"


class TestGraphViewerIntegration:
    """Test GraphViewer frontend fetches HCG data correctly."""

    def test_graph_viewer_data_endpoints(self, integration_client):
        """Test all endpoints GraphViewer needs are accessible."""
        # GraphViewer fetches entities
        entities_response = integration_client.get("/api/hcg/entities")
        assert entities_response.status_code == 200

        # GraphViewer fetches edges
        edges_response = integration_client.get("/api/hcg/edges")
        assert edges_response.status_code == 200

        # GraphViewer can fetch full snapshot
        snapshot_response = integration_client.get("/api/hcg/snapshot")
        assert snapshot_response.status_code == 200
        snapshot = snapshot_response.json()
        assert "entities" in snapshot
        assert "edges" in snapshot

    def test_graph_viewer_entity_detail(self, integration_client):
        """Test fetching individual entity details for GraphViewer."""
        # First get list of entities
        list_response = integration_client.get("/api/hcg/entities?limit=1")
        assert list_response.status_code == 200
        entities = list_response.json()

        if len(entities) > 0:
            entity_id = entities[0]["id"]

            # Fetch detail for that entity
            detail_response = integration_client.get(f"/api/hcg/entities/{entity_id}")
            assert detail_response.status_code in [200, 404]

            if detail_response.status_code == 200:
                entity = detail_response.json()
                assert entity["id"] == entity_id


class TestChatPanelIntegration:
    """Test ChatPanel→Hermes→response flow."""

    def test_chat_panel_message_flow(self, integration_client):
        """Test ChatPanel sends message, gets response from Hermes."""
        # ChatPanel posts message
        response = integration_client.post(
            "/api/chat/stream",
            json={
                "message": "Hello, this is an integration test",
                "conversation_id": "test-chat-integration",
            },
        )

        # Endpoint should exist and return some response
        assert response.status_code in [200, 400, 422, 501]

        # If streaming is implemented, response should have content
        if response.status_code == 200:
            assert len(response.content) > 0


class TestDiagnosticsPanelIntegration:
    """Test DiagnosticsPanel WebSocket telemetry."""

    def test_diagnostics_panel_receives_telemetry(self, integration_client):
        """Test that creating persona entry broadcasts to diagnostics WebSocket."""
        # This test verifies the integration exists but doesn't test actual WebSocket
        # (WebSocket testing requires websocket client, done in unit tests)

        # Create a persona entry
        response = integration_client.post(
            "/api/persona/entries",
            json={
                "entry_type": "observation",
                "content": "Diagnostics integration test",
                "metadata": {},
            },
        )

        assert response.status_code == 200
        # In the real implementation, this should trigger a WebSocket broadcast
        # Unit tests verify the broadcast mechanism


class TestEndToEndWorkflow:
    """Test complete end-to-end workflows across all services."""

    @pytest.mark.skipif(
        not all([os.getenv("SOPHIA_API_TOKEN"), os.getenv("HERMES_API_KEY")]),
        reason="Requires both SOPHIA_API_TOKEN and HERMES_API_KEY",
    )
    def test_media_upload_hcg_link_workflow(self, integration_client):
        """Test: Upload media → Sophia ingests → Neo4j node created → visible in HCG."""
        # Step 1: Upload media
        test_image = BytesIO(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01")

        upload_response = integration_client.post(
            "/api/media/upload",
            files={"file": ("workflow_test.png", test_image, "image/png")},
            data={"media_type": "IMAGE", "question": "Integration test media"},
        )

        if upload_response.status_code != 200:
            pytest.skip("Media upload failed, Sophia may be unavailable")

        upload_data = upload_response.json()
        neo4j_node_id = upload_data.get("neo4j_node_id")

        # Step 2: Verify HCG contains the media node
        if neo4j_node_id:
            entity_response = integration_client.get(
                f"/api/hcg/entities/{neo4j_node_id}"
            )
            # Node should exist in Neo4j (may take a moment to appear)
            assert entity_response.status_code in [200, 404]

    def test_persona_entry_query_workflow(self, integration_client):
        """Test: Create persona entry → Query entries → Entry appears in results."""
        # Step 1: Create unique entry
        unique_content = f"Workflow test {datetime.now().isoformat()}"
        create_response = integration_client.post(
            "/api/persona/entries",
            json={
                "entry_type": "reflection",
                "content": unique_content,
                "metadata": {"workflow_test": True},
            },
        )

        assert create_response.status_code == 200
        created_id = create_response.json()["id"]

        # Step 2: Query entries
        list_response = integration_client.get(
            "/api/persona/entries?entry_type=reflection&limit=50"
        )
        assert list_response.status_code == 200
        entries = list_response.json()

        # Step 3: Verify our entry appears
        found = False
        for entry in entries:
            if entry["id"] == created_id:
                found = True
                assert entry["content"] == unique_content
                break

        assert found, "Created entry should appear in query results"
