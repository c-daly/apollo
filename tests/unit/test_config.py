"""Tests for configuration management."""

import os
from unittest.mock import patch

from apollo.config.settings import (
    ApolloConfig,
    HCGConfig,
    HermesConfig,
    MilvusConfig,
    Neo4jConfig,
    PersonaApiConfig,
    SophiaConfig,
)


def test_sophia_config_loads() -> None:
    """Test SophiaConfig loads and has expected fields."""
    config = SophiaConfig()
    assert isinstance(config.host, str)
    assert isinstance(config.port, int)
    assert isinstance(config.timeout, int)


def test_sophia_config_reads_env() -> None:
    """Test SophiaConfig reads from environment."""
    with patch.dict(os.environ, {"SOPHIA_HOST": "custom-host", "SOPHIA_PORT": "9999"}):
        config = SophiaConfig()
        assert config.host == "custom-host"
        assert config.port == 9999


def test_neo4j_config_loads() -> None:
    """Test Neo4jConfig loads and has expected fields."""
    config = Neo4jConfig()
    assert isinstance(config.uri, str)
    assert "bolt://" in config.uri
    assert isinstance(config.user, str)
    assert isinstance(config.password, str)


def test_neo4j_config_reads_env() -> None:
    """Test Neo4jConfig reads from environment."""
    with patch.dict(os.environ, {"NEO4J_URI": "bolt://custom:7777"}):
        config = Neo4jConfig()
        assert config.uri == "bolt://custom:7777"


def test_milvus_config_loads() -> None:
    """Test MilvusConfig loads and has expected fields."""
    config = MilvusConfig()
    assert isinstance(config.host, str)
    assert isinstance(config.port, int)


def test_milvus_config_reads_env() -> None:
    """Test MilvusConfig reads from environment."""
    with patch.dict(os.environ, {"MILVUS_HOST": "milvus-host", "MILVUS_PORT": "29999"}):
        config = MilvusConfig()
        assert config.host == "milvus-host"
        assert config.port == 29999


def test_hermes_config_loads() -> None:
    """Test HermesConfig loads and has expected fields."""
    config = HermesConfig()
    assert isinstance(config.host, str)
    assert isinstance(config.port, int)
    assert isinstance(config.timeout, int)
    # Optional fields can be None
    assert config.provider is None or isinstance(config.provider, str)
    assert config.model is None or isinstance(config.model, str)


def test_hcg_config_loads() -> None:
    """Test HCGConfig loads nested configs."""
    config = HCGConfig()
    assert isinstance(config.neo4j, Neo4jConfig)
    assert isinstance(config.milvus, MilvusConfig)


def test_persona_api_config_loads() -> None:
    """Test PersonaApiConfig loads and has expected fields."""
    config = PersonaApiConfig()
    assert isinstance(config.host, str)
    assert isinstance(config.port, int)
    assert isinstance(config.timeout, int)


def test_apollo_config_loads() -> None:
    """Test ApolloConfig loads all nested configs."""
    config = ApolloConfig()
    assert isinstance(config.sophia, SophiaConfig)
    assert isinstance(config.persona_api, PersonaApiConfig)
    assert isinstance(config.hcg, HCGConfig)


def test_apollo_config_load() -> None:
    """Test ApolloConfig.load() returns valid config from env and logos_config."""
    config = ApolloConfig.load()
    assert isinstance(config, ApolloConfig)
    assert isinstance(config.sophia, SophiaConfig)
