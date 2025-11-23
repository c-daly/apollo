"""Client for interacting with the Sophia persona diary API."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import requests

from apollo.config.settings import PersonaApiConfig
from apollo.sdk import ServiceResponse


class PersonaClient:
    """Simple HTTP client for persona diary endpoints exposed by Sophia."""

    def __init__(self, config: PersonaApiConfig) -> None:
        self.config = config
        self.base_url = _normalize_base_url(config.host, config.port)
        self.timeout = config.timeout
        self._entries_url = f"{self.base_url}/persona/entries"
        self._headers = _build_headers(config.api_key)

    def create_entry(
        self,
        content: str,
        entry_type: str,
        trigger: Optional[str],
        summary: Optional[str],
        sentiment: Optional[str],
        confidence: Optional[float],
        process: List[str],
        goal: List[str],
        emotion: List[str],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ServiceResponse:
        """Create a persona diary entry via Sophia."""
        payload: Dict[str, Any] = {
            "entry_type": entry_type,
            "trigger": trigger,
            "content": content,
            "summary": summary,
            "sentiment": sentiment,
            "confidence": confidence,
            "related_process_ids": list(process),
            "related_goal_ids": list(goal),
            "emotion_tags": list(emotion),
            "metadata": metadata or {},
        }
        return self._request(
            "POST", self._entries_url, "creating persona entry", json=payload
        )

    def list_entries(
        self,
        entry_type: Optional[str],
        sentiment: Optional[str],
        related_process_id: Optional[str],
        related_goal_id: Optional[str],
        limit: int,
        offset: int,
    ) -> ServiceResponse:
        """List persona entries with optional filters."""
        params: Dict[str, Any] = {
            "limit": limit,
            "offset": offset,
        }
        if entry_type:
            params["entry_type"] = entry_type
        if sentiment:
            params["sentiment"] = sentiment
        if related_process_id:
            params["related_process_id"] = related_process_id
        if related_goal_id:
            params["related_goal_id"] = related_goal_id

        return self._request(
            "GET", self._entries_url, "listing persona entries", params=params
        )

    def get_entry(self, entry_id: str) -> ServiceResponse:
        """Fetch a specific persona entry by ID."""
        url = f"{self._entries_url}/{entry_id}"
        return self._request("GET", url, "retrieving persona entry")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _request(
        self, method: str, url: str, action: str, **kwargs: Any
    ) -> ServiceResponse:
        try:
            response = requests.request(
                method,
                url,
                timeout=self.timeout,
                headers=self._headers,
                **kwargs,
            )
            response.raise_for_status()
            data = response.json() if response.content else None
            return ServiceResponse(success=True, data=data)
        except requests.exceptions.HTTPError as exc:
            return ServiceResponse(
                success=False,
                error=f"Persona API error while {action}: {exc.response.text or exc}",
            )
        except requests.exceptions.RequestException as exc:
            return ServiceResponse(
                success=False,
                error=f"Cannot reach persona API at {self.base_url} while {action}: {exc}",
            )


def _normalize_base_url(host: str, port: int) -> str:
    if host.startswith(("http://", "https://")):
        return host.rstrip("/")
    return f"http://{host}:{port}"


def _build_headers(api_key: Optional[str]) -> Dict[str, str]:
    if not api_key:
        return {}
    return {"Authorization": f"Bearer {api_key}"}
