"""Environment helpers for Apollo configuration and testing.

This module provides utilities for resolving paths and loading environment
configuration, following the pattern established in logos_test_utils.

Repository Root Resolution
--------------------------
The ``get_repo_root()`` function resolves the Apollo repository root using:

1. ``APOLLO_REPO_ROOT`` environment variable (if set and path exists)
2. ``GITHUB_WORKSPACE`` environment variable (set by GitHub Actions in CI)
3. Fallback to parent of this package (works when running from source)

This allows tests and scripts to work correctly when the repository is relocated
or mounted at a non-standard path (e.g., CI containers, symlinked workspaces).

Usage::

    from apollo.env import get_repo_root, load_stack_env, get_neo4j_config

    # Get repo root (honors APOLLO_REPO_ROOT if set)
    root = get_repo_root()

    # Load stack environment from .env.test
    env = load_stack_env()

    # Get service configs with sensible defaults
    neo4j = get_neo4j_config()
    milvus = get_milvus_config()
    sophia = get_sophia_config()
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from functools import cache
from pathlib import Path


def get_env_value(
    key: str,
    env: Mapping[str, str] | None = None,
    default: str | None = None,
) -> str | None:
    """Resolve an env var by checking OS env, provided mapping, then default.

    Args:
        key: Environment variable name
        env: Optional mapping to check (e.g., loaded from .env file)
        default: Default value if not found

    Returns:
        The resolved value or default
    """
    if key in os.environ:
        return os.environ[key]
    if env and key in env:
        return env[key]
    return default


def get_repo_root(env: Mapping[str, str] | None = None) -> Path:
    """Resolve the Apollo repo root, honoring APOLLO_REPO_ROOT if set.

    Priority:
    1. APOLLO_REPO_ROOT from OS env or provided mapping (if path exists).
    2. GITHUB_WORKSPACE (set by GitHub Actions in CI).
    3. Fallback to parent of this package (works when running from source).

    Args:
        env: Optional mapping to check for APOLLO_REPO_ROOT

    Returns:
        Path to the repository root
    """
    env_value = get_env_value("APOLLO_REPO_ROOT", env)
    if env_value:
        candidate = Path(env_value).expanduser().resolve()
        if candidate.exists():
            return candidate

    # GitHub Actions sets GITHUB_WORKSPACE to the repo checkout
    github_workspace = os.getenv("GITHUB_WORKSPACE")
    if github_workspace:
        candidate = Path(github_workspace).resolve()
        if candidate.exists():
            return candidate

    # Fallback: this file is at src/apollo/env.py, so parents[2] is repo root
    return Path(__file__).resolve().parents[2]


def _default_env_path() -> Path:
    """Get the default path to the stack .env.test file."""
    override = os.getenv("APOLLO_STACK_ENV")
    if override:
        return Path(override)
    repo_root = get_repo_root()
    return repo_root / "tests" / "e2e" / "stack" / "apollo" / ".env.test"


@cache
def load_stack_env(env_path: str | Path | None = None) -> dict[str, str]:
    """Load the canonical stack environment (key/value pairs).

    Values are parsed from the generated ``.env.test`` file. Callers can
    override the location via ``env_path`` or the ``APOLLO_STACK_ENV``
    environment variable. Missing files simply yield an empty mapping so
    tests can still fall back to hard-coded defaults.

    Args:
        env_path: Path to .env file. If None, uses default stack location.

    Returns:
        Dictionary of environment variables
    """
    path = Path(env_path) if env_path else _default_env_path()
    env: dict[str, str] = {}

    if not path.exists():
        return env

    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        # Strip quotes from values
        value = value.strip()
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1]
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1]
        env[key.strip()] = value

    return env


# Service connection configuration helpers


def get_neo4j_config(env: Mapping[str, str] | None = None) -> dict[str, str]:
    """Get Neo4j connection configuration from environment.

    Args:
        env: Optional mapping to check for values

    Returns:
        Dictionary with uri, user, and password
    """
    # These all have defaults so they won't be None
    uri = get_env_value("NEO4J_URI", env, "bolt://localhost:27687")
    user = get_env_value("NEO4J_USER", env, "neo4j")
    password = get_env_value("NEO4J_PASSWORD", env, "neo4jtest")
    assert uri is not None
    assert user is not None
    assert password is not None
    return {
        "uri": uri,
        "user": user,
        "password": password,
    }


def get_milvus_config(env: Mapping[str, str] | None = None) -> dict[str, str]:
    """Get Milvus connection configuration from environment.

    Args:
        env: Optional mapping to check for values

    Returns:
        Dictionary with host, port, and healthcheck url
    """
    # These all have defaults so they won't be None
    host = get_env_value("MILVUS_HOST", env, "localhost")
    port = get_env_value("MILVUS_PORT", env, "29530")
    healthcheck = get_env_value(
        "MILVUS_HEALTHCHECK", env, "http://localhost:29091/healthz"
    )
    assert host is not None
    assert port is not None
    assert healthcheck is not None
    return {
        "host": host,
        "port": port,
        "healthcheck": healthcheck,
    }


def get_sophia_config(env: Mapping[str, str] | None = None) -> dict[str, str]:
    """Get Sophia mock service configuration from environment.

    Args:
        env: Optional mapping to check for values

    Returns:
        Dictionary with host, port, and base_url
    """
    host = get_env_value("SOPHIA_HOST", env, "localhost")
    port = get_env_value("SOPHIA_PORT", env, "28080")
    assert host is not None
    assert port is not None
    return {
        "host": host,
        "port": port,
        "base_url": f"http://{host}:{port}",
    }
