"""Configuration management for Apollo."""

import os
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field


def _get_client_host(env_var: str, default: str = "localhost") -> str:
    """Get a client-reachable host from environment variable.

    If the variable is set to 0.0.0.0 (bind all interfaces), return localhost
    instead so clients can connect.
    """
    host = os.getenv(env_var, default)
    return "localhost" if host == "0.0.0.0" else host


class SophiaConfig(BaseModel):
    """Configuration for Sophia cognitive core connection."""

    host: str = Field(
        default_factory=lambda: _get_client_host("SOPHIA_HOST", "localhost"),
        description="Sophia API host",
    )
    port: int = Field(
        default_factory=lambda: int(os.getenv("SOPHIA_PORT", "8080")),
        description="Sophia API port",
    )
    timeout: int = Field(default=30, description="Request timeout in seconds")
    api_key: Optional[str] = Field(
        default_factory=lambda: os.getenv("SOPHIA_API_KEY"),
        description="Bearer token for Sophia API access",
    )


class HermesConfig(BaseModel):
    """Configuration for Hermes language and embedding service."""

    host: str = Field(
        default_factory=lambda: _get_client_host("HERMES_HOST", "localhost"),
        description="Hermes API host",
    )
    port: int = Field(
        default_factory=lambda: int(os.getenv("HERMES_PORT", "8080")),
        description="Hermes API port",
    )
    timeout: int = Field(default=30, description="Request timeout in seconds")
    api_key: Optional[str] = Field(
        default_factory=lambda: os.getenv("HERMES_API_KEY"),
        description="Bearer token for Hermes API access",
    )
    provider: Optional[str] = Field(
        default=None, description="Preferred Hermes provider override"
    )
    model: Optional[str] = Field(
        default=None, description="Preferred provider-specific model identifier"
    )
    temperature: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=2.0,
        description="Default sampling temperature for Hermes LLM requests",
    )
    max_tokens: Optional[int] = Field(
        default=None,
        ge=1,
        description="Default maximum completion tokens for Hermes LLM requests",
    )
    system_prompt: Optional[str] = Field(
        default=None,
        description="Optional default system prompt prepended to Hermes conversations",
    )


class PersonaApiConfig(BaseModel):
    """Configuration for Sophia persona diary API."""

    host: str = Field(
        default_factory=lambda: _get_client_host("APOLLO_HOST", "localhost"),
        description="Persona API host (typically the Sophia service host)",
    )
    port: int = Field(
        default_factory=lambda: int(os.getenv("APOLLO_PORT", "8082")),
        description="Persona API port",
    )
    timeout: int = Field(default=15, description="Request timeout in seconds")
    api_key: Optional[str] = Field(
        default_factory=lambda: os.getenv("APOLLO_API_KEY"),
        description="Optional bearer token for persona API access",
    )


class Neo4jConfig(BaseModel):
    """Configuration for Neo4j HCG connection."""

    uri: str = Field(
        default_factory=lambda: os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        description="Neo4j Bolt URI",
    )
    user: str = Field(
        default_factory=lambda: os.getenv("NEO4J_USER", "neo4j"),
        description="Neo4j username",
    )
    password: str = Field(
        default_factory=lambda: os.getenv("NEO4J_PASSWORD", "neo4jtest"),
        description="Neo4j password",
    )


class MilvusConfig(BaseModel):
    """Configuration for Milvus vector store connection."""

    host: str = Field(
        default_factory=lambda: os.getenv("MILVUS_HOST", "localhost"),
        description="Milvus host",
    )
    port: int = Field(
        default_factory=lambda: int(os.getenv("MILVUS_PORT", "19530")),
        description="Milvus gRPC port",
    )


class HCGConfig(BaseModel):
    """Configuration for HCG infrastructure."""

    neo4j: Neo4jConfig = Field(default_factory=Neo4jConfig)
    milvus: MilvusConfig = Field(default_factory=MilvusConfig)


class ApolloConfig(BaseModel):
    """Main Apollo configuration."""

    sophia: SophiaConfig = Field(default_factory=SophiaConfig)
    hermes: HermesConfig = Field(default_factory=HermesConfig)
    hcg: HCGConfig = Field(default_factory=HCGConfig)
    persona_api: PersonaApiConfig = Field(default_factory=PersonaApiConfig)

    def apply_env_overrides(self) -> None:
        """Let environment variables override config-file values."""
        if self.hcg and self.hcg.neo4j:
            if env_uri := os.getenv("NEO4J_URI"):
                self.hcg.neo4j.uri = env_uri
            if env_user := os.getenv("NEO4J_USER"):
                self.hcg.neo4j.user = env_user
            if env_password := os.getenv("NEO4J_PASSWORD"):
                self.hcg.neo4j.password = env_password

    @classmethod
    def from_yaml(cls, path: Path) -> "ApolloConfig":
        """Load configuration from YAML file.

        Args:
            path: Path to YAML configuration file

        Returns:
            ApolloConfig instance
        """
        with open(path, "r") as f:
            data = yaml.safe_load(f)
        return cls(**data)

    def to_yaml(self, path: Path) -> None:
        """Save configuration to YAML file.

        Args:
            path: Path to save YAML configuration
        """
        with open(path, "w") as f:
            yaml.dump(self.model_dump(), f, default_flow_style=False)

    @classmethod
    def load(cls, config_path: Optional[Path] = None) -> "ApolloConfig":
        """Load configuration from default or specified path.

        Args:
            config_path: Optional path to configuration file

        Returns:
            ApolloConfig instance
        """
        config: ApolloConfig

        if config_path and config_path.exists():
            config = cls.from_yaml(config_path)
            config.apply_env_overrides()
            return config

        # Try default locations
        default_paths = [
            Path("config.yaml"),
            Path("config.yml"),
            Path.home() / ".apollo" / "config.yaml",
        ]

        for path in default_paths:
            if path.exists():
                config = cls.from_yaml(path)
                config.apply_env_overrides()
                return config

        # Return default config if no file found
        config = cls()
        config.apply_env_overrides()
        return config
