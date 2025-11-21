"""Tests for persona client."""

from apollo.client.persona_client import PersonaClient
from apollo.config.settings import PersonaApiConfig


def test_persona_client_initialization() -> None:
    config = PersonaApiConfig(host="example.com", port=9001, timeout=5)
    client = PersonaClient(config)

    assert client.base_url == "http://example.com:9001"
    assert client.timeout == 5


def test_persona_client_create_entry_failure() -> None:
    """Should surface connection failure when API is unavailable."""
    config = PersonaApiConfig(host="localhost", port=59999, timeout=1)
    client = PersonaClient(config)

    response = client.create_entry(
        content="test entry",
        entry_type="observation",
        summary=None,
        sentiment=None,
        confidence=None,
        process=[],
        goal=[],
        emotion=[],
    )

    assert response.success is False
    assert response.error
