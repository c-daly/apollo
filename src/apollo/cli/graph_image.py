"""Optional inline graph-image rendering for the ``graph neighbors`` command.

All heavy/optional dependencies (``matplotlib``, ``networkx``, ``term-image``,
``PIL``) are imported lazily inside functions so the base install never breaks.
Install the optional stack with ``poetry install -E graph-image``.

Every public function is defensive: it returns ``False`` (never raises) when a
dependency is missing or a step fails, so the CLI can always fall back to the
text tree.
"""

from __future__ import annotations

import os
import tempfile
from typing import Any, Dict, List, Optional


def graphics_supported() -> bool:
    """Best-effort check for a terminal that can display inline images.

    Honest and conservative: returns ``True`` only for terminals known to
    support the kitty/iTerm2 graphics protocols or sixel.
    """
    if os.environ.get("KITTY_WINDOW_ID"):
        return True
    if os.environ.get("TERM_PROGRAM") == "iTerm.app":
        return True
    term = os.environ.get("TERM", "").lower()
    if "sixel" in term or "kitty" in term:
        return True
    if os.environ.get("WEZTERM_PANE"):
        return True
    return False


def render_neighborhood_png(
    root_uuid: str,
    root_name: str,
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    out_path: str,
) -> bool:
    """Render the de-reified neighborhood to a PNG node-link diagram.

    Uses the headless Agg backend so it works without a display. Returns
    ``True`` on success, ``False`` (swallowing the error) if optional libs
    are missing or rendering fails.
    """
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import networkx as nx
    except ImportError:
        return False

    try:
        graph = nx.DiGraph()
        graph.add_node(root_uuid, label=root_name or root_uuid[:8])

        name_by_uuid: Dict[str, str] = {root_uuid: root_name or root_uuid[:8]}
        for node in nodes:
            uuid = node.get("uuid")
            if not uuid:
                continue
            name = node.get("name") or uuid[:8]
            name_by_uuid[uuid] = name
            graph.add_node(uuid, label=name)

        edge_labels: Dict[Any, str] = {}
        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            relation = edge.get("relation", "")
            if not source or not target:
                continue
            if source not in name_by_uuid:
                graph.add_node(source, label=source[:8])
                name_by_uuid[source] = source[:8]
            if target not in name_by_uuid:
                graph.add_node(target, label=target[:8])
                name_by_uuid[target] = target[:8]
            graph.add_edge(source, target, relation=relation)
            edge_labels[(source, target)] = relation

        pos = nx.spring_layout(graph, seed=42, k=0.9)
        labels = {n: graph.nodes[n].get("label", n) for n in graph.nodes}
        node_colors = ["#e06c75" if n == root_uuid else "#61afef" for n in graph.nodes]

        # Wrap draw+save in try/finally so the figure is always closed even if
        # layout/drawing/saving raises (matplotlib keeps a global ref to every
        # open figure, so a leaked fig is a memory leak).
        fig = None
        try:
            fig, ax = plt.subplots(figsize=(9, 7))
            nx.draw_networkx_nodes(
                graph, pos, node_color=node_colors, node_size=1600, ax=ax
            )
            nx.draw_networkx_edges(
                graph,
                pos,
                ax=ax,
                arrows=True,
                arrowstyle="-|>",
                arrowsize=18,
                edge_color="#888888",
                node_size=1600,
            )
            nx.draw_networkx_labels(graph, pos, labels=labels, font_size=8, ax=ax)
            nx.draw_networkx_edge_labels(
                graph, pos, edge_labels=edge_labels, font_size=7, ax=ax
            )
            ax.set_title(f"Neighborhood: {root_name or root_uuid}")
            ax.axis("off")
            fig.tight_layout()
            fig.savefig(out_path, dpi=120, bbox_inches="tight")
            return True
        finally:
            if fig is not None:
                plt.close(fig)
    except Exception:
        return False


def display_png_inline(path: str) -> bool:
    """Display a PNG inline via ``term-image``. Returns ``False`` on failure."""
    try:
        from term_image.image import from_file
    except ImportError:
        return False

    try:
        image = from_file(path)
        print(image)
        return True
    except Exception:
        return False


def try_inline_neighborhood(
    root_uuid: str,
    root_name: str,
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
) -> bool:
    """Render and display the neighborhood inline if everything is available.

    Returns ``True`` only when the terminal is supported, the PNG renders, and
    the inline display succeeds. Returns ``False`` otherwise (never raises) so
    the CLI can fall back to the text tree.
    """
    if not graphics_supported():
        return False

    tmp_path: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
            tmp_path = handle.name
        if not render_neighborhood_png(root_uuid, root_name, nodes, edges, tmp_path):
            return False
        return display_png_inline(tmp_path)
    except Exception:
        return False
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
