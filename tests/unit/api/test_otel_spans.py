"""Tests for OpenTelemetry span creation in Apollo API endpoints."""

from unittest.mock import MagicMock, Mock, patch

import pytest
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import StatusCode

from apollo.api.server import app


@pytest.fixture()
def span_capture():
    """Provide an InMemorySpanExporter and a tracer from a dedicated provider."""
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    # Build a tracer directly from this provider (avoids global-set issues)
    tracer = provider.get_tracer("apollo.api")
    yield exporter, tracer
    exporter.shutdown()
    provider.shutdown()


@pytest.fixture()
def otel_client(span_capture):
    """FastAPI TestClient with mocked deps and OTel capture."""
    exporter, tracer = span_capture
    from datetime import datetime
    from apollo.data.models import Entity, CausalEdge, GraphSnapshot

    mock_hcg = Mock()
    mock_hcg.health_check = Mock(return_value=True)
    mock_hcg.get_graph_snapshot = Mock(
        return_value=GraphSnapshot(
            entities=[
                Entity(
                    id="e1",
                    type="goal",
                    properties={},
                    labels=["Goal"],
                    created_at=datetime(2024, 1, 1),
                    updated_at=datetime(2024, 1, 1),
                )
            ],
            edges=[
                CausalEdge(
                    id="edge1",
                    source_id="e1",
                    target_id="s1",
                    edge_type="causes",
                    properties={},
                    weight=1.0,
                    created_at=datetime(2024, 1, 1),
                )
            ],
            timestamp=datetime(2024, 1, 1),
            metadata={"version": "1.0"},
        )
    )

    mock_hermes = Mock()
    mock_hermes.llm_generate = Mock(
        return_value=Mock(
            success=True,
            data={"choices": [{"message": {"content": "Hello!"}}], "usage": {}},
            error=None,
        )
    )

    mock_config = MagicMock()
    mock_config.hcg = None
    mock_config.hermes = MagicMock()
    mock_config.hermes.host = "localhost"
    mock_config.hermes.port = 18000

    import apollo.api.server as server_module

    # Swap the module-level tracer to our in-memory one
    original_tracer = server_module.tracer
    server_module.tracer = tracer

    with patch("apollo.api.server.ApolloConfig") as MockConfig:
        MockConfig.load.return_value = mock_config
        with TestClient(app) as client:
            server_module.hcg_client = mock_hcg
            server_module.hermes_client = mock_hermes
            server_module.persona_store = Mock()
            yield client

    server_module.tracer = original_tracer


def test_chat_endpoint_creates_span(otel_client, span_capture):
    """POST /api/chat/stream creates an apollo.api.chat span."""
    exporter, _ = span_capture

    response = otel_client.post(
        "/api/chat/stream",
        json={"messages": [{"role": "user", "content": "Hello"}]},
    )
    assert response.status_code == 200

    spans = exporter.get_finished_spans()
    span_names = [s.name for s in spans]
    assert "apollo.api.chat" in span_names

    chat_span = next(s for s in spans if s.name == "apollo.api.chat")
    assert chat_span.attributes.get("chat.prompt_length") == 5


def test_hcg_snapshot_creates_span(otel_client, span_capture):
    """GET /api/hcg/snapshot creates an apollo.api.hcg.snapshot span."""
    exporter, _ = span_capture

    response = otel_client.get("/api/hcg/snapshot")
    assert response.status_code == 200

    spans = exporter.get_finished_spans()
    span_names = [s.name for s in spans]
    assert "apollo.api.hcg.snapshot" in span_names

    snapshot_span = next(s for s in spans if s.name == "apollo.api.hcg.snapshot")
    assert snapshot_span.attributes.get("hcg.limit") == 200


def test_span_records_exception(otel_client, span_capture):
    """Verify span status is ERROR and exception is recorded on failure."""
    exporter, _ = span_capture
    import apollo.api.server as server_module

    server_module.hcg_client.get_graph_snapshot = Mock(
        side_effect=RuntimeError("Neo4j connection lost")
    )

    response = otel_client.get("/api/hcg/snapshot")
    assert response.status_code == 500

    spans = exporter.get_finished_spans()
    error_spans = [s for s in spans if s.name == "apollo.api.hcg.snapshot"]
    assert len(error_spans) >= 1

    error_span = error_spans[-1]
    assert error_span.status.status_code == StatusCode.ERROR

    exception_events = [e for e in error_span.events if e.name == "exception"]
    assert len(exception_events) >= 1
    assert "Neo4j connection lost" in str(
        exception_events[0].attributes.get("exception.message", "")
    )
