"""
CLI End-to-End Tests for Apollo

Test Apollo CLI commands against real services.
Uses Click's CliRunner for CLI testing.

Based on logos/tests/e2e patterns.
"""

import pytest
from click.testing import CliRunner

from apollo.cli.main import cli


pytestmark = pytest.mark.e2e


@pytest.fixture
def cli_runner():
    """Click CLI test runner."""
    return CliRunner()


class TestCLIStatus:
    """Test the 'status' CLI command."""

    @pytest.mark.requires_sophia
    def test_status_command_succeeds(self, cli_runner):
        """Status command should complete successfully."""
        result = cli_runner.invoke(cli, ["status"])
        assert result.exit_code == 0, f"status failed: {result.output}"
        assert "Apollo CLI" in result.output

    @pytest.mark.requires_sophia
    def test_status_shows_sophia_connection(self, cli_runner):
        """Status should show Sophia connection status."""
        result = cli_runner.invoke(cli, ["status"])
        assert result.exit_code == 0
        # Should show connection status (either connected or not)
        assert "Sophia" in result.output or "sophia" in result.output.lower()


class TestCLIState:
    """Test the 'state' CLI command."""

    @pytest.mark.requires_sophia
    def test_state_command_succeeds(self, cli_runner):
        """State command should complete successfully."""
        result = cli_runner.invoke(cli, ["state"])
        assert result.exit_code == 0, f"state failed: {result.output}"

    @pytest.mark.requires_sophia
    def test_state_returns_data(self, cli_runner):
        """State should display agent state from Sophia."""
        result = cli_runner.invoke(cli, ["state"])
        assert result.exit_code == 0
        # Should show some state data (exact format depends on mock)
        assert "State" in result.output or "state" in result.output.lower()


class TestCLISend:
    """Test the 'send' CLI command."""

    @pytest.mark.requires_sophia
    def test_send_command_with_argument(self, cli_runner):
        """Send command should accept command argument."""
        result = cli_runner.invoke(cli, ["send", "pick up the red block"])
        assert result.exit_code == 0, f"send failed: {result.output}"

    @pytest.mark.requires_sophia
    def test_send_returns_response(self, cli_runner):
        """Send should display response from Sophia."""
        result = cli_runner.invoke(cli, ["send", "move to position"])
        assert result.exit_code == 0
        # Should show some response (plan, acknowledgment, etc.)
        assert len(result.output) > 0


class TestCLIGoal:
    """Test the 'goal' CLI command."""

    @pytest.mark.requires_sophia
    def test_goal_command_with_description(self, cli_runner):
        """Goal command should accept description."""
        result = cli_runner.invoke(cli, ["goal", "put red block in bin"])
        assert result.exit_code == 0, f"goal failed: {result.output}"

    @pytest.mark.requires_sophia
    def test_goal_with_priority(self, cli_runner):
        """Goal command should accept priority option."""
        result = cli_runner.invoke(cli, ["goal", "urgent task", "--priority", "high"])
        assert result.exit_code == 0, f"goal with priority failed: {result.output}"


class TestCLIPlan:
    """Test the 'plan' CLI command."""

    @pytest.mark.requires_sophia
    def test_plan_command_with_goal(self, cli_runner):
        """Plan command should accept goal argument."""
        result = cli_runner.invoke(cli, ["plan", "organize workspace"])
        assert result.exit_code == 0, f"plan failed: {result.output}"

    @pytest.mark.requires_sophia
    def test_plan_returns_steps(self, cli_runner):
        """Plan should return plan steps."""
        result = cli_runner.invoke(cli, ["plan", "pick and place"])
        assert result.exit_code == 0
        # Should show some plan output
        assert len(result.output) > 0


class TestCLIPlans:
    """Test the 'plans' CLI command."""

    @pytest.mark.requires_sophia
    def test_plans_command_succeeds(self, cli_runner):
        """Plans command should list recent plans."""
        result = cli_runner.invoke(cli, ["plans"])
        assert result.exit_code == 0, f"plans failed: {result.output}"

    @pytest.mark.requires_sophia
    def test_plans_with_recent_limit(self, cli_runner):
        """Plans command should accept --recent option."""
        result = cli_runner.invoke(cli, ["plans", "--recent", "5"])
        assert result.exit_code == 0, f"plans --recent failed: {result.output}"


class TestCLIDiary:
    """Test the 'diary' CLI command for persona entries."""

    @pytest.mark.requires_sophia
    def test_diary_create_entry(self, cli_runner, unique_id: str):
        """Diary command should create persona entry."""
        result = cli_runner.invoke(
            cli,
            [
                "diary",
                f"E2E test entry {unique_id}",
                "--type",
                "observation",
                "--sentiment",
                "neutral",
            ],
        )
        # May fail if persona API not available, but shouldn't crash
        assert result.exit_code in [0, 1], f"diary crashed: {result.output}"

    @pytest.mark.requires_sophia
    def test_diary_with_emotion_tags(self, cli_runner, unique_id: str):
        """Diary should accept emotion tags."""
        result = cli_runner.invoke(
            cli,
            [
                "diary",
                f"Feeling productive {unique_id}",
                "--type",
                "reflection",
                "--sentiment",
                "positive",
                "--emotion",
                "focused",
                "--emotion",
                "curious",
            ],
        )
        assert result.exit_code in [
            0,
            1,
        ], f"diary with emotions crashed: {result.output}"


class TestCLIEmbed:
    """Test the 'embed' CLI command for text embeddings."""

    @pytest.mark.requires_milvus
    def test_embed_command(self, cli_runner):
        """Embed command should generate embeddings."""
        result = cli_runner.invoke(cli, ["embed", "test text for embedding"])
        # Embedding service must be available for integration tests
        assert "not available" not in result.output.lower(), (
            "Embedding service not available. Start the test stack: "
            "./scripts/test_stack.sh up"
        )
        assert result.exit_code == 0, f"embed failed: {result.output}"


class TestCLIHelp:
    """Test CLI help output."""

    def test_main_help(self, cli_runner):
        """Main CLI should show help."""
        result = cli_runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "Apollo CLI" in result.output

    def test_status_help(self, cli_runner):
        """Status command should show help."""
        result = cli_runner.invoke(cli, ["status", "--help"])
        assert result.exit_code == 0

    def test_chat_help(self, cli_runner):
        """Chat command should show help."""
        result = cli_runner.invoke(cli, ["chat", "--help"])
        assert result.exit_code == 0
        assert "message" in result.output.lower() or "chat" in result.output.lower()
