"""Smoke tests for OpenTelemetry instrumentation in Apollo."""

import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from logos_observability import setup_telemetry, get_tracer


@pytest.fixture(autouse=True)
def reset_tracer_provider():
    """Reset the global tracer provider between tests."""
    yield
    trace.set_tracer_provider(TracerProvider())


def test_apollo_telemetry_setup():
    """Verify setup_telemetry configures a working TracerProvider."""
    provider = setup_telemetry(service_name="apollo", export_to_console=False)
    assert provider is not None

    tracer = get_tracer("apollo.test")
    with tracer.start_as_current_span("apollo.test_span") as span:
        span.set_attribute("test.key", "test_value")


def test_apollo_spans_have_correct_service_name():
    """Verify spans carry the correct service.name resource attribute."""
    setup_telemetry(service_name="apollo", export_to_console=False)
    exporter = InMemorySpanExporter()
    provider = trace.get_tracer_provider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))

    tracer = get_tracer("apollo.api")
    with tracer.start_as_current_span("apollo.command") as span:
        span.set_attribute("command.type", "plan")

    provider.force_flush()

    spans = exporter.get_finished_spans()
    assert len(spans) > 0
    assert spans[0].name == "apollo.command"
    assert spans[0].resource.attributes["service.name"] == "apollo"


def test_apollo_nested_spans():
    """Verify nested spans maintain parent-child relationships."""
    setup_telemetry(service_name="apollo", export_to_console=False)
    exporter = InMemorySpanExporter()
    provider = trace.get_tracer_provider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))

    tracer = get_tracer("apollo.api")
    with tracer.start_as_current_span("apollo.command") as _parent:
        with tracer.start_as_current_span("apollo.api.sophia") as child:
            child.set_attribute("target.service", "sophia")

    provider.force_flush()

    spans = exporter.get_finished_spans()
    assert len(spans) == 2
    child_span = next(s for s in spans if s.name == "apollo.api.sophia")
    parent_span = next(s for s in spans if s.name == "apollo.command")
    assert child_span.parent.span_id == parent_span.context.span_id
