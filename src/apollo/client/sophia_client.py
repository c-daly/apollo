"""Client for interacting with Sophia cognitive core."""

from typing import Any, Dict, Optional

import requests
from pydantic import BaseModel

from apollo.config.settings import SophiaConfig


class SophiaResponse(BaseModel):
    """Response from Sophia API."""

    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class SophiaClient:
    """Client for Sophia cognitive core API.

    Prototype implementation for wiring Apollo CLI to Sophia services.
    """

    def __init__(self, config: SophiaConfig) -> None:
        """Initialize Sophia client.

        Args:
            config: Sophia configuration
        """
        self.config = config
        self.base_url = f"http://{config.host}:{config.port}"
        self.timeout = config.timeout

    def send_command(self, command: str) -> SophiaResponse:
        """Send a command to Sophia.

        Args:
            command: Natural language command

        Returns:
            Response from Sophia

        Raises:
            requests.RequestException: If request fails
        """
        try:
            response = requests.post(
                f"{self.base_url}/api/command",
                json={"command": command},
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()
            return SophiaResponse(success=True, data=data)
        except requests.exceptions.ConnectionError:
            return SophiaResponse(
                success=False,
                error=f"Cannot connect to Sophia at {self.base_url}",
            )
        except requests.exceptions.Timeout:
            return SophiaResponse(
                success=False,
                error=f"Request timed out after {self.timeout} seconds",
            )
        except requests.exceptions.RequestException as e:
            return SophiaResponse(success=False, error=f"Request failed: {str(e)}")
        except Exception as e:
            return SophiaResponse(success=False, error=f"Unexpected error: {str(e)}")

    def get_state(self) -> SophiaResponse:
        """Get current agent state from Sophia.

        Returns:
            Current state response

        Raises:
            requests.RequestException: If request fails
        """
        try:
            response = requests.get(
                f"{self.base_url}/api/state",
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()
            return SophiaResponse(success=True, data=data)
        except requests.exceptions.ConnectionError:
            return SophiaResponse(
                success=False,
                error=f"Cannot connect to Sophia at {self.base_url}",
            )
        except requests.exceptions.Timeout:
            return SophiaResponse(
                success=False,
                error=f"Request timed out after {self.timeout} seconds",
            )
        except requests.exceptions.RequestException as e:
            return SophiaResponse(success=False, error=f"Request failed: {str(e)}")
        except Exception as e:
            return SophiaResponse(success=False, error=f"Unexpected error: {str(e)}")

    def get_plans(self, limit: int = 10) -> SophiaResponse:
        """Get recent plans from Sophia.

        Args:
            limit: Maximum number of plans to retrieve

        Returns:
            Plans response

        Raises:
            requests.RequestException: If request fails
        """
        try:
            response = requests.get(
                f"{self.base_url}/api/plans",
                params={"limit": limit},
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()
            return SophiaResponse(success=True, data=data)
        except requests.exceptions.ConnectionError:
            return SophiaResponse(
                success=False,
                error=f"Cannot connect to Sophia at {self.base_url}",
            )
        except requests.exceptions.Timeout:
            return SophiaResponse(
                success=False,
                error=f"Request timed out after {self.timeout} seconds",
            )
        except requests.exceptions.RequestException as e:
            return SophiaResponse(success=False, error=f"Request failed: {str(e)}")
        except Exception as e:
            return SophiaResponse(success=False, error=f"Unexpected error: {str(e)}")

    def health_check(self) -> bool:
        """Check if Sophia is accessible.

        Returns:
            True if Sophia is healthy, False otherwise
        """
        try:
            response = requests.get(
                f"{self.base_url}/health",
                timeout=5,
            )
            return response.status_code == 200
        except Exception:
            return False
