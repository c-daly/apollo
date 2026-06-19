"""Unit tests for the ``apollo-cli graph`` command group.

These drive the Click commands via :class:`click.testing.CliRunner` with a
mocked :class:`HCGQueryClient`, so they cover the rendering / null-coercion /
fallback logic without a live Sophia. The ``graph`` group callback is a no-op,
so invoking it with ``obj={"config": ...}`` bypasses the root ``cli`` callback
(which would otherwise construct real network clients).
"""

from __future__ import annotations

from typing import Any, Dict
from unittest.mock import Mock, patch

from click.testing import CliRunner

from apollo.cli.main import graph
from apollo.client.hcg_query_client import HCGQueryError


def _run(args, client: Mock):
    """Invoke a ``graph`` subcommand with ``_graph_client`` patched."""
    runner = CliRunner()
    with patch("apollo.cli.main._graph_client", return_value=client):
        return runner.invoke(graph, args, obj={"config": object()})


# --- graph stats ---------------------------------------------------------


def test_stats_renders_headline_and_tables() -> None:
    client = Mock()
    client.stats.return_value = {
        "total_nodes": 100,
        "content_nodes": 80,
        "edge_nodes": 20,
        "content_classified": 50,
        "content_parked": 10,
        "top_predicates": {"causes": 5, "partOf": 3},
    }
    client.types.return_value = [
        {"name": "cell", "member_count": 40},
        {"name": "entity", "member_count": 99},  # realm root -> dropped
    ]
    result = _run(["stats"], client)
    assert result.exit_code == 0, result.output
    assert "HCG Stats" in result.output
    assert "Total nodes" in result.output


def test_stats_survives_null_counts() -> None:
    """Sophia returning explicit nulls must not crash int() coercion."""
    client = Mock()
    client.stats.return_value = {
        "total_nodes": None,
        "content_nodes": None,
        "edge_nodes": None,
        "content_classified": None,
        "content_parked": None,
        "top_predicates": {"causes": None},
    }
    client.types.return_value = [{"name": "cell", "member_count": None}]
    result = _run(["stats"], client)
    assert result.exit_code == 0, result.output
    assert "HCG Stats" in result.output


def test_stats_handles_query_error() -> None:
    client = Mock()
    client.stats.side_effect = HCGQueryError("connection refused")
    result = _run(["stats"], client)
    assert result.exit_code == 0
    assert "Error" in result.output
    assert "connection refused" in result.output


# --- graph types ---------------------------------------------------------


def test_types_renders_tree() -> None:
    client = Mock()
    client.types.return_value = [
        {"name": "entity", "parent": None, "member_count": 10},
        {"name": "cell", "parent": "entity", "member_count": 5},
    ]
    result = _run(["types", "--limit", "10"], client)
    assert result.exit_code == 0, result.output
    assert "Type hierarchy" in result.output
    assert "cell" in result.output


def test_types_empty() -> None:
    client = Mock()
    client.types.return_value = []
    result = _run(["types"], client)
    assert result.exit_code == 0
    assert "No type definitions" in result.output


def test_types_handles_query_error() -> None:
    client = Mock()
    client.types.side_effect = HCGQueryError("boom")
    result = _run(["types"], client)
    assert result.exit_code == 0
    assert "Error" in result.output


# --- graph search --------------------------------------------------------


def test_search_renders_table() -> None:
    client = Mock()
    client.search.return_value = [
        {"uuid": "u1", "name": "Cell", "type": "cell"},
    ]
    result = _run(["search", "cell"], client)
    assert result.exit_code == 0, result.output
    assert "Cell" in result.output


def test_search_no_results() -> None:
    client = Mock()
    client.search.return_value = []
    result = _run(["search", "nope"], client)
    assert result.exit_code == 0
    assert "No results" in result.output


def test_search_handles_query_error() -> None:
    client = Mock()
    client.search.side_effect = HCGQueryError("boom")
    result = _run(["search", "x"], client)
    assert result.exit_code == 0
    assert "Error" in result.output


# --- graph node ----------------------------------------------------------


def test_node_renders_entity() -> None:
    client = Mock()
    client.base_url = "http://localhost:47000"
    client.entity.return_value = {
        "name": "Cell",
        "properties": {"kind": "biological"},
    }
    result = _run(["node", "u1"], client)
    assert result.exit_code == 0, result.output
    assert "Cell" in result.output


def test_node_null_name_falls_back_to_uuid() -> None:
    client = Mock()
    client.base_url = "http://localhost:47000"
    client.entity.return_value = {"name": None, "value": 1}
    result = _run(["node", "uuid-xyz"], client)
    assert result.exit_code == 0, result.output
    # Must not render the literal "None" as the panel title.
    assert "Entity None" not in result.output
    assert "uuid-xyz" in result.output


def test_node_not_found() -> None:
    client = Mock()
    client.base_url = "http://localhost:47000"
    client.entity.return_value = {}
    result = _run(["node", "missing"], client)
    assert result.exit_code == 0
    assert "No entity found" in result.output


def test_node_handles_query_error() -> None:
    client = Mock()
    client.entity.side_effect = HCGQueryError("bad uuid")
    result = _run(["node", "x"], client)
    assert result.exit_code == 0
    assert "Error" in result.output


# --- graph neighbors -----------------------------------------------------


def _neighborhood() -> Dict[str, Any]:
    return {
        "nodes": [{"uuid": "n1", "name": "Neighbor"}],
        "edges": [{"source": "root", "target": "n1", "relation": "causes"}],
        "metadata": {"root": "root"},
    }


def test_neighbors_renders_tree_by_default() -> None:
    client = Mock()
    client.neighborhood.return_value = _neighborhood()
    client.entity.return_value = {"name": "RootNode"}
    result = _run(["neighbors", "root"], client)
    assert result.exit_code == 0, result.output
    assert "RootNode" in result.output
    assert "causes" in result.output


def test_neighbors_null_neighbor_name_falls_back_to_uuid() -> None:
    client = Mock()
    data = _neighborhood()
    data["nodes"] = [{"uuid": "n1", "name": None}]
    client.neighborhood.return_value = data
    client.entity.return_value = {"name": "RootNode"}
    result = _run(["neighbors", "root"], client)
    assert result.exit_code == 0, result.output
    # The null neighbor name must not surface as the literal "None".
    assert "None" not in result.output


def test_neighbors_null_root_metadata_falls_back_to_uuid() -> None:
    """sophia returning {"root": null} must fall back to the requested uuid,
    not render the tree root as the literal "None"."""
    client = Mock()
    client.neighborhood.return_value = {
        "nodes": [{"uuid": "n1", "name": "Neighbor"}],
        "edges": [{"source": "abc-123", "target": "n1", "relation": "causes"}],
        "metadata": {"root": None},
    }
    client.entity.return_value = {}  # no name -> root label falls back to the uuid
    result = _run(["neighbors", "abc-123"], client)
    assert result.exit_code == 0, result.output
    assert "None" not in result.output
    assert "abc-123" in result.output
    assert "causes" in result.output


def test_neighbors_image_success_suppresses_tree() -> None:
    """--image rendering must show ONLY the image, not also the tree."""
    client = Mock()
    client.neighborhood.return_value = _neighborhood()
    client.entity.return_value = {"name": "RootNode"}
    runner = CliRunner()
    with patch("apollo.cli.main._graph_client", return_value=client):
        with patch("apollo.cli.graph_image.try_inline_neighborhood", return_value=True):
            result = runner.invoke(
                graph, ["neighbors", "root", "--image"], obj={"config": object()}
            )
    assert result.exit_code == 0, result.output
    # Tree was suppressed: the relation label only appears in the tree.
    assert "causes" not in result.output


def test_neighbors_image_failure_falls_back_to_tree() -> None:
    client = Mock()
    client.neighborhood.return_value = _neighborhood()
    client.entity.return_value = {"name": "RootNode"}
    runner = CliRunner()
    with patch("apollo.cli.main._graph_client", return_value=client):
        with patch(
            "apollo.cli.graph_image.try_inline_neighborhood", return_value=False
        ):
            result = runner.invoke(
                graph, ["neighbors", "root", "--image"], obj={"config": object()}
            )
    assert result.exit_code == 0, result.output
    assert "graph-image unavailable" in result.output
    assert "causes" in result.output  # tree fallback shown


def test_neighbors_handles_query_error() -> None:
    client = Mock()
    client.neighborhood.side_effect = HCGQueryError("bad uuid")
    result = _run(["neighbors", "x"], client)
    assert result.exit_code == 0
    assert "Error" in result.output


def test_neighbors_root_entity_error_is_tolerated() -> None:
    """A failure fetching the root entity name must not crash the command."""
    client = Mock()
    client.neighborhood.return_value = _neighborhood()
    client.entity.side_effect = HCGQueryError("root lookup failed")
    result = _run(["neighbors", "root"], client)
    assert result.exit_code == 0, result.output
    assert "causes" in result.output
