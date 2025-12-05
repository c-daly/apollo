"""Integration tests for diagnostics websocket and persona diary."""

from typing import List, Optional

import pytest
from fastapi.testclient import TestClient

from apollo.api import server
from apollo.data.models import PersonaEntry, Process


class MockPersonaStore:
    """In-memory persona store for testing."""

    def __init__(self, *args, **kwargs):
        self.entries: dict[str, PersonaEntry] = {}

    def connect(self):
        pass

    def close(self):
        pass

    def create_entry(self, entry: PersonaEntry) -> PersonaEntry:
        self.entries[entry.id] = entry
        return entry

    def get_entry(self, entry_id: str) -> Optional[PersonaEntry]:
        return self.entries.get(entry_id)

    def list_entries(self, **kwargs) -> List[PersonaEntry]:
        return list(self.entries.values())


class MockHCGClient:
    """Mock HCG client for testing."""

    def __init__(self, *args, **kwargs):
        pass

    def connect(self):
        pass

    def close(self):
        pass

    def health_check(self) -> bool:
        return True

    def get_processes(self, *args, **kwargs) -> List[Process]:
        return []


@pytest.fixture
def mock_dependencies(monkeypatch):
    """Patch external dependencies to use mocks."""
    # Patch the classes where they are defined
    monkeypatch.setattr("apollo.data.hcg_client.HCGClient", MockHCGClient)
    monkeypatch.setattr("apollo.data.persona_store.PersonaDiaryStore", MockPersonaStore)

    # Patch the references in server.py
    monkeypatch.setattr(server, "HCGClient", MockHCGClient)
    monkeypatch.setattr(server, "PersonaDiaryStore", MockPersonaStore)


def test_persona_entry_broadcasts_to_websocket(mock_dependencies):
    """
    Verify that creating a persona entry triggers a broadcast event
    on the diagnostics websocket.
    """
    with TestClient(server.app) as client:
        with client.websocket_connect("/ws/diagnostics") as websocket:
            # Receive initial messages (telemetry and logs) with timeout
            websocket.timeout = 5.0  # 5 second timeout for receives

            initial_telemetry = websocket.receive_json()
            assert initial_telemetry["type"] == "telemetry"

            initial_logs = websocket.receive_json()
            assert initial_logs["type"] == "logs"

            # Create a persona entry via API
            payload = {
                "entry_type": "observation",
                "content": "Integration test entry",
                "summary": "Testing websocket broadcast",
                "sentiment": "neutral",
                "confidence": 1.0,
                "metadata": {"test_id": "ws_integration"},
            }

            response = client.post("/api/persona/entries", json=payload)
            assert response.status_code == 201
            created_entry = response.json()
            assert created_entry["content"] == "Integration test entry"

            # Helper to receive next non-telemetry message
            def receive_next_relevant_message(max_attempts=20):
                attempts = 0
                while attempts < max_attempts:
                    msg = websocket.receive_json()
                    # Skip telemetry and connection log messages
                    if msg["type"] == "telemetry":
                        attempts += 1
                        continue
                    if (
                        msg["type"] == "log"
                        and "WebSocket connected" in msg["data"]["message"]
                    ):
                        attempts += 1
                        continue
                    # Skip HCG health check logs from telemetry poller
                    if (
                        msg["type"] == "log"
                        and "HCG health check" in msg["data"]["message"]
                    ):
                        attempts += 1
                        continue
                    return msg
                raise TimeoutError(
                    f"Did not receive relevant message after {max_attempts} attempts"
                )

            # Wait for the broadcast message
            # The server broadcasts a log message first, then the entry
            # We skip telemetry updates that might happen in the background
            log_message = receive_next_relevant_message()
            assert log_message["type"] == "log"
            assert "Persona entry created" in log_message["data"]["message"]

            message = receive_next_relevant_message()

            assert message["type"] == "persona_entry"
            data = message["data"]
            assert data["id"] == created_entry["id"]
            assert data["content"] == "Integration test entry"
            assert data["metadata"]["test_id"] == "ws_integration"
