"""Tests for the Hermes chat streaming endpoint and helpers."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any, Dict, List

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from apollo.api import server


class _StubHermesResponse:
    def __init__(
        self, data: Dict[str, Any], success: bool = True, error: str | None = None
    ) -> None:
        self.data = data
        self.success = success
        self.error = error


class _StubHermesClient:
    def __init__(self, response: _StubHermesResponse) -> None:
        self._response = response
        self.requests: List[Any] = []

    def llm_generate(self, request: Any) -> _StubHermesResponse:
        self.requests.append(request)
        return self._response


class _StubPersonaStore:
    def __init__(self) -> None:
        self.entries: List[Any] = []

    def create_entry(self, entry: Any) -> Any:
        self.entries.append(entry)
        return entry


def _collect_sse_payloads(response) -> List[dict]:
    payloads: List[dict] = []
    for raw_line in response.iter_lines():
        if not raw_line:
            continue
        line = raw_line if isinstance(raw_line, str) else raw_line.decode()
        if not line.startswith("data:"):
            continue
        payloads.append(json.loads(line.replace("data:", "", 1).strip()))
    return payloads


def test_chat_stream_emits_chunks_and_persists_persona(monkeypatch) -> None:
    """Ensure /api/chat/stream relays Hermes output, stores persona entries, and emits SSE events."""
    hermes_payload = {
        "id": "resp-123",
        "provider": "openai",
        "model": "gpt-4o-mini",
        "choices": [{"message": {"content": "Hello from Hermes."}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }
    stub_client = _StubHermesClient(_StubHermesResponse(data=hermes_payload))
    persona_store = _StubPersonaStore()

    monkeypatch.setattr(server, "hermes_client", stub_client)
    monkeypatch.setattr(server, "persona_store", persona_store)

    payload = {
        "messages": [
            {"role": "system", "content": "System instructions"},
            {"role": "user", "content": "Test streaming please."},
        ],
        "metadata": {
            "session_id": "session-1",
            "surface": "apollo-webapp.chat-panel",
            "discard": "",
        },
        "provider": "openai",
        "model": "gpt-4o-mini",
    }

    with _test_client(monkeypatch) as client:
        with client.stream("POST", "/api/chat/stream", json=payload) as response:
            assert response.status_code == 200
            events = _collect_sse_payloads(response)

    assert len(events) >= 2
    assert events[0]["type"] == "chunk"
    assert events[-1]["type"] == "end"
    assert "Hello from Hermes." in events[-1]["content"]
    assert persona_store.entries, "Persona diary entry was not persisted"
    stored_entry = persona_store.entries[0]
    assert stored_entry.metadata["hermes_model"] == "gpt-4o-mini"
    assert stored_entry.summary.startswith("Test streaming")


def test_chat_stream_handles_hermes_failure(monkeypatch) -> None:
    """Hermes errors should be surfaced as SSE error events."""
    stub_client = _StubHermesClient(
        _StubHermesResponse(success=False, data={}, error="Hermes unavailable")
    )
    monkeypatch.setattr(server, "hermes_client", stub_client)
    monkeypatch.setattr(server, "persona_store", None)

    payload = {
        "messages": [{"role": "user", "content": "hi"}],
        "metadata": {},
    }

    with _test_client(monkeypatch) as client:
        with client.stream("POST", "/api/chat/stream", json=payload) as response:
            events = _collect_sse_payloads(response)
            status_code = response.status_code

    assert status_code == 200
    assert events and events[0]["type"] == "error"
    assert "Hermes unavailable" in events[0]["message"]


def test_build_llm_request_requires_messages() -> None:
    """_build_llm_request should reject empty message lists."""
    stream_request = server.ChatStreamRequest(messages=[], metadata={})
    with pytest.raises(HTTPException):
        server._build_llm_request(stream_request, {})


def test_chunk_text_honors_chunk_size() -> None:
    """_chunk_text should split long content into bounded segments."""
    content = " ".join(f"token-{i}" for i in range(30))
    chunks = server._chunk_text(content, chunk_size=20)
    assert len(chunks) > 1
    assert all(len(chunk) <= 20 for chunk in chunks[:-1])


def test_sanitize_metadata_discards_empty_values() -> None:
    """_sanitize_metadata should remove empty/falsey containers."""
    payload = {
        "session_id": "123",
        "empty": "",
        "none": None,
        "list": [],
        "details": {"foo": "bar"},
    }
    sanitized = server._sanitize_metadata(payload)
    assert "session_id" in sanitized
    assert "details" in sanitized
    assert "empty" not in sanitized
    assert "list" not in sanitized


def test_latest_user_message_returns_last_user_turn() -> None:
    """_latest_user_message should find the most recent user message."""
    messages = [
        server.ChatMessagePayload(role="user", content="first"),
        server.ChatMessagePayload(role="assistant", content="reply"),
        server.ChatMessagePayload(role="user", content="latest"),
    ]
    assert server._latest_user_message(messages) == "latest"


def test_truncate_summary_applies_ellipsis() -> None:
    """_truncate_summary should trim overly long summaries."""
    summary = "a" * 200
    truncated = server._truncate_summary(summary, max_length=50)
    assert truncated.endswith("…")
    assert len(truncated) <= 51


@asynccontextmanager
async def _noop_lifespan(_app):
    yield


def _test_client(monkeypatch):
    monkeypatch.setattr(server.app.router, "lifespan_context", _noop_lifespan)
    return TestClient(server.app)
