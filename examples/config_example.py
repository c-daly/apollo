"""Example: Basic usage of Apollo configuration."""

from pathlib import Path

from apollo.config.settings import ApolloConfig

# Load configuration from file
config = ApolloConfig.load()

# Or create configuration programmatically
config = ApolloConfig()
config.sophia.host = "localhost"
config.sophia.port = 8080

# Save configuration to file
config.to_yaml(Path("my_config.yaml"))

print(f"Sophia URL: http://{config.sophia.host}:{config.sophia.port}")
print(f"Neo4j URI: {config.hcg.neo4j.uri}")
print(f"Milvus: {config.hcg.milvus.host}:{config.hcg.milvus.port}")
