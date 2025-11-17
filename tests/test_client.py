"""Tests for Sophia client."""

from apollo.client.sophia_client import SophiaClient, SophiaResponse
from apollo.config.settings import SophiaConfig


def test_sophia_client_initialization() -> None:
    """Test SophiaClient initialization."""
    config = SophiaConfig(host="test-host", port=9090)
    client = SophiaClient(config)

    assert client.config == config
    assert client.base_url == "http://test-host:9090"
    assert client.timeout == 30


def test_sophia_client_send_command() -> None:
    """Test sending command (placeholder)."""
    config = SophiaConfig()
    client = SophiaClient(config)

    response = client.send_command("test command")

    assert isinstance(response, SophiaResponse)
    assert response.success is False
    assert "not yet implemented" in response.error.lower()


def test_sophia_client_get_state() -> None:
    """Test getting state (placeholder)."""
    config = SophiaConfig()
    client = SophiaClient(config)

    response = client.get_state()

    assert isinstance(response, SophiaResponse)
    assert response.success is False
    assert "not yet implemented" in response.error.lower()


def test_sophia_client_get_plans() -> None:
    """Test getting plans (placeholder)."""
    config = SophiaConfig()
    client = SophiaClient(config)

    response = client.get_plans(limit=5)

    assert isinstance(response, SophiaResponse)
    assert response.success is False
    assert "not yet implemented" in response.error.lower()


def test_sophia_client_health_check() -> None:
    """Test health check (placeholder)."""
    config = SophiaConfig()
    client = SophiaClient(config)

    health = client.health_check()

    assert health is False
