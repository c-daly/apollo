"""Configuration management for Apollo."""

from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field


class SophiaConfig(BaseModel):
    """Configuration for Sophia cognitive core connection."""

    host: str = Field(default="localhost", description="Sophia API host")
    port: int = Field(default=8080, description="Sophia API port")
    timeout: int = Field(default=30, description="Request timeout in seconds")
    api_key: Optional[str] = Field(
        default=None, description="Bearer token for Sophia API access"
    )


class HermesConfig(BaseModel):
    """Configuration for Hermes language and embedding service."""

    host: str = Field(default="localhost", description="Hermes API host")
    port: int = Field(default=8081, description="Hermes API port")
    timeout: int = Field(default=30, description="Request timeout in seconds")
    api_key: Optional[str] = Field(
        default=None, description="Bearer token for Hermes API access"
    )


class PersonaApiConfig(BaseModel):
    """Configuration for Sophia persona diary API."""

    host: str = Field(
        default="localhost",
        description="Persona API host (typically the Sophia service host)",
    )
    port: int = Field(default=8082, description="Persona API port")
    timeout: int = Field(default=15, description="Request timeout in seconds")
    api_key: Optional[str] = Field(
        default=None, description="Optional bearer token for persona API access"
    )


class Neo4jConfig(BaseModel):
    """Configuration for Neo4j HCG connection."""

    uri: str = Field(default="bolt://localhost:7687", description="Neo4j Bolt URI")
    user: str = Field(default="neo4j", description="Neo4j username")
    password: str = Field(default="password", description="Neo4j password")


class MilvusConfig(BaseModel):
    """Configuration for Milvus vector store connection."""

    host: str = Field(default="localhost", description="Milvus host")
    port: int = Field(default=19530, description="Milvus gRPC port")


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
        if config_path and config_path.exists():
            return cls.from_yaml(config_path)

        # Try default locations
        default_paths = [
            Path("config.yaml"),
            Path("config.yml"),
            Path.home() / ".apollo" / "config.yaml",
        ]

        for path in default_paths:
            if path.exists():
                return cls.from_yaml(path)

        # Return default config if no file found
        return cls()
