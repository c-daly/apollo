"""Configuration management for Apollo.

Configuration is resolved from:
1. Environment variables (highest priority)
2. logos_config defaults (port allocation, etc.)

This follows the same pattern as other LOGOS repos - no config files needed.
"""

import os
from typing import Optional

from pydantic import BaseModel, Field

from apollo.env import get_env_value as resolve_env_value, APOLLO_PORTS, get_repo_ports

SOPHIA_PORTS = get_repo_ports("sophia")
HERMES_PORTS = get_repo_ports("hermes")


def _get_client_host(env_var: str, default: str = "localhost") -> str:
    """Get a client-reachable host from environment variable.

    If the variable is set to 0.0.0.0 (bind all interfaces), return localhost
    instead so clients can connect.
    """
    host = resolve_env_value(env_var, default=default)
    if host is None:
        host = default
    return "localhost" if host == "0.0.0.0" else host


class SophiaConfig(BaseModel):
    """Configuration for Sophia cognitive core connection."""

    host: str = Field(
        default_factory=lambda: _get_client_host("SOPHIA_HOST", "localhost"),
        description="Sophia API host",
    )
    port: int = Field(
        default_factory=lambda: int(
            resolve_env_value("SOPHIA_PORT", default=str(SOPHIA_PORTS.api))
            or SOPHIA_PORTS.api
        ),
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
        default_factory=lambda: int(
            resolve_env_value("HERMES_PORT", default=str(HERMES_PORTS.api))
            or HERMES_PORTS.api
        ),
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
        default_factory=lambda: int(
            resolve_env_value("APOLLO_PORT", default=str(APOLLO_PORTS.api))
            or APOLLO_PORTS.api
        ),
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
        default_factory=lambda: resolve_env_value(
            "NEO4J_URI",
            default=f"bolt://localhost:{APOLLO_PORTS.neo4j_bolt}",
        )
        or f"bolt://localhost:{APOLLO_PORTS.neo4j_bolt}",
        description="Neo4j Bolt URI",
    )
    user: str = Field(
        default_factory=lambda: os.getenv("NEO4J_USER", "neo4j"),
        description="Neo4j username",
    )
    password: str = Field(
        default_factory=lambda: os.getenv("NEO4J_PASSWORD", "logosdev"),
        description="Neo4j password",
    )


class MilvusConfig(BaseModel):
    """Configuration for Milvus vector store connection."""

    host: str = Field(
        default_factory=lambda: resolve_env_value("MILVUS_HOST", default="localhost")
        or "localhost",
        description="Milvus host",
    )
    port: int = Field(
        default_factory=lambda: int(
            resolve_env_value("MILVUS_PORT", default=str(APOLLO_PORTS.milvus_grpc))
            or APOLLO_PORTS.milvus_grpc
        ),
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
    def load(cls) -> "ApolloConfig":
        """Load configuration from environment and logos_config defaults.

        Returns:
            ApolloConfig instance with env overrides applied
        """
        config = cls()
        config.apply_env_overrides()
        return config
