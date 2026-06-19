"""Parity: every scoped HCG graph capability is reachable from BOTH surfaces.

The CLI (`apollo-cli graph ...`) and the API (`/api/hcg/...`) are thin presenters
over the same ``HCGClient`` methods, so query *logic* can't drift. This guards the
remaining risk -- *surface* drift: adding a capability to one presenter but not the
other. Adding a scoped graph capability means adding a row to GRAPH_CAPABILITIES,
which then forces both a CLI command and an API route to exist (Task #12).
"""

from apollo.data.hcg_client import HCGClient

# scoped HCGClient method -> (CLI `graph` subcommand, API route prefix)
GRAPH_CAPABILITIES = {
    "get_graph_stats": ("stats", "/api/hcg/stats"),
    "get_type_summaries": ("types", "/api/hcg/types"),
    "get_neighborhood": ("neighbors", "/api/hcg/neighborhood"),
    "search_nodes": ("search", "/api/hcg/search"),
}


def test_capabilities_exist_on_client() -> None:
    """Each capability names a real HCGClient method (the shared source of truth)."""
    for method in GRAPH_CAPABILITIES:
        assert callable(getattr(HCGClient, method, None)), f"HCGClient.{method} missing"


def test_cli_exposes_every_capability() -> None:
    """Every capability has an `apollo-cli graph <cmd>` command."""
    from apollo.cli.main import graph

    commands = set(graph.commands)
    for method, (command, _route) in GRAPH_CAPABILITIES.items():
        assert command in commands, f"CLI 'graph {command}' missing for {method}"


def test_api_exposes_every_capability() -> None:
    """Every capability has a matching `/api/hcg/...` route."""
    from apollo.api.server import app

    paths = [getattr(route, "path", "") for route in app.routes]
    for method, (_command, route) in GRAPH_CAPABILITIES.items():
        assert any(
            path.startswith(route) for path in paths
        ), f"API route {route} missing for {method}"
