"""Integration tests for Apollo Chat/Hermes endpoints.

These tests validate Apollo's integration with Hermes for LLM chat.
Apollo must be running with Hermes configured.

To run:
    1. Start test stack with Hermes: docker compose -f containers/docker-compose.test.yml -f containers/docker-compose.test.apollo.yml up -d
    2. pytest tests/integration/test_hermes_integration.py -v
"""

import pytest
import httpx


pytestmark = pytest.mark.integration


class TestChatEndpoint:
    """Test Apollo chat streaming endpoint."""

    def test_chat_stream_requires_message(self, integration_client: httpx.Client):
        """POST /api/chat/stream requires a message."""
        response = integration_client.post("/api/chat/stream", json={})

        # Should fail validation
        assert response.status_code in [400, 422]

    def test_chat_stream_with_message(self, integration_client: httpx.Client):
        """POST /api/chat/stream should return streaming response or 503 if Hermes unavailable."""
        response = integration_client.post(
            "/api/chat/stream",
            json={
                "messages": [{"role": "user", "content": "Hello, what is 2+2?"}],
            },
        )

        # Should return 200 with SSE stream, or 503 if Hermes unavailable
        assert response.status_code in [200, 503]

        if response.status_code == 200:
            assert "text/event-stream" in response.headers.get("content-type", "")
