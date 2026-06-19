"""Unit tests for :mod:`apollo.cli.graph_image`.

The module is intentionally defensive: every public function returns ``False``
(never raises) when an optional dependency or the terminal is missing, so the
CLI can always fall back to the text tree. These tests pin that contract,
focusing on the fallback paths that run in CI (no graphics terminal, optional
libs absent).
"""

from __future__ import annotations

import builtins
from typing import Any, List
from unittest.mock import patch

from apollo.cli import graph_image


# --- graphics_supported --------------------------------------------------


def test_graphics_supported_false_for_plain_terminal(monkeypatch) -> None:
    for var in ("KITTY_WINDOW_ID", "TERM_PROGRAM", "WEZTERM_PANE"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("TERM", "xterm-256color")
    assert graph_image.graphics_supported() is False


def test_graphics_supported_kitty_window(monkeypatch) -> None:
    monkeypatch.setenv("KITTY_WINDOW_ID", "1")
    assert graph_image.graphics_supported() is True


def test_graphics_supported_iterm(monkeypatch) -> None:
    monkeypatch.delenv("KITTY_WINDOW_ID", raising=False)
    monkeypatch.setenv("TERM_PROGRAM", "iTerm.app")
    assert graph_image.graphics_supported() is True


def test_graphics_supported_sixel_term(monkeypatch) -> None:
    for var in ("KITTY_WINDOW_ID", "TERM_PROGRAM", "WEZTERM_PANE"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("TERM", "xterm-sixel")
    assert graph_image.graphics_supported() is True


def test_graphics_supported_wezterm(monkeypatch) -> None:
    for var in ("KITTY_WINDOW_ID", "TERM_PROGRAM"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("TERM", "xterm")
    monkeypatch.setenv("WEZTERM_PANE", "0")
    assert graph_image.graphics_supported() is True


# --- render_neighborhood_png (lib-missing fallback) ----------------------


def _force_missing(*names: str):
    """Patch __import__ so the named modules raise ImportError."""
    real_import = builtins.__import__

    def fake_import(name: str, *args: Any, **kwargs: Any):
        if name in names or name.split(".")[0] in names:
            raise ImportError(name)
        return real_import(name, *args, **kwargs)

    return patch.object(builtins, "__import__", side_effect=fake_import)


def test_render_returns_false_when_matplotlib_missing(tmp_path) -> None:
    out = str(tmp_path / "n.png")
    with _force_missing("matplotlib", "networkx"):
        assert graph_image.render_neighborhood_png("u", "Root", [], [], out) is False


def test_display_png_inline_false_when_term_image_missing(tmp_path) -> None:
    png = tmp_path / "x.png"
    png.write_bytes(b"not-really-a-png")
    with _force_missing("term_image"):
        assert graph_image.display_png_inline(str(png)) is False


# --- try_inline_neighborhood (top-level fallback) ------------------------


def test_try_inline_returns_false_when_terminal_unsupported() -> None:
    nodes: List[dict] = [{"uuid": "a", "name": "A"}]
    edges: List[dict] = [{"source": "u", "target": "a", "relation": "rel"}]
    with patch.object(graph_image, "graphics_supported", return_value=False):
        assert graph_image.try_inline_neighborhood("u", "Root", nodes, edges) is False


def test_try_inline_returns_false_when_render_fails(tmp_path) -> None:
    with patch.object(graph_image, "graphics_supported", return_value=True):
        with patch.object(graph_image, "render_neighborhood_png", return_value=False):
            assert graph_image.try_inline_neighborhood("u", "R", [], []) is False


def test_try_inline_signals_displayed_when_everything_works() -> None:
    with patch.object(graph_image, "graphics_supported", return_value=True):
        with patch.object(graph_image, "render_neighborhood_png", return_value=True):
            with patch.object(graph_image, "display_png_inline", return_value=True):
                result = graph_image.try_inline_neighborhood("u", "R", [], [])
    assert result is True
