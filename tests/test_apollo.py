"""Tests for Apollo package initialization."""

import apollo


def test_version() -> None:
    """Test that version is defined."""
    assert hasattr(apollo, "__version__")
    assert apollo.__version__ == "0.1.0"
