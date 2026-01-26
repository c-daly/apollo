"""Helpers for configuring and invoking the generated LOGOS SDK clients."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional, Tuple

from pydantic import BaseModel

from logos_hermes_sdk import ApiClient as HermesApiClient
from logos_hermes_sdk import Configuration as HermesConfiguration
from logos_hermes_sdk.api.default_api import DefaultApi
from logos_hermes_sdk.exceptions import ApiException as HermesApiException
from logos_sophia_sdk import ApiClient as SophiaApiClient
from logos_sophia_sdk import Configuration as SophiaConfiguration
from logos_sophia_sdk.api.planning_api import PlanningApi
from logos_sophia_sdk.api.system_api import SystemApi
from logos_sophia_sdk.api.world_model_api import WorldModelApi
from logos_sophia_sdk.exceptions import ApiException as SophiaApiException

from apollo.config.settings import HermesConfig, SophiaConfig

CallResult = Tuple[bool, Optional[Any], Optional[str]]


class ServiceResponse(BaseModel):
    """Base response wrapper shared by all Apollo service clients."""

    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None

    @classmethod
    def from_result(cls, result: CallResult) -> "ServiceResponse":
        success, data, error = result
        return cls(success=success, data=data, error=error)


@dataclass
class SophiaSDK:
    """Container for configured Sophia SDK clients."""

    planning: PlanningApi
    system: SystemApi
    world_model: WorldModelApi
    api_client: SophiaApiClient
    base_url: str
    timeout: int


@dataclass
class HermesSDK:
    """Container for configured Hermes SDK clients."""

    default: DefaultApi
    api_client: HermesApiClient
    base_url: str
    timeout: int


def build_sophia_sdk(config: SophiaConfig) -> SophiaSDK:
    """Instantiate Sophia SDK APIs using Apollo configuration."""

    base_url = _normalize_base_url(config.host, config.port)
    sdk_config = SophiaConfiguration(host=base_url)

    if config.api_key:
        sdk_config.access_token = config.api_key

    api_client = SophiaApiClient(configuration=sdk_config)
    return SophiaSDK(
        planning=PlanningApi(api_client),
        system=SystemApi(api_client),
        world_model=WorldModelApi(api_client),
        api_client=api_client,
        base_url=base_url,
        timeout=config.timeout,
    )


def build_hermes_sdk(config: HermesConfig) -> HermesSDK:
    """Instantiate Hermes SDK APIs using Apollo configuration."""

    base_url = _normalize_base_url(config.host, config.port)
    sdk_config = HermesConfiguration(host=base_url)

    if config.api_key:
        sdk_config.access_token = config.api_key

    api_client = HermesApiClient(configuration=sdk_config)
    return HermesSDK(
        default=DefaultApi(api_client),
        api_client=api_client,
        base_url=base_url,
        timeout=config.timeout,
    )


def serialize_payload(payload: Any) -> Any:
    """Convert SDK payloads to JSON-serializable values."""

    if payload is None:
        return None
    if isinstance(payload, dict):
        return payload
    if hasattr(payload, "to_dict"):
        return payload.to_dict()
    if hasattr(payload, "model_dump"):
        return payload.model_dump()
    return payload


def execute_sophia_call(
    sdk: SophiaSDK,
    action: str,
    operation: Callable[[], Any],
) -> CallResult:
    """Execute a Sophia SDK call with consistent error handling."""

    try:
        return True, serialize_payload(operation()), None
    except SophiaApiException as exc:  # pragma: no cover - exercised via unit tests
        details = exc.body or exc.reason or str(exc)
        if exc.status == 401:
            details = (
                "Unauthorized response from Sophia. "
                "Set SOPHIA_API_KEY env var."
            )
        return False, None, f"Sophia API error while {action}: {details}"
    except Exception as exc:  # noqa: BLE001
        return (
            False,
            None,
            f"Cannot connect to Sophia at {sdk.base_url} while {action}: {exc}",
        )


def execute_hermes_call(
    sdk: HermesSDK,
    action: str,
    operation: Callable[[], Any],
) -> CallResult:
    """Execute a Hermes SDK call with consistent error handling."""

    try:
        return True, serialize_payload(operation()), None
    except HermesApiException as exc:  # pragma: no cover - exercised via unit tests
        details = exc.body or exc.reason or str(exc)
        if exc.status == 401:
            details = (
                "Unauthorized response from Hermes. "
                "Set HERMES_API_KEY env var."
            )
        return False, None, f"Hermes API error while {action}: {details}"
    except Exception as exc:  # noqa: BLE001
        return (
            False,
            None,
            f"Cannot reach Hermes at {sdk.base_url} while {action}: {exc}",
        )


def _normalize_base_url(host: str, port: int) -> str:
    """Ensure we always hand the SDK an explicit base URL."""

    host = host.rstrip("/")
    if host.startswith(("http://", "https://")):
        return host
    return f"http://{host}:{port}"


__all__ = [
    "CallResult",
    "ServiceResponse",
    "HermesSDK",
    "SophiaSDK",
    "build_hermes_sdk",
    "build_sophia_sdk",
    "execute_hermes_call",
    "execute_sophia_call",
    "serialize_payload",
]
