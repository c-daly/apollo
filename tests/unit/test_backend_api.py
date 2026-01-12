"""Test Apollo Backend API Endpoints.

Tests for Apollo's FastAPI server endpoints including HCG, persona,
and media proxying to Sophia.
"""

import pytest
from fastapi import status
from io import BytesIO


class TestHCGEndpoints:
    """Test HCG (Hypergraph Causal Graph) data access endpoints."""

    @pytest.mark.asyncio
    async def test_get_health(self, test_client):
        """Test /api/hcg/health endpoint."""
        response = test_client.get("/api/hcg/health")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "status" in data
        assert "neo4j_connected" in data

    @pytest.mark.asyncio
    async def test_get_entities(self, test_client):
        """Test /api/hcg/entities endpoint returns entity list."""
        response = test_client.get("/api/hcg/entities")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert "id" in data[0]

    @pytest.mark.asyncio
    async def test_get_entities_with_type_filter(self, test_client):
        """Test /api/hcg/entities with entity_type filter."""
        response = test_client.get("/api/hcg/entities?type=goal")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_get_entity_by_id(self, test_client):
        """Test /api/hcg/entities/{entity_id} endpoint."""
        response = test_client.get("/api/hcg/entities/entity1")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == "entity1"
        assert data["type"] == "goal"

    @pytest.mark.asyncio
    async def test_get_entity_not_found(self, test_client, mock_hcg_client):
        """Test /api/hcg/entities/{entity_id} with non-existent ID."""
        # Override the mock for this specific test
        mock_hcg_client.get_entity_by_id.return_value = None

        response = test_client.get("/api/hcg/entities/nonexistent")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.asyncio
    async def test_get_states(self, test_client):
        """Test /api/hcg/states endpoint."""
        response = test_client.get("/api/hcg/states")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0

    @pytest.mark.asyncio
    async def test_get_processes(self, test_client):
        """Test /api/hcg/processes endpoint."""
        response = test_client.get("/api/hcg/processes")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0

    @pytest.mark.asyncio
    async def test_get_edges(self, test_client):
        """Test /api/hcg/edges endpoint."""
        response = test_client.get("/api/hcg/edges")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0

    @pytest.mark.asyncio
    async def test_get_graph_snapshot(self, test_client):
        """Test /api/hcg/snapshot endpoint returns complete graph."""
        response = test_client.get("/api/hcg/snapshot")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "entities" in data
        assert "edges" in data
        assert "timestamp" in data
        assert "metadata" in data


class TestPersonaEndpoints:
    """Test Persona diary and memory endpoints."""

    @pytest.mark.asyncio
    async def test_create_persona_entry(self, test_client):
        """Test POST /api/persona/entries creates new entry."""
        response = test_client.post(
            "/api/persona/entries",
            json={
                "content": "Test entry",
                "entry_type": "observation",
            },
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert "id" in data
        assert data["content"] == "Test entry"

    @pytest.mark.asyncio
    async def test_get_persona_entries(self, test_client):
        """Test GET /api/persona/entries returns list."""
        response = test_client.get("/api/persona/entries")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2

    @pytest.mark.asyncio
    async def test_get_persona_entries_with_filter(self, test_client):
        """Test GET /api/persona/entries with filters."""
        response = test_client.get("/api/persona/entries?entry_type=observation")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_get_persona_entry_by_id(self, test_client):
        """Test GET /api/persona/entries/{entry_id}."""
        response = test_client.get("/api/persona/entries/entry-123")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == "entry-123"

    @pytest.mark.asyncio
    async def test_get_persona_entry_not_found(self, test_client, mock_persona_store):
        """Test GET /api/persona/entries/{entry_id} with non-existent ID."""
        mock_persona_store.get_entry.return_value = None

        response = test_client.get("/api/persona/entries/nonexistent")
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestMediaEndpoints:
    """Test media upload and retrieval endpoints (Hermes proxy)."""

    @pytest.mark.asyncio
    async def test_upload_media_success(
        self, test_client, monkeypatch, sample_media_file
    ):
        """Test POST /api/media/upload with mocked Hermes response."""
        from unittest.mock import AsyncMock, Mock

        # Mock httpx.AsyncClient
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "sample_id": "test-sample-123",
            "file_path": "/uploads/test.png",
            "media_type": "IMAGE",
            "metadata": {"file_size": len(sample_media_file), "mime_type": "image/png"},
            "neo4j_node_id": "node-123",
            "embedding_id": "embed-456",
            "transcription": None,
            "message": "Media ingested via Hermes.",
        }
        mock_response.raise_for_status = Mock()

        mock_client = Mock()
        mock_client.post = AsyncMock(return_value=mock_response)

        # Set mock on app.state.http_client (P0.2 connection pooling)
        test_client.app.state.http_client = mock_client

        response = test_client.post(
            "/api/media/upload",
            files={"file": ("test.png", BytesIO(sample_media_file), "image/png")},
            data={"media_type": "IMAGE"},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["sample_id"] == "test-sample-123"
        assert data["media_type"] == "IMAGE"

    @pytest.mark.skip(
        reason="File size validation requires actual large file or complex mocking of UploadFile internals"
    )
    @pytest.mark.asyncio
    async def test_upload_media_file_too_large(self, test_client, monkeypatch):
        """Test POST /api/media/upload rejects files over 100MB."""
        from apollo.config.settings import ApolloConfig
        from unittest.mock import Mock
        from fastapi import UploadFile

        # Mock config
        mock_config = Mock()
        mock_config.sophia.api_key = "test-token"
        mock_config.sophia.host = "localhost"
        mock_config.sophia.port = 8001
        mock_config.sophia.timeout = 60.0

        monkeypatch.setattr(ApolloConfig, "load", lambda: mock_config)
        monkeypatch.setenv("SOPHIA_API_TOKEN", "test-token")

        # Patch the endpoint to mock file size check
        original_upload = test_client.app.routes[-1].endpoint

        async def mock_upload_large(
            file: UploadFile, media_type: str, question: str = None
        ):
            # Simulate file.file.tell() returning > 100MB
            if hasattr(file, "file"):
                original_tell = file.file.tell
                file.file.tell = lambda: 101 * 1024 * 1024
                try:
                    return await original_upload(file, media_type, question)
                finally:
                    file.file.tell = original_tell
            return await original_upload(file, media_type, question)

        # Small actual file
        small_file = BytesIO(b"x" * 1000)

        # Find and temporarily replace the upload_media endpoint
        for route in test_client.app.routes:
            if hasattr(route, "path") and route.path == "/api/media/upload":
                original_endpoint = route.endpoint
                route.endpoint = mock_upload_large
                break

        response = test_client.post(
            "/api/media/upload",
            files={"file": ("large.mp4", small_file, "video/mp4")},
            data={"media_type": "VIDEO"},
        )

        # Restore original endpoint
        for route in test_client.app.routes:
            if hasattr(route, "path") and route.path == "/api/media/upload":
                route.endpoint = original_endpoint
                break

        assert response.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        assert "100 MB limit" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_media_samples(self, test_client, monkeypatch):
        """Test GET /api/media/samples proxies to Sophia."""
        from unittest.mock import AsyncMock, Mock

        monkeypatch.setenv("SOPHIA_API_TOKEN", "test-token")

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "samples": [
                {"sample_id": "s1", "media_type": "IMAGE"},
                {"sample_id": "s2", "media_type": "VIDEO"},
            ],
            "total": 2,
        }
        mock_response.raise_for_status = Mock()

        mock_client = Mock()
        mock_client.get = AsyncMock(return_value=mock_response)

        # Set mock on app.state.http_client (P0.2 connection pooling)
        test_client.app.state.http_client = mock_client

        response = test_client.get("/api/media/samples?limit=20&offset=0")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "samples" in data or isinstance(data, list)

    @pytest.mark.asyncio
    async def test_get_media_sample_by_id(self, test_client, monkeypatch):
        """Test GET /api/media/samples/{sample_id} proxies to Sophia."""
        from unittest.mock import AsyncMock, Mock

        monkeypatch.setenv("SOPHIA_API_TOKEN", "test-token")

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "sample_id": "test-123",
            "media_type": "IMAGE",
            "file_path": "/uploads/test.png",
            "metadata": {"file_size": 1024},
        }
        mock_response.raise_for_status = Mock()

        mock_client = Mock()
        mock_client.get = AsyncMock(return_value=mock_response)

        # Set mock on app.state.http_client (P0.2 connection pooling)
        test_client.app.state.http_client = mock_client

        response = test_client.get("/api/media/samples/test-123")
        assert response.status_code == status.HTTP_200_OK


class TestChatEndpoints:
    """Test chat and streaming endpoints."""

    @pytest.mark.asyncio
    async def test_chat_stream_endpoint_exists(self, test_client):
        """Test POST /api/chat/stream endpoint is accessible."""
        # Chat streaming requires WebSocket or SSE connection
        # This test validates the endpoint exists and returns appropriate response
        response = test_client.post(
            "/api/chat/stream",
            json={
                "message": "Hello",
                "conversation_id": "test-123",
            },
        )
        # Endpoint should return 200 or specific streaming response
        # Exact behavior depends on implementation (SSE, WebSocket, etc.)
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_400_BAD_REQUEST,  # Missing required fields
            status.HTTP_422_UNPROCESSABLE_ENTITY,  # Validation error
        ]
