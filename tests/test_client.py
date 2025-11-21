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
    """Test sending command returns connection error when service unavailable."""
    config = SophiaConfig()
    client = SophiaClient(config)

    response = client.send_command("test command")

    assert isinstance(response, SophiaResponse)
    assert response.success is False
    assert response.error


def test_sophia_client_get_state() -> None:
    """Test getting state returns connection error when service unavailable."""
    config = SophiaConfig()
    client = SophiaClient(config)

    response = client.get_state()

    assert isinstance(response, SophiaResponse)
    assert response.success is False
    assert response.error


def test_sophia_client_get_plans() -> None:
    """Test getting plans returns connection error when service unavailable."""
    config = SophiaConfig()
    client = SophiaClient(config)

    response = client.get_plans(limit=5)

    assert isinstance(response, SophiaResponse)
    assert response.success is False
    assert response.error


def test_sophia_client_health_check() -> None:
    """Test health check returns False when service unavailable."""
    config = SophiaConfig()
    client = SophiaClient(config)

    health = client.health_check()

    assert health is False


def test_sophia_client_create_goal() -> None:
    """Test creating goal returns connection error when service unavailable."""
    config = SophiaConfig()
    client = SophiaClient(config)

    response = client.create_goal("Navigate to kitchen", {"priority": "high"})

    assert isinstance(response, SophiaResponse)
    assert response.success is False
    assert response.error


def test_sophia_client_invoke_planner() -> None:
    """Test invoking planner returns connection error when service unavailable."""
    config = SophiaConfig()
    client = SophiaClient(config)

    response = client.invoke_planner("goal_12345")

    assert isinstance(response, SophiaResponse)
    assert response.success is False
    assert response.error


def test_sophia_client_execute_step() -> None:
    """Test executing step returns connection error when service unavailable."""
    config = SophiaConfig()
    client = SophiaClient(config)

    response = client.execute_step("plan_12345", step_index=0)

    assert isinstance(response, SophiaResponse)
    assert response.success is False
    assert "talos" in response.error.lower()
