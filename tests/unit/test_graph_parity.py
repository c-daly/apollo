"""Parity test: every graph capability has both a client method and a CLI command.

Pure introspection -- no network access. Guards against the client and the CLI
drifting apart (a capability added to one but not the other).
"""

from apollo.cli.main import graph
from apollo.client.hcg_query_client import HCGQueryClient

# capability -> (client method name, CLI command name)
_CAPABILITIES = {
    "stats": ("stats", "stats"),
    "types": ("types", "types"),
    "neighborhood": ("neighborhood", "neighbors"),
    "search": ("search", "search"),
}


def test_client_has_all_capability_methods() -> None:
    """HCGQueryClient exposes a method for every graph capability."""
    for capability, (method_name, _command) in _CAPABILITIES.items():
        assert hasattr(
            HCGQueryClient, method_name
        ), f"HCGQueryClient missing method '{method_name}' for '{capability}'"
        assert callable(getattr(HCGQueryClient, method_name))


def test_graph_group_has_all_capability_commands() -> None:
    """The graph CLI group exposes a command for every graph capability."""
    command_names = set(graph.commands.keys())
    for capability, (_method, command_name) in _CAPABILITIES.items():
        assert (
            command_name in command_names
        ), f"graph group missing command '{command_name}' for '{capability}'"


def test_graph_group_has_node_command() -> None:
    """The entity lookup is exposed as the 'node' command."""
    assert "node" in graph.commands


def test_client_has_entity_method() -> None:
    """The entity lookup capability exists on the client."""
    assert hasattr(HCGQueryClient, "entity")
    assert callable(HCGQueryClient.entity)
