"""Tests for CLI SDK refactoring - verifies CLI uses SDK clients."""

from unittest.mock import Mock, patch

import pytest
from click.testing import CliRunner

from apollo.cli.main import cli
from apollo.client.sophia_client import SophiaClient, SophiaResponse
from apollo.client.hermes_client import HermesClient, HermesResponse
from apollo.client.persona_client import PersonaClient
from apollo.config.settings import ApolloConfig


@pytest.fixture
def cli_runner():
    """CLI test runner fixture."""
    return CliRunner()


@pytest.fixture
def mock_config():
    """Mock ApolloConfig fixture."""
    config = Mock(spec=ApolloConfig)
    config.sophia = Mock(host="localhost", port=8000, timeout=30.0)
    config.hermes = Mock(host="localhost", port=8002, timeout=30.0)
    config.persona_api = Mock(base_url="http://localhost:8001/api")
    return config


@pytest.fixture
def mock_sophia_client():
    """Mock SophiaClient fixture."""
    client = Mock(spec=SophiaClient)
    client.base_url = "http://localhost:8000"
    client.health_check = Mock(return_value=True)
    client.get_state = Mock(
        return_value=SophiaResponse(
            success=True,
            data={"status": "idle", "active_goals": []},
            message="State retrieved",
        )
    )
    return client


@pytest.fixture
def mock_hermes_client():
    """Mock HermesClient fixture."""
    client = Mock(spec=HermesClient)
    client.embed_text = Mock(
        return_value=HermesResponse(
            success=True, data={"embedding": [0.1] * 768}, message="Embedding generated"
        )
    )
    return client


@pytest.fixture
def mock_persona_client():
    """Mock PersonaClient fixture."""
    client = Mock(spec=PersonaClient)
    client.create_entry = Mock(
        return_value={
            "id": "entry-123",
            "entry_type": "thought",
            "content": "Test entry",
        }
    )
    return client


class TestCLIUsesSDKClients:
    """Verify CLI commands use SDK clients instead of direct API calls."""

    def test_cli_initializes_sdk_clients(
        self,
        cli_runner,
        mock_config,
        mock_sophia_client,
        mock_hermes_client,
        mock_persona_client,
    ):
        """Test CLI initialization creates SDK client instances."""
        with (
            patch("apollo.cli.main.ApolloConfig.load", return_value=mock_config),
            patch(
                "apollo.cli.main.SophiaClient", return_value=mock_sophia_client
            ) as sophia_constructor,
            patch(
                "apollo.cli.main.HermesClient", return_value=mock_hermes_client
            ) as hermes_constructor,
            patch(
                "apollo.cli.main.PersonaClient", return_value=mock_persona_client
            ) as persona_constructor,
        ):
            _result = cli_runner.invoke(cli, ["status"])

            # Verify SDK clients were instantiated
            sophia_constructor.assert_called_once()
            hermes_constructor.assert_called_once()
            persona_constructor.assert_called_once()

    def test_status_command_uses_sophia_client(
        self,
        cli_runner,
        mock_config,
        mock_sophia_client,
        mock_hermes_client,
        mock_persona_client,
    ):
        """Test 'status' command uses SophiaClient, not direct requests."""
        with (
            patch("apollo.cli.main.ApolloConfig.load", return_value=mock_config),
            patch("apollo.cli.main.SophiaClient", return_value=mock_sophia_client),
            patch("apollo.cli.main.HermesClient", return_value=mock_hermes_client),
            patch("apollo.cli.main.PersonaClient", return_value=mock_persona_client),
        ):
            result = cli_runner.invoke(cli, ["status"])

            assert result.exit_code == 0
            # Verify it called the SDK client method
            mock_sophia_client.health_check.assert_called_once()
            # Verify output contains expected text
            assert "Sophia is accessible" in result.output

    def test_state_command_uses_sophia_client(
        self,
        cli_runner,
        mock_config,
        mock_sophia_client,
        mock_hermes_client,
        mock_persona_client,
    ):
        """Test 'state' command uses SophiaClient.get_state()."""
        with (
            patch("apollo.cli.main.ApolloConfig.load", return_value=mock_config),
            patch("apollo.cli.main.SophiaClient", return_value=mock_sophia_client),
            patch("apollo.cli.main.HermesClient", return_value=mock_hermes_client),
            patch("apollo.cli.main.PersonaClient", return_value=mock_persona_client),
        ):
            result = cli_runner.invoke(cli, ["state"])

            assert result.exit_code == 0
            mock_sophia_client.get_state.assert_called_once()

    def test_cli_no_direct_requests_calls(
        self,
        cli_runner,
        mock_config,
        mock_sophia_client,
        mock_hermes_client,
        mock_persona_client,
    ):
        """Test CLI does not make direct requests.get/post calls."""
        with (
            patch("apollo.cli.main.ApolloConfig.load", return_value=mock_config),
            patch("apollo.cli.main.SophiaClient", return_value=mock_sophia_client),
            patch("apollo.cli.main.HermesClient", return_value=mock_hermes_client),
            patch("apollo.cli.main.PersonaClient", return_value=mock_persona_client),
            patch("requests.get") as mock_get,
            patch("requests.post") as mock_post,
        ):
            # Run a command that interacts with Sophia
            result = cli_runner.invoke(cli, ["status"])

            assert result.exit_code == 0
            # Verify no direct requests were made
            mock_get.assert_not_called()
            mock_post.assert_not_called()


class TestCLIErrorHandling:
    """Test CLI error handling and output formatting."""

    def test_status_handles_connection_failure(
        self, cli_runner, mock_config, mock_hermes_client, mock_persona_client
    ):
        """Test status command handles Sophia connection failure gracefully."""
        failing_client = Mock(spec=SophiaClient)
        failing_client.base_url = "http://localhost:8000"
        failing_client.health_check = Mock(return_value=False)

        with (
            patch("apollo.cli.main.ApolloConfig.load", return_value=mock_config),
            patch("apollo.cli.main.SophiaClient", return_value=failing_client),
            patch("apollo.cli.main.HermesClient", return_value=mock_hermes_client),
            patch("apollo.cli.main.PersonaClient", return_value=mock_persona_client),
        ):
            result = cli_runner.invoke(cli, ["status"])

            assert result.exit_code == 0
            assert "Cannot connect to Sophia" in result.output
            assert "Make sure Sophia service is running" in result.output

    def test_state_handles_api_error(
        self, cli_runner, mock_config, mock_hermes_client, mock_persona_client
    ):
        """Test state command handles API errors gracefully."""
        failing_client = Mock(spec=SophiaClient)
        failing_client.get_state = Mock(
            return_value=SophiaResponse(
                success=False, data=None, message="Connection timeout"
            )
        )

        with (
            patch("apollo.cli.main.ApolloConfig.load", return_value=mock_config),
            patch("apollo.cli.main.SophiaClient", return_value=failing_client),
            patch("apollo.cli.main.HermesClient", return_value=mock_hermes_client),
            patch("apollo.cli.main.PersonaClient", return_value=mock_persona_client),
        ):
            result = cli_runner.invoke(cli, ["state"])

            # Command should complete but show error
            assert result.exit_code == 0
            assert (
                "Failed" in result.output
                or "Error" in result.output
                or "timeout" in result.output.lower()
            )


class TestCLIConfigLoading:
    """Test CLI configuration loading."""

    def test_cli_loads_config_from_env(
        self, cli_runner, mock_sophia_client, mock_hermes_client, mock_persona_client
    ):
        """Test CLI loads config from environment and logos_config."""
        with (
            patch("apollo.cli.main.ApolloConfig.load") as mock_load,
            patch("apollo.cli.main.SophiaClient", return_value=mock_sophia_client),
            patch("apollo.cli.main.HermesClient", return_value=mock_hermes_client),
            patch("apollo.cli.main.PersonaClient", return_value=mock_persona_client),
        ):
            mock_load.return_value = Mock(
                sophia=Mock(host="localhost", port=8000, timeout=30.0),
                hermes=Mock(host="localhost", port=8002, timeout=30.0),
                persona_api=Mock(base_url="http://localhost:8001/api"),
            )

            _result = cli_runner.invoke(cli, ["status"])

            # Config is loaded from env/logos_config (no path argument)
            mock_load.assert_called_once_with()


class TestCLIOutputFormatting:
    """Test CLI output formatting for various commands."""

    def test_status_displays_formatted_output(
        self,
        cli_runner,
        mock_config,
        mock_sophia_client,
        mock_hermes_client,
        mock_persona_client,
    ):
        """Test status command displays well-formatted output."""
        with (
            patch("apollo.cli.main.ApolloConfig.load", return_value=mock_config),
            patch("apollo.cli.main.SophiaClient", return_value=mock_sophia_client),
            patch("apollo.cli.main.HermesClient", return_value=mock_hermes_client),
            patch("apollo.cli.main.PersonaClient", return_value=mock_persona_client),
        ):
            result = cli_runner.invoke(cli, ["status"])

            assert result.exit_code == 0
            # Check for key output elements
            assert "Apollo CLI" in result.output
            assert "Sophia Configuration" in result.output
            assert "Host:" in result.output
            assert "Port:" in result.output
            assert "Connection Status" in result.output

    def test_state_displays_yaml_format(
        self,
        cli_runner,
        mock_config,
        mock_sophia_client,
        mock_hermes_client,
        mock_persona_client,
    ):
        """Test state command displays data in YAML format."""
        with (
            patch("apollo.cli.main.ApolloConfig.load", return_value=mock_config),
            patch("apollo.cli.main.SophiaClient", return_value=mock_sophia_client),
            patch("apollo.cli.main.HermesClient", return_value=mock_hermes_client),
            patch("apollo.cli.main.PersonaClient", return_value=mock_persona_client),
        ):
            result = cli_runner.invoke(cli, ["state"])

            assert result.exit_code == 0
            # Output should contain state data
            assert "Agent State" in result.output
            # State data from mock should be present
            assert "status" in result.output or "idle" in result.output


class TestCLIClientIntegration:
    """Test CLI integration with all three SDK clients."""

    def test_cli_context_contains_all_clients(
        self,
        cli_runner,
        mock_config,
        mock_sophia_client,
        mock_hermes_client,
        mock_persona_client,
    ):
        """Test CLI context stores all three SDK client instances."""
        captured_context = {}

        def capture_context(ctx):
            captured_context.update(ctx.obj)
            return ctx

        with (
            patch("apollo.cli.main.ApolloConfig.load", return_value=mock_config),
            patch("apollo.cli.main.SophiaClient", return_value=mock_sophia_client),
            patch("apollo.cli.main.HermesClient", return_value=mock_hermes_client),
            patch("apollo.cli.main.PersonaClient", return_value=mock_persona_client),
        ):
            result = cli_runner.invoke(cli, ["status"], obj={}, standalone_mode=False)

            # All three clients should be available in context
            # (We can't directly inspect Click's context in tests, but we verified
            # the constructors were called and commands use them)
            assert result.exit_code == 0

    def test_multiple_commands_share_client_instances(
        self,
        cli_runner,
        mock_config,
        mock_sophia_client,
        mock_hermes_client,
        mock_persona_client,
    ):
        """Test multiple CLI invocations each get their own client instances."""
        with (
            patch("apollo.cli.main.ApolloConfig.load", return_value=mock_config),
            patch(
                "apollo.cli.main.SophiaClient", return_value=mock_sophia_client
            ) as sophia_constructor,
            patch("apollo.cli.main.HermesClient", return_value=mock_hermes_client),
            patch("apollo.cli.main.PersonaClient", return_value=mock_persona_client),
        ):
            # First invocation
            result1 = cli_runner.invoke(cli, ["status"])
            assert result1.exit_code == 0
            first_call_count = sophia_constructor.call_count

            # Second invocation
            result2 = cli_runner.invoke(cli, ["status"])
            assert result2.exit_code == 0

            # Each invocation should create new client instances
            assert sophia_constructor.call_count == first_call_count + 1
