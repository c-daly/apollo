"""Client for interacting with the Apollo persona diary API."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import requests

from apollo.config.settings import PersonaApiConfig
from apollo.sdk import ServiceResponse


class PersonaClient:
    """Simple HTTP client for persona diary endpoints exposed by apollo-api."""

    def __init__(self, config: PersonaApiConfig) -> None:
        self.config = config
        self.base_url = _normalize_base_url(config.host, config.port)
        self.timeout = config.timeout
        self._entries_url = f"{self.base_url}/api/persona/entries"
        self._headers = _build_headers(config.api_key)

    def create_entry(
        self,
        content: str,
        entry_type: str,
        summary: Optional[str],
        sentiment: Optional[str],
        confidence: Optional[float],
        process: List[str],
        goal: List[str],
        emotion: List[str],
    ) -> ServiceResponse:
        """Create a persona diary entry via the Apollo API."""
        payload: Dict[str, Any] = {
            "entry_type": entry_type,
            "content": content,
            "summary": summary,
            "sentiment": sentiment,
            "confidence": confidence,
            "related_process_ids": list(process),
            "related_goal_ids": list(goal),
            "emotion_tags": list(emotion),
            "metadata": {},
        }

        return self._post_json(self._entries_url, payload, "creating persona entry")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _post_json(self, url: str, payload: Dict[str, Any], action: str) -> ServiceResponse:
        try:
            response = requests.post(
                url,
                json=payload,
                timeout=self.timeout,
                headers=self._headers,
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
