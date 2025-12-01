"""Integration tests for Apollo Chat/Hermes endpoints.

These tests validate Apollo's integration with Hermes for LLM chat.
Hermes provides the LLM gateway that Apollo's chat endpoint uses.

Prerequisites:
    - Hermes running on port 8080 (or configured via HERMES_HOST/HERMES_PORT)
    - Valid LLM provider configured in Hermes (OpenAI, etc.)

To run:
    RUN_INTEGRATION_TESTS=1 pytest tests/integration/test_hermes_integration.py -v

Note: These tests require Hermes and an LLM provider, making them more
expensive to run than Neo4j-only tests. Consider using a mock LLM in CI.
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
    if not cfg.hermes or not cfg.hermes.host:
        pytest.skip("Hermes not configured in Apollo config")
    return cfg


@pytest.fixture(scope="module")
def client(config):
    """TestClient with lifespan."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def requires_hermes():
    """Skip if Hermes isn't expected to be running."""
    if not os.getenv("HERMES_AVAILABLE"):
        pytest.skip("Hermes tests require HERMES_AVAILABLE=1 (Hermes must be running)")


class TestChatEndpoint:
    """Test Apollo chat streaming endpoint."""

    def test_chat_stream_requires_message(self, client, requires_hermes):
        """POST /api/chat/stream requires a message."""
        response = client.post("/api/chat/stream", json={})

        # Should fail validation
        assert response.status_code in [400, 422]

    def test_chat_stream_with_message(self, client, requires_hermes):
        """POST /api/chat/stream should return streaming response."""
        response = client.post(
            "/api/chat/stream",
            json={
                "message": "Hello, what is 2+2?",
                "conversation_id": "test-conv-001",
            },
        )

        # Should return 200 with SSE stream, or 503 if Hermes unavailable
        assert response.status_code in [200, 503]

        if response.status_code == 200:
            # SSE responses have specific content type
            assert "text/event-stream" in response.headers.get("content-type", "")


class TestHermesHealth:
    """Test Hermes connectivity from Apollo."""

    def test_hermes_client_health(self, config, requires_hermes):
        """Verify Apollo can reach Hermes."""
        from apollo.client.hermes_client import HermesClient

        hermes = HermesClient(config.hermes)
        is_healthy = hermes.health_check()

        # Should be able to reach Hermes
        assert is_healthy, "Hermes health check failed"
