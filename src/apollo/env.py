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

from logos_config.env import (
    get_env_value as resolve_env_value,
    get_repo_root as resolve_repo_root,
    load_env_file as resolve_env_file,
)
from logos_config.ports import APOLLO_PORTS, get_repo_ports


def get_env_value(
    key: str,
    env: Mapping[str, str] | None = None,
    default: str | None = None,
) -> str | None:
    """Resolve an env var by checking OS env, provided mapping, then default."""
    return resolve_env_value(key, env, default)


def get_repo_root(env: Mapping[str, str] | None = None) -> Path:
    """Resolve the Apollo repo root, honoring APOLLO_REPO_ROOT if set."""
    return resolve_repo_root("apollo", env)


def _default_env_path() -> Path:
    """Get the default path to the stack .env.test file."""
    override = os.getenv("APOLLO_STACK_ENV")
    if override:
        return Path(override)
    repo_root = get_repo_root()
    return repo_root / "containers" / ".env.test"


@cache
def load_stack_env(env_path: str | Path | None = None) -> dict[str, str]:
    """Load the canonical stack environment (key/value pairs)."""
    path = Path(env_path) if env_path else _default_env_path()
    return resolve_env_file(path)


# Service connection configuration helpers


def get_neo4j_config(env: Mapping[str, str] | None = None) -> dict[str, str]:
    """Get Neo4j connection configuration from environment.

    Args:
        env: Optional mapping to check for values

    Returns:
        Dictionary with uri, user, and password
    """
    # These all have defaults so they won't be None
    uri = get_env_value(
        "NEO4J_URI",
        env,
        f"bolt://localhost:{APOLLO_PORTS.neo4j_bolt}",
    )
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
    port = get_env_value("MILVUS_PORT", env, str(APOLLO_PORTS.milvus_grpc))
    healthcheck = get_env_value(
        "MILVUS_HEALTHCHECK",
        env,
        f"http://localhost:{APOLLO_PORTS.milvus_metrics}/healthz",
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
    sophia_ports = get_repo_ports("sophia")
    host = get_env_value("SOPHIA_HOST", env, "localhost")
    port = get_env_value("SOPHIA_PORT", env, str(sophia_ports.api))
    assert host is not None
    assert port is not None
    return {
        "host": host,
        "port": port,
        "base_url": f"http://{host}:{port}",
    }
