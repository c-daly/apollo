"""Tests for HCG client."""

from datetime import datetime
from unittest.mock import Mock, patch

import pytest

from apollo.config.settings import Neo4jConfig
from apollo.data import HCGClient, Entity, State, Process, CausalEdge


@pytest.fixture
def neo4j_config() -> Neo4jConfig:
    """Create test Neo4j configuration."""
    return Neo4jConfig(
        uri="bolt://localhost:7687",
        user="neo4j",
        password="test_password",
    )


@pytest.fixture
def mock_driver() -> Mock:
    """Create mock Neo4j driver."""
    driver = Mock()
    session = Mock()
    driver.session.return_value.__enter__ = Mock(return_value=session)
    driver.session.return_value.__exit__ = Mock(return_value=None)
    return driver


def test_hcg_client_initialization(neo4j_config: Neo4jConfig) -> None:
    """Test HCG client initialization."""
    client = HCGClient(neo4j_config)
    assert client.config == neo4j_config
    assert client._driver is None


def test_hcg_client_connect(neo4j_config: Neo4jConfig) -> None:
    """Test HCG client connection."""
    with patch("apollo.data.hcg_client.GraphDatabase") as mock_gd:
        mock_driver = Mock()
        mock_gd.driver.return_value = mock_driver

        client = HCGClient(neo4j_config)
        client.connect()

        mock_gd.driver.assert_called_once_with(
            neo4j_config.uri,
            auth=(neo4j_config.user, neo4j_config.password),
        )
        assert client._driver == mock_driver


def test_hcg_client_close(neo4j_config: Neo4jConfig) -> None:
    """Test HCG client closure."""
    with patch("apollo.data.hcg_client.GraphDatabase"):
        client = HCGClient(neo4j_config)
        client.connect()
        assert client._driver is not None

        client.close()
        assert client._driver is None


def test_hcg_client_context_manager(neo4j_config: Neo4jConfig) -> None:
    """Test HCG client as context manager."""
    with patch("apollo.data.hcg_client.GraphDatabase") as mock_gd:
        mock_driver = Mock()
        mock_gd.driver.return_value = mock_driver

        with HCGClient(neo4j_config) as client:
            assert client._driver == mock_driver

        mock_driver.close.assert_called_once()


def test_get_entities(neo4j_config: Neo4jConfig, mock_driver: Mock) -> None:
    """Test getting entities."""
    with patch("apollo.data.hcg_client.GraphDatabase") as mock_gd:
        mock_gd.driver.return_value = mock_driver

        # Mock session and result
        session = Mock()
        mock_driver.session.return_value.__enter__.return_value = session

        # Mock node with proper dict behavior
        node_properties = {"id": "entity_1", "type": "test"}
        mock_node = Mock()
        mock_node.id = 1
        mock_node.labels = ["Entity"]
        mock_node.__iter__ = lambda self: iter(node_properties.items())
        mock_node.__getitem__ = lambda self, key: node_properties[key]
        mock_node.keys = lambda: node_properties.keys()
        mock_node.values = lambda: node_properties.values()
        mock_node.items = lambda: node_properties.items()

        mock_record = {"n": mock_node}
        session.run.return_value = [mock_record]

        client = HCGClient(neo4j_config)
        entities = client.get_entities(limit=10)

        assert len(entities) == 1
        assert entities[0].id == "entity_1"
        assert entities[0].type == "test"


def test_get_entity_by_id(neo4j_config: Neo4jConfig, mock_driver: Mock) -> None:
    """Test getting entity by ID."""
    with patch("apollo.data.hcg_client.GraphDatabase") as mock_gd:
        mock_gd.driver.return_value = mock_driver

        session = Mock()
        mock_driver.session.return_value.__enter__.return_value = session

        # Mock node with proper dict behavior
        node_properties = {"id": "entity_1", "type": "test"}
        mock_node = Mock()
        mock_node.id = 1
        mock_node.labels = ["Entity"]
        mock_node.__iter__ = lambda self: iter(node_properties.items())
        mock_node.__getitem__ = lambda self, key: node_properties[key]
        mock_node.keys = lambda: node_properties.keys()
        mock_node.values = lambda: node_properties.values()
        mock_node.items = lambda: node_properties.items()

        session.run.return_value.single.return_value = {"n": mock_node}

        client = HCGClient(neo4j_config)
        entity = client.get_entity_by_id("entity_1")

        assert entity is not None
        assert entity.id == "entity_1"


def test_get_entity_by_id_not_found(
    neo4j_config: Neo4jConfig, mock_driver: Mock
) -> None:
    """Test getting non-existent entity."""
    with patch("apollo.data.hcg_client.GraphDatabase") as mock_gd:
        mock_gd.driver.return_value = mock_driver

        session = Mock()
        mock_driver.session.return_value.__enter__.return_value = session
        session.run.return_value.single.return_value = None

        client = HCGClient(neo4j_config)
        entity = client.get_entity_by_id("nonexistent")

        assert entity is None


def test_health_check_success(neo4j_config: Neo4jConfig, mock_driver: Mock) -> None:
    """Test successful health check."""
    with patch("apollo.data.hcg_client.GraphDatabase") as mock_gd:
        mock_gd.driver.return_value = mock_driver

        session = Mock()
        mock_driver.session.return_value.__enter__.return_value = session
        session.run.return_value.single.return_value = {"1": 1}

        client = HCGClient(neo4j_config)
        assert client.health_check() is True


def test_health_check_failure(neo4j_config: Neo4jConfig) -> None:
    """Test failed health check."""
    with patch("apollo.data.hcg_client.GraphDatabase") as mock_gd:
        mock_gd.driver.side_effect = Exception("Connection failed")

        client = HCGClient(neo4j_config)
        assert client.health_check() is False


def test_entity_model() -> None:
    """Test Entity model."""
    entity = Entity(
        id="test_1",
        type="goal",
        properties={"name": "Test Goal"},
        labels=["Goal"],
    )
    assert entity.id == "test_1"
    assert entity.type == "goal"
    assert entity.properties["name"] == "Test Goal"
    assert "Goal" in entity.labels


def test_state_model() -> None:
    """Test State model."""
    state = State(
        id="state_1",
        description="Test state",
        variables={"x": 1, "y": 2},
        timestamp=datetime.now(),
    )
    assert state.id == "state_1"
    assert state.description == "Test state"
    assert state.variables["x"] == 1


def test_process_model() -> None:
    """Test Process model."""
    process = Process(
        id="process_1",
        name="Test Process",
        status="completed",
        created_at=datetime.now(),
    )
    assert process.id == "process_1"
    assert process.name == "Test Process"
    assert process.status == "completed"


def test_causal_edge_model() -> None:
    """Test CausalEdge model."""
    edge = CausalEdge(
        id="edge_1",
        source_id="entity_1",
        target_id="entity_2",
        edge_type="causes",
        weight=1.0,
        created_at=datetime.now(),
    )
    assert edge.id == "edge_1"
    assert edge.source_id == "entity_1"
    assert edge.target_id == "entity_2"
    assert edge.edge_type == "causes"
