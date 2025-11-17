"""Example: Basic usage of Sophia client."""

from apollo.client.sophia_client import SophiaClient
from apollo.config.settings import SophiaConfig

# Create client configuration
config = SophiaConfig(host="localhost", port=8080)

# Initialize client
client = SophiaClient(config)

# Send a command (placeholder for Epoch 3)
response = client.send_command("pick up the red block")
print(f"Command response: {response}")

# Get current state (placeholder for Epoch 3)
state = client.get_state()
print(f"State: {state}")

# Get recent plans (placeholder for Epoch 3)
plans = client.get_plans(limit=5)
print(f"Plans: {plans}")

# Check health
is_healthy = client.health_check()
print(f"Sophia healthy: {is_healthy}")
