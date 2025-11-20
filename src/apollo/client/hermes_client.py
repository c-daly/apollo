"""Client for interacting with Hermes language and embedding service."""

from typing import Any, Dict, List, Optional

import requests
from pydantic import BaseModel

from apollo.config.settings import HermesConfig


class HermesResponse(BaseModel):
    """Response from Hermes API."""

    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class HermesClient:
    """Client for Hermes language and embedding API.

    Phase 2 implementation for text embedding and semantic search.
    """

    def __init__(self, config: HermesConfig) -> None:
        """Initialize Hermes client.

        Args:
            config: Hermes configuration
        """
        self.config = config
        self.base_url = f"http://{config.host}:{config.port}"
        self.timeout = config.timeout

    def embed_text(
        self, text: str, model: str = "sentence-transformers", normalize: bool = True
    ) -> HermesResponse:
        """Generate embedding for text.

        Args:
            text: Text to embed
            model: Embedding model to use
            normalize: Whether to normalize the embedding

        Returns:
            Response with embedding vector

        Raises:
            requests.RequestException: If request fails
        """
        try:
            response = requests.post(
                f"{self.base_url}/api/embed_text",
                json={"text": text, "model": model, "normalize": normalize},
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()
            return HermesResponse(success=True, data=data)
        except requests.exceptions.ConnectionError:
            return HermesResponse(
                success=False,
                error=f"Cannot connect to Hermes at {self.base_url}",
            )
        except requests.exceptions.Timeout:
            return HermesResponse(
                success=False,
                error=f"Request timed out after {self.timeout} seconds",
            )
        except requests.exceptions.RequestException as e:
            return HermesResponse(success=False, error=f"Request failed: {str(e)}")
        except Exception as e:
            return HermesResponse(success=False, error=f"Unexpected error: {str(e)}")

    def embed_batch(
        self,
        texts: List[str],
        model: str = "sentence-transformers",
        normalize: bool = True,
    ) -> HermesResponse:
        """Generate embeddings for multiple texts.

        Args:
            texts: Texts to embed
            model: Embedding model to use
            normalize: Whether to normalize embeddings

        Returns:
            Response with embedding vectors

        Raises:
            requests.RequestException: If request fails
        """
        try:
            response = requests.post(
                f"{self.base_url}/api/embed_batch",
                json={"texts": texts, "model": model, "normalize": normalize},
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()
            return HermesResponse(success=True, data=data)
        except requests.exceptions.ConnectionError:
            return HermesResponse(
                success=False,
                error=f"Cannot connect to Hermes at {self.base_url}",
            )
        except requests.exceptions.Timeout:
            return HermesResponse(
                success=False,
                error=f"Request timed out after {self.timeout} seconds",
            )
        except requests.exceptions.RequestException as e:
            return HermesResponse(success=False, error=f"Request failed: {str(e)}")
        except Exception as e:
            return HermesResponse(success=False, error=f"Unexpected error: {str(e)}")

    def health_check(self) -> bool:
        """Check if Hermes is accessible.

        Returns:
            True if Hermes is healthy, False otherwise
        """
        try:
            response = requests.get(
                f"{self.base_url}/health",
                timeout=5,
            )
            return response.status_code == 200
        except Exception:
            return False
