"""Client for interacting with Sophia cognitive core via the shared SDK."""

from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel

from logos_sophia_sdk import ApiClient, Configuration
from logos_sophia_sdk.api.planning_api import PlanningApi
from logos_sophia_sdk.api.system_api import SystemApi
from logos_sophia_sdk.api.world_model_api import WorldModelApi
from logos_sophia_sdk.exceptions import ApiException
from logos_sophia_sdk.models.plan_request import PlanRequest
from logos_sophia_sdk.models.simulation_request import SimulationRequest

from apollo.config.settings import SophiaConfig


class SophiaResponse(BaseModel):
    """Response wrapper so the CLI can render consistent output."""

    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


class SophiaClient:
    """SDK-backed client for Sophia cognitive core APIs."""

    def __init__(self, config: SophiaConfig) -> None:
        """Initialize Sophia client.

        Args:
            config: Sophia configuration
        """
        self.config = config
        self.base_url = f"http://{config.host}:{config.port}"
        self.timeout = config.timeout

        sdk_config = Configuration(host=self.base_url)
        if config.api_key:
            sdk_config.access_token = config.api_key

        self._api_client = ApiClient(configuration=sdk_config)
        self._planning_api = PlanningApi(self._api_client)
        self._system_api = SystemApi(self._api_client)
        self._world_model_api = WorldModelApi(self._api_client)

    # ---------------------------------------------------------------------
    # Public API
    # ---------------------------------------------------------------------
    def send_command(self, command: str) -> SophiaResponse:
        """Send a natural-language command (mapped to /plan)."""
        if not command:
            return SophiaResponse(success=False, error="Command cannot be empty")

        request = PlanRequest(goal=command, metadata={"source": "apollo-cli"})
        return self._submit_plan(request, context="sending command")

    def get_state(
        self, limit: int = 10, cursor: Optional[str] = None, model_type: Optional[str] = None
    ) -> SophiaResponse:
        """Get current agent state from Sophia."""
        try:
            response = self._world_model_api.get_state(
                cursor=cursor,
                limit=limit,
                model_type=model_type,
                _request_timeout=self.timeout,
            )
            return self._success_response(response)
        except Exception as exc:  # noqa: BLE001
            return self._handle_exception("retrieving state", exc)

    def get_plans(self, limit: int = 10) -> SophiaResponse:
        """Alias for get_state to keep legacy CLI commands working."""
        return self.get_state(limit=limit)

    def create_goal(
        self, goal: str, metadata: Optional[Dict[str, Any]] = None
    ) -> SophiaResponse:
        """Create a goal by submitting a plan request."""
        if not goal:
            return SophiaResponse(success=False, error="Goal description cannot be empty")

        metadata_copy = dict(metadata) if metadata else {}
        priority = metadata_copy.pop("priority", None)

        request = PlanRequest(
            goal=goal,
            metadata=metadata_copy or None,
            priority=str(priority) if priority is not None else None,
        )
        return self._submit_plan(request, context="creating goal")

    def invoke_planner(self, goal_id: str) -> SophiaResponse:
        """Invoke the planner (mapped to /plan)."""
        if not goal_id:
            return SophiaResponse(success=False, error="Goal identifier cannot be empty")

        request = PlanRequest(goal=goal_id)
        return self._submit_plan(request, context="invoking planner")

    def execute_step(self, plan_id: str, step_index: int = 0) -> SophiaResponse:
        """Execution is not part of the Phase 2 SDK."""
        return SophiaResponse(
            success=False,
            error="Plan execution is handled by Talos in Phase 2; no executor endpoint is exposed.",
        )

    def simulate_plan(
        self,
        plan_id: str,
        context: Optional[Dict[str, Any]] = None,
        horizon_steps: Optional[int] = None,
    ) -> SophiaResponse:
        """Simulate a plan using the shared SDK."""
        if not plan_id:
            return SophiaResponse(success=False, error="Plan identifier is required for simulation")

        simulation_context: Dict[str, Any] = {"plan_id": plan_id}
        if context:
            simulation_context.update(context)

        request_kwargs: Dict[str, Any] = {}
        if horizon_steps is not None:
            request_kwargs["horizon_steps"] = horizon_steps

        request = SimulationRequest(
            capability_id=plan_id,
            context=simulation_context,
            **request_kwargs,
        )

        try:
            response = self._planning_api.run_simulation(
                request,
                _request_timeout=self.timeout,
            )
            return self._success_response(response)
        except Exception as exc:  # noqa: BLE001
            return self._handle_exception("running simulation", exc)

    def health_check(self) -> bool:
        """Check if Sophia is accessible."""
        try:
            self._system_api.health_check(_request_timeout=min(5, self.timeout))
            return True
        except Exception:  # noqa: BLE001
            return False

    # ---------------------------------------------------------------------
    # Internal helpers
    # ---------------------------------------------------------------------
    def _submit_plan(self, request: PlanRequest, context: str) -> SophiaResponse:
        try:
            response = self._planning_api.create_plan(
                request,
                _request_timeout=self.timeout,
            )
            return self._success_response(response)
        except Exception as exc:  # noqa: BLE001
            return self._handle_exception(context, exc)

    def _success_response(self, payload: Any) -> SophiaResponse:
        return SophiaResponse(success=True, data=self._to_serializable(payload))

    def _handle_exception(self, action: str, error: Exception) -> SophiaResponse:
        if isinstance(error, ApiException):
            details = error.body or error.reason or str(error)
            if error.status == 401:
                details = (
                    "Unauthorized response from Sophia. "
                    "Set sophia.api_key in config.yaml or SOPHIA_API_KEY env var."
                )
            return SophiaResponse(success=False, error=f"Sophia API error while {action}: {details}")

        return SophiaResponse(
            success=False,
            error=f"Cannot connect to Sophia at {self.base_url} while {action}: {error}",
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
