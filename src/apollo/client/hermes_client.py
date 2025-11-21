"""Client for interacting with Hermes language and embedding service."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel

from logos_hermes_sdk import ApiClient, Configuration
from logos_hermes_sdk.api.default_api import DefaultApi
from logos_hermes_sdk.exceptions import ApiException
from logos_hermes_sdk.models.embed_text_request import EmbedTextRequest

from apollo.config.settings import HermesConfig


class HermesResponse(BaseModel):
    """Response wrapper for Hermes operations."""

    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


class HermesClient:
    """SDK-backed Hermes client."""

    def __init__(self, config: HermesConfig) -> None:
        self.config = config
        self.base_url = f"http://{config.host}:{config.port}"
        self.timeout = config.timeout

        sdk_config = Configuration(host=self.base_url)
        if config.api_key:
            sdk_config.access_token = config.api_key

        self._api_client = ApiClient(configuration=sdk_config)
        self._default_api = DefaultApi(self._api_client)

    def embed_text(self, text: str, model: str = "default") -> HermesResponse:
        """Generate an embedding for the provided text."""
        if not text:
            return HermesResponse(success=False, error="Text is required for embedding")

        request = EmbedTextRequest(text=text, model=model or "default")

        try:
            response = self._default_api.embed_text(
                request,
                _request_timeout=self.timeout,
            )
            return HermesResponse(success=True, data=self._to_serializable(response))
        except Exception as exc:  # noqa: BLE001
            return self._handle_exception("generating embeddings", exc)

    def health_check(self) -> bool:
        """Basic connectivity probe."""
        # Hermes SDK does not expose a dedicated health endpoint. Attempting a fast
        # no-op call would still allocate GPU work, so we just ensure the base URL
        # resolves by opening a socket via urllib3.
        response = None
        try:
            response = self._api_client.rest_client.pool_manager.request(
                "HEAD",
                f"{self.base_url}/health",
                timeout=min(5, self.timeout),
                preload_content=False,
            )
            return 200 <= getattr(response, "status", 500) < 300
        except Exception:  # noqa: BLE001
            return False
        finally:
            if response is not None:
                try:
                    response.release_conn()
                except Exception:  # noqa: BLE001
                    pass

    def _handle_exception(self, action: str, error: Exception) -> HermesResponse:
        if isinstance(error, ApiException):
            details = error.body or error.reason or str(error)
            return HermesResponse(success=False, error=f"Hermes API error while {action}: {details}")

        return HermesResponse(
            success=False,
            error=f"Cannot reach Hermes at {self.base_url} while {action}: {error}",
        )

    @staticmethod
    def _to_serializable(payload: Any) -> Any:
        if payload is None:
            return None
        if isinstance(payload, dict):
            return payload
        if hasattr(payload, "to_dict"):
            return payload.to_dict()
        if hasattr(payload, "model_dump"):
            return payload.model_dump()
        return payload
