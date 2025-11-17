"""Tests for configuration management."""

from pathlib import Path


from apollo.config.settings import (
    ApolloConfig,
    HCGConfig,
    MilvusConfig,
    Neo4jConfig,
    SophiaConfig,
)


def test_sophia_config_defaults() -> None:
    """Test SophiaConfig default values."""
    config = SophiaConfig()
    assert config.host == "localhost"
    assert config.port == 8080
    assert config.timeout == 30


def test_neo4j_config_defaults() -> None:
    """Test Neo4jConfig default values."""
    config = Neo4jConfig()
    assert config.uri == "bolt://localhost:7687"
    assert config.user == "neo4j"
    assert config.password == "password"


def test_milvus_config_defaults() -> None:
    """Test MilvusConfig default values."""
    config = MilvusConfig()
    assert config.host == "localhost"
    assert config.port == 19530


def test_hcg_config_defaults() -> None:
    """Test HCGConfig default values."""
    config = HCGConfig()
    assert isinstance(config.neo4j, Neo4jConfig)
    assert isinstance(config.milvus, MilvusConfig)


def test_apollo_config_defaults() -> None:
    """Test ApolloConfig default values."""
    config = ApolloConfig()
    assert isinstance(config.sophia, SophiaConfig)
    assert isinstance(config.hcg, HCGConfig)


def test_apollo_config_load_missing_file() -> None:
    """Test loading config when no file exists."""
    config = ApolloConfig.load(Path("/nonexistent/config.yaml"))
    # Should return default config
    assert isinstance(config, ApolloConfig)
    assert config.sophia.host == "localhost"
