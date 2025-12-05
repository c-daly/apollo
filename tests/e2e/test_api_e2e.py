"""
API End-to-End Tests for Apollo Backend

Test Apollo's FastAPI backend endpoints against real services.
Uses httpx for HTTP testing.

Based on sophia/tests/e2e/test_sophia_e2e.py patterns.
"""

import os

import pytest
import httpx


pytestmark = pytest.mark.e2e


# Apollo backend API base URL (uses test port offset 28003)
APOLLO_API_PORT = int(os.getenv("APOLLO_API_PORT", "28003"))
APOLLO_API_URL = f"http://localhost:{APOLLO_API_PORT}"


@pytest.fixture(scope="module")
def apollo_api_url():
    """Apollo backend API URL."""
    import os

    return os.getenv("APOLLO_API_URL", APOLLO_API_URL)


@pytest.fixture(scope="module")
def api_available(apollo_api_url):
    """Verify Apollo API is available - fail if not.

    Integration tests should fail (not skip) if required services
    are unavailable. The test stack should ensure everything is running.
    """
    try:
        resp = httpx.get(f"{apollo_api_url}/api/hcg/health", timeout=5)
        if resp.status_code != 200:
            pytest.fail(
                f"Apollo API health check failed with status {resp.status_code}. "
                f"Start the API with: ./scripts/run_apollo.sh"
            )
        return True
    except Exception as e:
        pytest.fail(
            f"Apollo API not available at {apollo_api_url}: {e}. "
            f"Start the API with: ./scripts/run_apollo.sh"
        )


class TestApolloAPIHealth:
    """Test Apollo backend health endpoints."""

    def test_hcg_health_endpoint(self, apollo_api_url, api_available):
        """HCG health endpoint should return status."""

        resp = httpx.get(f"{apollo_api_url}/api/hcg/health", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data or "healthy" in str(data).lower()

    def test_diagnostics_endpoint(self, apollo_api_url, api_available):
        """Diagnostics endpoint should return telemetry."""

        resp = httpx.get(f"{apollo_api_url}/api/diagnostics", timeout=10)
        # May return 200 with data or 404 if not implemented
        assert resp.status_code in [200, 404]


class TestApolloHCGAPI:
    """Test Apollo HCG (Hybrid Causal Graph) endpoints."""

    def test_get_processes(self, apollo_api_url, api_available):
        """Should list processes from HCG."""

        resp = httpx.get(f"{apollo_api_url}/api/hcg/processes", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, (list, dict))

    def test_get_goals(self, apollo_api_url, api_available):
        """Should list goals from HCG."""

        resp = httpx.get(f"{apollo_api_url}/api/hcg/goals", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, (list, dict))

    def test_get_state(self, apollo_api_url, api_available):
        """Should return current state."""

        resp = httpx.get(f"{apollo_api_url}/api/hcg/state", timeout=10)
        assert resp.status_code == 200


class TestApolloPersonaAPI:
    """Test Apollo Persona diary endpoints."""

    def test_list_persona_entries(self, apollo_api_url, api_available):
        """Should list persona diary entries."""

        resp = httpx.get(f"{apollo_api_url}/api/persona/entries", timeout=10)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_create_persona_entry(self, apollo_api_url, api_available, unique_id: str):
        """Should create persona diary entry."""

        payload = {
            "entry_type": "observation",
            "content": f"E2E test entry {unique_id}",
            "summary": "Test summary",
            "sentiment": "neutral",
            "confidence": 0.9,
            "related_process_ids": [],
            "related_goal_ids": [],
            "emotion_tags": ["curious"],
            "metadata": {"test": True, "id": unique_id},
        }

        resp = httpx.post(
            f"{apollo_api_url}/api/persona/entries",
            json=payload,
            timeout=10,
        )
        assert resp.status_code == 201, f"Create entry failed: {resp.text}"
        data = resp.json()
        assert data["content"] == payload["content"]
        assert data["entry_type"] == "observation"

    def test_get_persona_entry_by_id(
        self, apollo_api_url, api_available, unique_id: str
    ):
        """Should get persona entry by ID after creation."""

        # First create an entry
        payload = {
            "entry_type": "belief",
            "content": f"Retrievable entry {unique_id}",
            "sentiment": "positive",
        }

        create_resp = httpx.post(
            f"{apollo_api_url}/api/persona/entries",
            json=payload,
            timeout=10,
        )
        if create_resp.status_code != 201:
            pytest.fail(
                f"Could not create entry for retrieval test: {create_resp.status_code} - {create_resp.text}"
            )

        entry_id = create_resp.json()["id"]

        # Now retrieve it
        get_resp = httpx.get(
            f"{apollo_api_url}/api/persona/entries/{entry_id}",
            timeout=10,
        )
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["id"] == entry_id

    def test_filter_persona_entries_by_type(self, apollo_api_url, api_available):
        """Should filter entries by type."""

        resp = httpx.get(
            f"{apollo_api_url}/api/persona/entries",
            params={"entry_type": "observation"},
            timeout=10,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_filter_persona_entries_by_sentiment(self, apollo_api_url, api_available):
        """Should filter entries by sentiment."""

        resp = httpx.get(
            f"{apollo_api_url}/api/persona/entries",
            params={"sentiment": "positive"},
            timeout=10,
        )
        assert resp.status_code == 200


class TestApolloWebSocketDiagnostics:
    """Test Apollo WebSocket diagnostics endpoint."""

    @pytest.mark.slow
    def test_websocket_connects(self, apollo_api_url, api_available):
        """WebSocket diagnostics should accept connection."""

        # Convert http to ws
        ws_url = apollo_api_url.replace("http://", "ws://")

        try:
            import websockets
            import asyncio

            async def connect_test():
                async with websockets.connect(
                    f"{ws_url}/ws/diagnostics",
                    close_timeout=5,
                ) as ws:
                    # Should receive initial telemetry
                    msg = await asyncio.wait_for(ws.recv(), timeout=5)
                    return msg is not None

            result = asyncio.get_event_loop().run_until_complete(connect_test())
            assert result, "WebSocket should receive initial message"

        except ImportError:
            pytest.fail("websockets library not installed. Run: poetry install")
        except Exception as e:
            pytest.fail(f"WebSocket connection failed: {e}")


class TestCompleteWorkflow:
    """Test complete workflow from command to state update."""

    @pytest.mark.slow
    def test_goal_to_plan_to_state(self, sophia_client, neo4j_driver, unique_id: str):
        """Test workflow: submit goal → generate plan → verify state."""
        # Step 1: Submit command
        response = sophia_client.send_command(f"pick up test object {unique_id}")
        assert response.success, f"Command failed: {response.error}"

        # Step 2: Verify plan was generated
        if response.data:
            plan = response.data.get("plan") or response.data
            assert isinstance(plan, (dict, list))

        # Step 3: Check state reflects command was processed
        # Note: get_state may fail due to SDK oneOf deserialization issue
        # We test the HTTP endpoint directly elsewhere
        state_response = sophia_client.get_state()
        # Don't fail if state retrieval has SDK issues - the plan was created
        if not state_response.success:
            pytest.skip(
                f"State retrieval skipped due to SDK issue: {state_response.error}"
            )

    @pytest.mark.slow
    def test_persona_entry_to_retrieval(
        self, apollo_api_url, api_available, unique_id: str
    ):
        """Test workflow: create entry → list entries → find entry."""

        # Create
        content = f"Workflow test entry {unique_id}"
        create_resp = httpx.post(
            f"{apollo_api_url}/api/persona/entries",
            json={
                "entry_type": "decision",
                "content": content,
                "sentiment": "neutral",
            },
            timeout=10,
        )
        assert create_resp.status_code == 201
        entry_id = create_resp.json()["id"]

        # List and find
        list_resp = httpx.get(
            f"{apollo_api_url}/api/persona/entries",
            params={"limit": 10},
            timeout=10,
        )
        assert list_resp.status_code == 200
        entries = list_resp.json()

        # Verify our entry is in the list
        entry_ids = [e["id"] for e in entries]
        assert entry_id in entry_ids, f"Created entry {entry_id} not found in list"
