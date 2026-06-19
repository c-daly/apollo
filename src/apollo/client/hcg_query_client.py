"""Thin HTTP client for Sophia's Hybrid Causal Graph (``/hcg/*``) endpoints.

Sophia is the Neo4j gatekeeper: this client never touches Neo4j directly,
it only issues authenticated HTTP requests against Sophia's read API. It is
intentionally separate from :class:`apollo.data.HCGClient` (the Neo4j-based
client) to avoid coupling the CLI to a database driver.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import requests

from apollo.config.settings import SophiaConfig


class HCGQueryError(Exception):
    """Raised when an HCG HTTP query fails (connection or HTTP error)."""


def _normalize_base_url(host: str, port: int) -> str:
    """Build a base URL, honouring a fully-qualified host if provided."""
    if host.startswith(("http://", "https://")):
        return host.rstrip("/")
    return f"http://{host}:{port}"


def _build_headers(api_key: Optional[str]) -> Dict[str, str]:
    """Build request headers, including bearer auth only when a key is set."""
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


class HCGQueryClient:
    """Read-only HTTP client for Sophia's HCG endpoints."""

    def __init__(self, config: SophiaConfig) -> None:
        self.config = config
        self.base_url = _normalize_base_url(config.host, config.port)
        self.timeout = config.timeout
        self._headers = _build_headers(config.api_key)

    def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Issue a GET request and return parsed JSON, raising on failure."""
        url = f"{self.base_url}{path}"
        try:
            response = requests.get(
                url,
                params=params,
                headers=self._headers,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise HCGQueryError(
                f"Failed to reach Sophia HCG endpoint {url}: {exc}"
            ) from exc

        try:
            response.raise_for_status()
        except requests.HTTPError as exc:
            snippet = (response.text or "").strip()
            if len(snippet) > 200:
                snippet = f"{snippet[:200]}..."
            detail = f" - {snippet}" if snippet else ""
            raise HCGQueryError(
                f"Sophia HCG request to {url} failed with status "
                f"{response.status_code}{detail}"
            ) from exc

        try:
            return response.json()
        except ValueError as exc:
            raise HCGQueryError(
                f"Sophia HCG response from {url} was not valid JSON: {exc}"
            ) from exc

    def stats(self) -> Dict[str, Any]:
        """Return graph-wide statistics from ``GET /hcg/stats``."""
        result = self._get("/hcg/stats")
        return result if isinstance(result, dict) else {}

    def types(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return type definitions from ``GET /hcg/types``."""
        result = self._get("/hcg/types", params={"limit": limit})
        return result if isinstance(result, list) else []

    def neighborhood(
        self, uuid: str, depth: int = 1, limit: int = 25
    ) -> Dict[str, Any]:
        """Return a node's de-reified neighborhood from ``/hcg/neighborhood``."""
        result = self._get(
            f"/hcg/neighborhood/{uuid}",
            params={"depth": depth, "limit": limit},
        )
        return result if isinstance(result, dict) else {}

    def search(self, q: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Return search hits from ``GET /hcg/search``."""
        result = self._get("/hcg/search", params={"q": q, "limit": limit})
        return result if isinstance(result, list) else []

    def entity(self, uuid: str) -> Dict[str, Any]:
        """Return an entity object from ``GET /hcg/entities/{uuid}``."""
        result = self._get(f"/hcg/entities/{uuid}")
        return result if isinstance(result, dict) else {}
