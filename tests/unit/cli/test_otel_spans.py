"""Tests for OpenTelemetry span creation in Apollo CLI commands."""

from unittest.mock import MagicMock, Mock, patch

import pytest
from click.testing import CliRunner
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter


@pytest.fixture()
def span_capture():
    """Provide an InMemorySpanExporter and a tracer from a dedicated provider."""
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    tracer = provider.get_tracer("apollo.cli")

    import apollo.cli.main as cli_mod

    original_tracer = cli_mod.cli_tracer
    cli_mod.cli_tracer = tracer

    yield exporter

    cli_mod.cli_tracer = original_tracer
    exporter.shutdown()
    provider.shutdown()


@pytest.fixture()
def mock_sophia_client():
    """Mock SophiaClient with successful responses."""
    client = Mock()
    client.invoke_planner = Mock(
        return_value=Mock(
            success=True,
            data={"plan_id": "plan_001", "steps": ["step1"]},
            error=None,
        )
    )
    client.execute_step = Mock(
        return_value=Mock(
            success=True,
            data={"result": "ok"},
            error=None,
        )
    )
    return client


@pytest.fixture()
def mock_cli_context(mock_sophia_client):
    """Patch CLI context setup to avoid real service connections."""
    mock_config = MagicMock()
    mock_hermes = Mock()
    mock_persona = Mock()

    with patch("apollo.cli.main.ApolloConfig") as MockConfig:
        MockConfig.load.return_value = mock_config
        with patch("apollo.cli.main.SophiaClient", return_value=mock_sophia_client):
            with patch("apollo.cli.main.HermesClient", return_value=mock_hermes):
                with patch("apollo.cli.main.PersonaClient", return_value=mock_persona):
                    yield


def test_plan_command_creates_span(span_capture, mock_cli_context):
    """plan command creates an apollo.cli.plan span."""
    from apollo.cli.main import cli

    runner = CliRunner()
    result = runner.invoke(cli, ["plan", "Inspect the kitchen"])
    assert result.exit_code == 0, f"CLI failed: {result.output}"

    spans = span_capture.get_finished_spans()
    span_names = [s.name for s in spans]
    assert "apollo.cli.plan" in span_names

    plan_span = next(s for s in spans if s.name == "apollo.cli.plan")
    assert plan_span.attributes.get("plan.goal") is not None


def test_execute_command_creates_span(span_capture, mock_cli_context):
    """execute command creates an apollo.cli.execute span."""
    from apollo.cli.main import cli

    runner = CliRunner()
    result = runner.invoke(cli, ["execute", "plan_001", "--step", "0"])
    assert result.exit_code == 0, f"CLI failed: {result.output}"

    spans = span_capture.get_finished_spans()
    span_names = [s.name for s in spans]
    assert "apollo.cli.execute" in span_names

    exec_span = next(s for s in spans if s.name == "apollo.cli.execute")
    assert exec_span.attributes.get("execute.plan_id") == "plan_001"
    assert exec_span.attributes.get("execute.step") == 0
