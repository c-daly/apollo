"""Tests for persona entry API endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import List

from fastapi.testclient import TestClient

from apollo.api import server
from apollo.data.models import PersonaEntry


class InMemoryPersonaStore:
    """Simple in-memory substitute for PersonaDiaryStore used in tests."""

    def __init__(self) -> None:
        self._entries: dict[str, PersonaEntry] = {}

    def create_entry(self, entry: PersonaEntry) -> PersonaEntry:
        self._entries[entry.id] = entry
        return entry

    def list_entries(
        self,
        *,
        entry_type: str | None = None,
        sentiment: str | None = None,
        related_process_id: str | None = None,
        related_goal_id: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[PersonaEntry]:
        entries = sorted(
            self._entries.values(), key=lambda e: e.timestamp, reverse=True
        )

        def include(entry: PersonaEntry) -> bool:
            if entry_type and entry.entry_type != entry_type:
                return False
            if sentiment and entry.sentiment != sentiment:
                return False
            if (
                related_process_id
                and related_process_id not in entry.related_process_ids
            ):
                return False
            if related_goal_id and related_goal_id not in entry.related_goal_ids:
                return False
            return True

        filtered = [entry for entry in entries if include(entry)]
        return filtered[offset : offset + limit]

    def get_entry(self, entry_id: str) -> PersonaEntry | None:
        return self._entries.get(entry_id)


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


def test_get_persona_entries_filters(monkeypatch) -> None:
    """Ensure persona entry list endpoint respects filters."""
    store = InMemoryPersonaStore()
    base_time = datetime.now()

    store.create_entry(
        PersonaEntry(
            id="belief-positive",
            timestamp=base_time,
            entry_type="belief",
            content="belief note",
            sentiment="positive",
            related_process_ids=["proc-a"],
            related_goal_ids=["goal-a"],
        )
    )
    store.create_entry(
        PersonaEntry(
            id="decision-negative",
            timestamp=base_time - timedelta(minutes=1),
            entry_type="decision",
            content="decision note",
            sentiment="negative",
            related_process_ids=["proc-b"],
            related_goal_ids=["goal-b"],
        )
    )

    monkeypatch.setattr(server, "persona_store", store)
    client = TestClient(server.app)

    resp = client.get(
        "/api/persona/entries",
        params={"entry_type": "belief", "sentiment": "positive"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == "belief-positive"

    resp_goal = client.get("/api/persona/entries", params={"related_goal_id": "goal-b"})
    assert resp_goal.status_code == 200
    assert resp_goal.json()[0]["id"] == "decision-negative"


def test_get_persona_entry_detail(monkeypatch) -> None:
    """Verify retrieving a single persona entry."""
    store = InMemoryPersonaStore()
    entry = PersonaEntry(
        id="detail-id",
        timestamp=datetime.now(),
        entry_type="reflection",
        content="detail content",
    )
    store.create_entry(entry)
    monkeypatch.setattr(server, "persona_store", store)

    client = TestClient(server.app)
    detail = client.get("/api/persona/entries/detail-id")
    assert detail.status_code == 200
    assert detail.json()["content"] == "detail content"

    missing = client.get("/api/persona/entries/unknown")
    assert missing.status_code == 404
