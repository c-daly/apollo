"""Client for interacting with Hermes language and embedding service."""

from __future__ import annotations

from typing import Optional

from logos_hermes_sdk.models.embed_text_request import EmbedTextRequest
from logos_hermes_sdk.models.llm_request import LLMRequest

from apollo.config.settings import HermesConfig
from apollo.sdk import (
    HermesSDK,
    ServiceResponse,
    build_hermes_sdk,
    execute_hermes_call,
)


class HermesResponse(ServiceResponse):
    """Response wrapper for Hermes operations."""


class HermesClient:
    """SDK-backed Hermes client."""

    def __init__(self, config: HermesConfig, sdk: Optional[HermesSDK] = None) -> None:
        self.config = config
        self._sdk = sdk or build_hermes_sdk(config)
        self.base_url = self._sdk.base_url
        self.timeout = self._sdk.timeout

    def embed_text(self, text: str, model: str = "default") -> HermesResponse:
        """Generate an embedding for the provided text."""
        if not text:
            return HermesResponse(success=False, error="Text is required for embedding")

        request = EmbedTextRequest(text=text, model=model or "default")
        success, data, error = execute_hermes_call(
            self._sdk,
            "generating embeddings",
            lambda: self._sdk.default.embed_text(
                request,
                _request_timeout=self.timeout,
            ),
        )
        return HermesResponse(success=success, data=data, error=error)

    def llm_generate(self, request: LLMRequest) -> HermesResponse:
        """Invoke the Hermes LLM gateway."""

        success, data, error = execute_hermes_call(
            self._sdk,
            "calling Hermes LLM gateway",
            lambda: self._sdk.default.llm_generate(  # noqa: PLC0415
                request,
                _request_timeout=self.timeout,
            ),
        )
        return HermesResponse(success=success, data=data, error=error)

    def health_check(self) -> bool:
        """Basic connectivity probe via HTTP HEAD."""
        response = None
        try:
            response = self._sdk.api_client.rest_client.pool_manager.request(
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
