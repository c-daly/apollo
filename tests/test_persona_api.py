"""Tests for persona entry API endpoints."""

from datetime import datetime

from fastapi.testclient import TestClient

from apollo.api import server
from apollo.data.models import PersonaEntry


def test_persona_entry_model():
    """Test PersonaEntry model creation and validation."""
    entry = PersonaEntry(
        id="test_1",
        timestamp=datetime.now(),
        entry_type="belief",
        content="Test content",
        summary="Test summary",
        sentiment="positive",
        confidence=0.8,
        related_process_ids=["proc_1", "proc_2"],
        related_goal_ids=["goal_1"],
        emotion_tags=["happy", "confident"],
        metadata={"key": "value"},
    )

    assert entry.id == "test_1"
    assert entry.entry_type == "belief"
    assert entry.content == "Test content"
    assert entry.summary == "Test summary"
    assert entry.sentiment == "positive"
    assert entry.confidence == 0.8
    assert len(entry.related_process_ids) == 2
    assert len(entry.related_goal_ids) == 1
    assert len(entry.emotion_tags) == 2
    assert entry.metadata["key"] == "value"


def test_persona_entry_defaults():
    """Test PersonaEntry model with minimal fields."""
    entry = PersonaEntry(
        id="test_2",
        timestamp=datetime.now(),
        entry_type="observation",
        content="Minimal entry",
    )

    assert entry.id == "test_2"
    assert entry.entry_type == "observation"
    assert entry.content == "Minimal entry"
    assert entry.summary is None
    assert entry.sentiment is None
    assert entry.confidence is None
    assert entry.related_process_ids == []
    assert entry.related_goal_ids == []
    assert entry.emotion_tags == []
    assert entry.metadata == {}


def test_persona_entry_types():
    """Test various entry types."""
    types = ["belief", "decision", "observation", "reflection"]

    for entry_type in types:
        entry = PersonaEntry(
            id=f"test_{entry_type}",
            timestamp=datetime.now(),
            entry_type=entry_type,
            content=f"Test {entry_type} entry",
        )
        assert entry.entry_type == entry_type


def test_create_persona_entry_streams_to_diagnostics(monkeypatch) -> None:
    """Persona entries should broadcast over diagnostics stream."""

    class StubPersonaStore:
        def __init__(self) -> None:
            self.entries: list[PersonaEntry] = []

        def create_entry(self, entry: PersonaEntry) -> PersonaEntry:
            self.entries.append(entry)
            return entry

    broadcasted: list[PersonaEntry] = []

    async def fake_broadcast(entry: PersonaEntry) -> None:
        broadcasted.append(entry)

    stub_store = StubPersonaStore()
    monkeypatch.setattr(server, "persona_store", stub_store)
    monkeypatch.setattr(
        server.diagnostics_manager,
        "broadcast_persona_entry",
        fake_broadcast,
    )

    client = TestClient(server.app)
    payload = {
        "entry_type": "belief",
        "content": "Streaming entry test",
        "summary": "stream-summary",
        "sentiment": "positive",
        "confidence": 0.9,
        "related_process_ids": ["proc-1"],
        "related_goal_ids": ["goal-1"],
        "emotion_tags": ["curious"],
        "metadata": {"foo": "bar"},
    }

    response = client.post("/api/persona/entries", json=payload)
    assert response.status_code == 201
    created = response.json()
    assert created["content"] == "Streaming entry test"
    assert stub_store.entries  # ensures persistence path ran
    assert broadcasted, "Persona entry was not broadcast to diagnostics"
    assert broadcasted[0].content == "Streaming entry test"
