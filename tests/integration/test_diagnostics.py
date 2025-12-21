"""Integration tests for diagnostics websocket and persona diary.

These tests validate the diagnostics websocket broadcasts against a running Apollo service.

To run:
    1. Start test stack: docker compose -f containers/docker-compose.test.yml -f containers/docker-compose.test.apollo.yml up -d
    2. pytest tests/integration/test_diagnostics.py -v
"""

import os

import pytest
import httpx
from websockets.sync.client import connect as ws_connect


APOLLO_API_PORT = int(os.getenv("APOLLO_API_PORT", "27000"))
APOLLO_WS_URL = f"ws://localhost:{APOLLO_API_PORT}"


pytestmark = pytest.mark.integration


class TestDiagnosticsWebsocket:
    """Test diagnostics websocket endpoint."""

    def test_websocket_connects(self, integration_client: httpx.Client):
        """Websocket should connect and receive initial messages."""
        with ws_connect(f"{APOLLO_WS_URL}/ws/diagnostics") as websocket:
            # Should receive initial telemetry
            message = websocket.recv(timeout=5)
            assert message is not None

    def test_persona_entry_broadcasts_to_websocket(
        self, integration_client: httpx.Client
    ):
        """Creating a persona entry should broadcast to websocket."""
        import json

        with ws_connect(f"{APOLLO_WS_URL}/ws/diagnostics") as websocket:
            # Drain initial messages
            try:
                for _ in range(5):
                    websocket.recv(timeout=1)
            except TimeoutError:
                pass

            # Create a persona entry via API
            payload = {
                "entry_type": "observation",
                "content": "Integration test entry for websocket",
                "confidence": 1.0,
                "metadata": {"test_id": "ws_integration"},
            }

            response = integration_client.post("/api/persona/entries", json=payload)
            assert response.status_code == 201
            created_entry = response.json()

            # Look for the broadcast message
            found_entry = False
            for _ in range(20):
                try:
                    raw = websocket.recv(timeout=2)
                    msg = json.loads(raw)
                    if msg.get("type") == "persona_entry":
                        assert msg["data"]["id"] == created_entry["id"]
                        found_entry = True
                        break
                except TimeoutError:
                    break

            assert found_entry, "Did not receive persona_entry broadcast"
