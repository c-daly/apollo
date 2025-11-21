"""Client for interacting with Sophia cognitive core via the shared SDK."""

from __future__ import annotations

from typing import Any, Dict, Optional

from logos_sophia_sdk.models.plan_request import PlanRequest
from logos_sophia_sdk.models.simulation_request import SimulationRequest

from apollo.config.settings import SophiaConfig
from apollo.sdk import (
    ServiceResponse,
    SophiaSDK,
    build_sophia_sdk,
    execute_sophia_call,
)


class SophiaResponse(ServiceResponse):
    """Response wrapper so the CLI can render consistent output."""


class SophiaClient:
    """SDK-backed client for Sophia cognitive core APIs."""

    def __init__(self, config: SophiaConfig, sdk: Optional[SophiaSDK] = None) -> None:
        """Initialize Sophia client.

        Args:
            config: Sophia configuration
            sdk:   Optional pre-configured Sophia SDK (useful for tests)
        """
        self.config = config
        self._sdk = sdk or build_sophia_sdk(config)
        self.base_url = self._sdk.base_url
        self.timeout = self._sdk.timeout

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
        self,
        limit: int = 10,
        cursor: Optional[str] = None,
        model_type: Optional[str] = None,
    ) -> SophiaResponse:
        """Get current agent state from Sophia."""
        success, data, error = execute_sophia_call(
            self._sdk,
            "retrieving state",
            lambda: self._sdk.world_model.get_state(
                cursor=cursor,
                limit=limit,
                model_type=model_type,
                _request_timeout=self.timeout,
            ),
        )
        return SophiaResponse(success=success, data=data, error=error)

    def get_plans(self, limit: int = 10) -> SophiaResponse:
        """Fetch recent planning/state history (via CWM state)."""
        # The Phase 2 API returns recent CWM states; we expose the same helper
        return self.get_state(limit=limit)

    def create_goal(
        self, goal: str, metadata: Optional[Dict[str, Any]] = None
    ) -> SophiaResponse:
        """Create a goal by submitting a plan request."""
        if not goal:
            return SophiaResponse(
                success=False, error="Goal description cannot be empty"
            )

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
            return SophiaResponse(
                success=False, error="Goal identifier cannot be empty"
            )

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
            return SophiaResponse(
                success=False, error="Plan identifier is required for simulation"
            )

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

        success, data, error = execute_sophia_call(
            self._sdk,
            "running simulation",
            lambda: self._sdk.planning.run_simulation(
                request,
                _request_timeout=self.timeout,
            ),
        )
        return SophiaResponse(success=success, data=data, error=error)

    def health_check(self) -> bool:
        """Check if Sophia is accessible."""
        success, _, _ = execute_sophia_call(
            self._sdk,
            "performing health check",
            lambda: self._sdk.system.health_check(
                _request_timeout=min(5, self.timeout)
            ),
        )
        return success

    # ---------------------------------------------------------------------
    # Internal helpers
    # ---------------------------------------------------------------------
    def _submit_plan(self, request: PlanRequest, context: str) -> SophiaResponse:
        success, data, error = execute_sophia_call(
            self._sdk,
            context,
            lambda: self._sdk.planning.create_plan(
                request,
                _request_timeout=self.timeout,
            ),
        )
        return SophiaResponse(success=success, data=data, error=error)
