"""Shared pytest fixtures for Apollo tests."""

import pytest
from typing import Generator
from unittest.mock import AsyncMock, Mock
from fastapi.testclient import TestClient

from apollo.api.server import app
from apollo.data.hcg_client import HCGClient
from apollo.data.persona_store import PersonaDiaryStore
from apollo.client.hermes_client import HermesClient


@pytest.fixture
def mock_hcg_client() -> Mock:
    """Create a mocked HCGClient with common responses."""
    from apollo.data.models import Entity, State, Process, CausalEdge, GraphSnapshot
    from datetime import datetime

    client = Mock(spec=HCGClient)

    # health_check returns bool
    client.health_check = Mock(return_value=True)

    # get_entities returns List[Entity]
    client.get_entities = Mock(
        return_value=[
            Entity(
                id="entity1",
                type="goal",
                properties={"name": "Test Goal"},
                labels=["Goal"],
                created_at=datetime(2024, 1, 1),
                updated_at=datetime(2024, 1, 1),
            )
        ]
    )

    # get_entity_by_id returns Entity or None
    client.get_entity_by_id = Mock(
        return_value=Entity(
            id="entity1",
            type="goal",
            properties={"name": "Test Goal"},
            labels=["Goal"],
            created_at=datetime(2024, 1, 1),
            updated_at=datetime(2024, 1, 1),
        )
    )

    # get_states returns List[State]
    client.get_states = Mock(
        return_value=[
            State(
                id="state1",
                type="state",
                description="Test state",
                variables={"x": 1},
                timestamp=datetime(2024, 1, 1),
                properties={},
            )
        ]
    )

    # get_processes returns List[Process]
    client.get_processes = Mock(
        return_value=[
            Process(
                id="proc1",
                type="process",
                name="Test Process",
                description="Test process description",
                status="pending",
                inputs=[],
                outputs=[],
                properties={},
                created_at=datetime(2024, 1, 1),
            )
        ]
    )

    # get_causal_edges returns List[CausalEdge]
    client.get_causal_edges = Mock(
        return_value=[
            CausalEdge(
                id="edge1",
                source_id="entity1",
                target_id="state1",
                edge_type="causes",
                properties={},
                weight=1.0,
                created_at=datetime(2024, 1, 1),
            )
        ]
    )

    # get_graph_snapshot returns GraphSnapshot
    client.get_graph_snapshot = Mock(
        return_value=GraphSnapshot(
            entities=[
                Entity(
                    id="entity1",
                    type="goal",
                    properties={},
                    labels=["Goal"],
                    created_at=datetime(2024, 1, 1),
                    updated_at=datetime(2024, 1, 1),
                )
            ],
            edges=[
                CausalEdge(
                    id="edge1",
                    source_id="entity1",
                    target_id="state1",
                    edge_type="causes",
                    properties={},
                    weight=1.0,
                    created_at=datetime(2024, 1, 1),
                )
            ],
            timestamp=datetime(2024, 1, 1),
            metadata={"version": "1.0"},
        )
    )

    client.close = Mock()
    return client


@pytest.fixture
def mock_persona_store() -> Mock:
    """Create a mocked PersonaDiaryStore."""
    from apollo.data.models import PersonaEntry
    from datetime import datetime

    store = Mock(spec=PersonaDiaryStore)

    # create_entry returns PersonaEntry
    store.create_entry = Mock(
        return_value=PersonaEntry(
            id="entry-123",
            timestamp=datetime(2024, 1, 1),
            entry_type="observation",
            content="Test entry",
            summary="Test summary",
            sentiment="neutral",
            confidence=0.9,
            related_process_ids=[],
            related_goal_ids=[],
            emotion_tags=[],
            metadata={},
        )
    )

    # get_entry returns PersonaEntry or None
    store.get_entry = Mock(
        return_value=PersonaEntry(
            id="entry-123",
            timestamp=datetime(2024, 1, 1),
            entry_type="observation",
            content="Test entry",
            summary=None,
            sentiment=None,
            confidence=None,
            related_process_ids=[],
            related_goal_ids=[],
            emotion_tags=[],
            metadata={},
        )
    )

    # list_entries returns List[PersonaEntry]
    store.list_entries = Mock(
        return_value=[
            PersonaEntry(
                id="entry-1",
                timestamp=datetime(2024, 1, 1),
                entry_type="observation",
                content="Entry 1",
                summary=None,
                sentiment=None,
                confidence=None,
                related_process_ids=[],
                related_goal_ids=[],
                emotion_tags=[],
                metadata={},
            ),
            PersonaEntry(
                id="entry-2",
                timestamp=datetime(2024, 1, 2),
                entry_type="belief",
                content="Entry 2",
                summary=None,
                sentiment=None,
                confidence=None,
                related_process_ids=[],
                related_goal_ids=[],
                emotion_tags=[],
                metadata={},
            ),
        ]
    )

    store.update_entry = Mock(return_value=True)
    store.delete_entry = Mock(return_value=True)
    return store


@pytest.fixture
def mock_hermes_client() -> Mock:
    """Create a mocked HermesClient."""
    client = Mock(spec=HermesClient)
    client.embed_text = AsyncMock(return_value={"embedding": [0.1] * 768})
    client.simple_nlp = AsyncMock(return_value={"sentiment": "neutral", "entities": []})
    return client


@pytest.fixture
def test_client(
    mock_hcg_client: Mock, mock_persona_store: Mock, mock_hermes_client: Mock
) -> Generator[TestClient, None, None]:
    """Create FastAPI TestClient with mocked dependencies.

    Uses context manager pattern to ensure lifespan events are triggered,
    which initializes the shared HTTP client for connection pooling.

    Important: We override the module globals AFTER TestClient starts because
    the lifespan event creates real clients that would overwrite patches.
    """
    import apollo.api.server as server_module

    # Use context manager to trigger lifespan events (startup/shutdown)
    with TestClient(app) as client:
        # Override globals AFTER lifespan ran (lifespan creates real clients)
        original_hcg = server_module.hcg_client
        original_persona = server_module.persona_store
        original_hermes = server_module.hermes_client

        server_module.hcg_client = mock_hcg_client
        server_module.persona_store = mock_persona_store
        server_module.hermes_client = mock_hermes_client

        try:
            yield client
        finally:
            # Restore originals for proper cleanup
            server_module.hcg_client = original_hcg
            server_module.persona_store = original_persona
            server_module.hermes_client = original_hermes


@pytest.fixture
def sample_media_file() -> bytes:
    """Sample media file content for upload tests."""
    # Simple 1x1 pixel PNG
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\x00\x01"
        b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
