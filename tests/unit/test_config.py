"""Tests for configuration management."""

from pathlib import Path

from apollo.config.settings import (
    ApolloConfig,
    HCGConfig,
    HermesConfig,
    MilvusConfig,
    Neo4jConfig,
    PersonaApiConfig,
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
    assert config.password == "neo4jtest"


def test_milvus_config_defaults() -> None:
    """Test MilvusConfig default values."""
    config = MilvusConfig()
    assert config.host == "localhost"
    assert config.port == 19530


def test_hermes_config_defaults() -> None:
    """Test HermesConfig default values."""
    config = HermesConfig()
    assert config.host == "localhost"
    assert config.port == 8080
    assert config.timeout == 30
    assert config.provider is None
    assert config.model is None
    assert config.temperature is None
    assert config.max_tokens is None
    assert config.system_prompt is None


def test_hcg_config_defaults() -> None:
    """Test HCGConfig default values."""
    config = HCGConfig()
    assert isinstance(config.neo4j, Neo4jConfig)
    assert isinstance(config.milvus, MilvusConfig)


def test_persona_api_config_defaults() -> None:
    """Test PersonaApiConfig default values."""
    config = PersonaApiConfig()
    assert config.host == "localhost"
    assert config.port == 8082
    assert config.timeout == 15


def test_apollo_config_defaults() -> None:
    """Test ApolloConfig default values."""
    config = ApolloConfig()
    assert isinstance(config.sophia, SophiaConfig)
    assert isinstance(config.persona_api, PersonaApiConfig)
    assert isinstance(config.hcg, HCGConfig)


def test_apollo_config_load_missing_file() -> None:
    """Test loading config when no file exists."""
    config = ApolloConfig.load(Path("/nonexistent/config.yaml"))
    # Should return default config
    assert isinstance(config, ApolloConfig)
    assert config.sophia.host == "localhost"
