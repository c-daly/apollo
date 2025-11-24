"""Tests for PersonaDiaryStore Neo4j backend."""

from datetime import datetime
from unittest.mock import Mock, MagicMock, patch

import pytest
from neo4j.graph import Node

from apollo.config.settings import Neo4jConfig
from apollo.data.models import PersonaEntry
from apollo.data.persona_store import PersonaDiaryStore


@pytest.fixture
def neo4j_config():
    """Neo4j configuration fixture."""
    return Neo4jConfig(
        uri="bolt://localhost:7687",
        user="neo4j",
        password="test_password",
    )


@pytest.fixture
def sample_entry():
    """Sample PersonaEntry for testing."""
    return PersonaEntry(
        id="entry-123",
        timestamp=datetime(2024, 1, 15, 10, 30, 0),
        entry_type="thought",
        content="This is a test thought",
        summary="Test summary",
        sentiment="positive",
        confidence=0.85,
        related_process_ids=["proc-1", "proc-2"],
        related_goal_ids=["goal-1"],
        emotion_tags=["curious", "focused"],
        metadata={"source": "test", "version": "1.0"},
    )


@pytest.fixture
def mock_neo4j_node():
    """Mock Neo4j Node object."""
    node = Mock(spec=Node)
    node_data = {
        "id": "entry-123",
        "timestamp": datetime(2024, 1, 15, 10, 30, 0),
        "entry_type": "thought",
        "content": "This is a test thought",
        "summary": "Test summary",
        "sentiment": "positive",
        "confidence": 0.85,
        "related_process_ids": ["proc-1", "proc-2"],
        "related_goal_ids": ["goal-1"],
        "emotion_tags": ["curious", "focused"],
        "metadata": '{"source": "test", "version": "1.0"}',
    }
    node.__iter__ = lambda self: iter(node_data.items())
    node.keys = lambda: node_data.keys()
    node.__getitem__ = lambda self, key: node_data[key]
    node.get = lambda key, default=None: node_data.get(key, default)
    return node


class TestPersonaDiaryStoreLifecycle:
    """Test store lifecycle methods."""

    def test_initialization(self, neo4j_config):
        """Test store initializes with config."""
        store = PersonaDiaryStore(neo4j_config)

        assert store.config == neo4j_config
        assert store._driver is None

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_connect(self, mock_graph_db, neo4j_config):
        """Test connect establishes Neo4j driver."""
        mock_driver = Mock()
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()

        mock_graph_db.driver.assert_called_once_with(
            neo4j_config.uri,
            auth=(neo4j_config.user, neo4j_config.password),
        )
        assert store._driver == mock_driver

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_connect_only_once(self, mock_graph_db, neo4j_config):
        """Test connect doesn't reconnect if already connected."""
        mock_driver = Mock()
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()
        store.connect()  # Second call

        # Should only call driver() once
        mock_graph_db.driver.assert_called_once()

    def test_close(self, neo4j_config):
        """Test close closes driver."""
        store = PersonaDiaryStore(neo4j_config)
        mock_driver = Mock()
        store._driver = mock_driver

        store.close()

        mock_driver.close.assert_called_once()
        assert store._driver is None

    def test_close_when_not_connected(self, neo4j_config):
        """Test close does nothing when not connected."""
        store = PersonaDiaryStore(neo4j_config)

        # Should not raise exception
        store.close()
        assert store._driver is None

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_context_manager(self, mock_graph_db, neo4j_config):
        """Test context manager connects and closes."""
        mock_driver = Mock()
        mock_graph_db.driver.return_value = mock_driver

        with PersonaDiaryStore(neo4j_config) as store:
            assert store._driver == mock_driver

        mock_driver.close.assert_called_once()


class TestPersonaDiaryStoreCreateEntry:
    """Test creating persona entries."""

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_create_entry_success(
        self, mock_graph_db, neo4j_config, sample_entry, mock_neo4j_node
    ):
        """Test creating a new persona entry."""
        mock_driver = Mock()
        mock_session = MagicMock()
        mock_result = Mock()
        mock_result.single.return_value = {"entry": mock_neo4j_node}
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value = MagicMock(
            __enter__=Mock(return_value=mock_session), __exit__=Mock(return_value=None)
        )
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()

        result = store.create_entry(sample_entry)

        # Verify query was executed
        mock_session.run.assert_called_once()
        call_args = mock_session.run.call_args
        assert "CREATE (entry:PersonaEntry" in call_args[0][0]

        # Verify parameters
        params = call_args[1]
        assert params["id"] == sample_entry.id
        assert params["entry_type"] == sample_entry.entry_type
        assert params["content"] == sample_entry.content

        # Verify result
        assert result.id == "entry-123"
        assert result.entry_type == "thought"

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_create_entry_auto_connects(
        self, mock_graph_db, neo4j_config, sample_entry, mock_neo4j_node
    ):
        """Test create_entry auto-connects if not connected."""
        mock_driver = Mock()
        mock_session = MagicMock()
        mock_result = Mock()
        mock_result.single.return_value = {"entry": mock_neo4j_node}
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value = MagicMock(
            __enter__=Mock(return_value=mock_session), __exit__=Mock(return_value=None)
        )
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        # Don't call connect()

        store.create_entry(sample_entry)

        # Should have auto-connected
        assert store._driver is not None

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_create_entry_failure(self, mock_graph_db, neo4j_config, sample_entry):
        """Test create_entry raises when query fails."""
        mock_driver = Mock()
        mock_session = MagicMock()
        mock_result = Mock()
        mock_result.single.return_value = None  # No record returned
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value = MagicMock(
            __enter__=Mock(return_value=mock_session), __exit__=Mock(return_value=None)
        )
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()

        with pytest.raises(RuntimeError, match="Failed to persist persona entry"):
            store.create_entry(sample_entry)


class TestPersonaDiaryStoreListEntries:
    """Test listing and filtering persona entries."""

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_list_entries_no_filters(
        self, mock_graph_db, neo4j_config, mock_neo4j_node
    ):
        """Test listing all entries without filters."""
        mock_driver = Mock()
        mock_session = MagicMock()
        mock_result = [{"entry": mock_neo4j_node}]
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value = MagicMock(
            __enter__=Mock(return_value=mock_session), __exit__=Mock(return_value=None)
        )
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()

        results = store.list_entries()

        assert len(results) == 1
        assert results[0].id == "entry-123"

        # Verify query parameters
        call_args = mock_session.run.call_args
        assert call_args[1]["entry_type"] is None
        assert call_args[1]["sentiment"] is None
        assert call_args[1]["limit"] == 100
        assert call_args[1]["offset"] == 0

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_list_entries_with_type_filter(
        self, mock_graph_db, neo4j_config, mock_neo4j_node
    ):
        """Test listing entries filtered by type."""
        mock_driver = Mock()
        mock_session = MagicMock()
        mock_result = [{"entry": mock_neo4j_node}]
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value = MagicMock(
            __enter__=Mock(return_value=mock_session), __exit__=Mock(return_value=None)
        )
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()

        _results = store.list_entries(entry_type="thought")

        call_args = mock_session.run.call_args
        assert call_args[1]["entry_type"] == "thought"

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_list_entries_with_sentiment_filter(
        self, mock_graph_db, neo4j_config, mock_neo4j_node
    ):
        """Test listing entries filtered by sentiment."""
        mock_driver = Mock()
        mock_session = MagicMock()
        mock_result = [{"entry": mock_neo4j_node}]
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value = MagicMock(
            __enter__=Mock(return_value=mock_session), __exit__=Mock(return_value=None)
        )
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()

        _results = store.list_entries(sentiment="positive")

        call_args = mock_session.run.call_args
        assert call_args[1]["sentiment"] == "positive"

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_list_entries_with_pagination(
        self, mock_graph_db, neo4j_config, mock_neo4j_node
    ):
        """Test listing entries with pagination."""
        mock_driver = Mock()
        mock_session = MagicMock()
        mock_result = [{"entry": mock_neo4j_node}]
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value = MagicMock(
            __enter__=Mock(return_value=mock_session), __exit__=Mock(return_value=None)
        )
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()

        _results = store.list_entries(limit=10, offset=5)

        call_args = mock_session.run.call_args
        assert call_args[1]["limit"] == 10
        assert call_args[1]["offset"] == 5

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_list_entries_with_related_ids(
        self, mock_graph_db, neo4j_config, mock_neo4j_node
    ):
        """Test listing entries filtered by related process/goal IDs."""
        mock_driver = Mock()
        mock_session = MagicMock()
        mock_result = [{"entry": mock_neo4j_node}]
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value = MagicMock(
            __enter__=Mock(return_value=mock_session), __exit__=Mock(return_value=None)
        )
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()

        _results = store.list_entries(
            related_process_id="proc-1", related_goal_id="goal-1"
        )

        call_args = mock_session.run.call_args
        assert call_args[1]["related_process_id"] == "proc-1"
        assert call_args[1]["related_goal_id"] == "goal-1"


class TestPersonaDiaryStoreGetEntry:
    """Test getting individual persona entries."""

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_get_entry_found(self, mock_graph_db, neo4j_config, mock_neo4j_node):
        """Test getting an existing entry by ID."""
        mock_driver = Mock()
        mock_session = MagicMock()
        mock_result = Mock()
        mock_result.single.return_value = {"entry": mock_neo4j_node}
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value = MagicMock(
            __enter__=Mock(return_value=mock_session), __exit__=Mock(return_value=None)
        )
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()

        result = store.get_entry("entry-123")

        assert result is not None
        assert result.id == "entry-123"

        call_args = mock_session.run.call_args
        assert call_args[1]["entry_id"] == "entry-123"

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_get_entry_not_found(self, mock_graph_db, neo4j_config):
        """Test getting a non-existent entry returns None."""
        mock_driver = Mock()
        mock_session = MagicMock()
        mock_result = Mock()
        mock_result.single.return_value = None
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value = MagicMock(
            __enter__=Mock(return_value=mock_session), __exit__=Mock(return_value=None)
        )
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()

        result = store.get_entry("nonexistent")

        assert result is None


class TestPersonaDiaryStoreHelpers:
    """Test helper methods."""

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_latest_entry_timestamp(self, mock_graph_db, neo4j_config):
        """Test getting latest entry timestamp."""
        mock_driver = Mock()
        mock_session = MagicMock()
        mock_result = Mock()
        test_timestamp = datetime(2024, 1, 15, 12, 0, 0)
        mock_result.single.return_value = {"ts": test_timestamp}
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value = MagicMock(
            __enter__=Mock(return_value=mock_session), __exit__=Mock(return_value=None)
        )
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()

        result = store.latest_entry_timestamp()

        assert result == test_timestamp

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_latest_entry_timestamp_no_entries(self, mock_graph_db, neo4j_config):
        """Test getting latest timestamp when no entries exist."""
        mock_driver = Mock()
        mock_session = MagicMock()
        mock_result = Mock()
        mock_result.single.return_value = None
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value = MagicMock(
            __enter__=Mock(return_value=mock_session), __exit__=Mock(return_value=None)
        )
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()

        result = store.latest_entry_timestamp()

        assert result is None

    @patch("apollo.data.persona_store.GraphDatabase")
    def test_recent_entries(self, mock_graph_db, neo4j_config, mock_neo4j_node):
        """Test getting recent entries."""
        mock_driver = Mock()
        mock_session = MagicMock()
        mock_result = [{"entry": mock_neo4j_node}]
        mock_session.run.return_value = mock_result
        mock_driver.session.return_value = MagicMock(
            __enter__=Mock(return_value=mock_session), __exit__=Mock(return_value=None)
        )
        mock_graph_db.driver.return_value = mock_driver

        store = PersonaDiaryStore(neo4j_config)
        store.connect()

        results = store.recent_entries(limit=3)

        assert len(results) == 1
        call_args = mock_session.run.call_args
        assert call_args[1]["limit"] == 3
        assert call_args[1]["offset"] == 0


class TestPersonaDiaryStoreParseNode:
    """Test Neo4j node parsing."""

    def test_parse_node_valid(self, neo4j_config, mock_neo4j_node):
        """Test parsing a valid Neo4j node."""
        store = PersonaDiaryStore(neo4j_config)

        result = store._parse_node(mock_neo4j_node)

        assert result.id == "entry-123"
        assert result.entry_type == "thought"
        assert result.content == "This is a test thought"
        assert result.summary == "Test summary"
        assert result.sentiment == "positive"
        assert result.confidence == 0.85
        assert result.related_process_ids == ["proc-1", "proc-2"]
        assert result.related_goal_ids == ["goal-1"]
        assert result.emotion_tags == ["curious", "focused"]
        assert result.metadata["source"] == "test"

    def test_parse_node_missing_id(self, neo4j_config):
        """Test parsing node without ID raises error."""
        node = Mock(spec=Node)
        node_data = {
            "timestamp": datetime.now(),
            "entry_type": "thought",
            "content": "Test",
        }
        node.__iter__ = lambda self: iter(node_data.items())
        node.keys = lambda: node_data.keys()
        node.__getitem__ = lambda self, key: node_data[key]
        node.get = lambda key, default=None: node_data.get(key, default)

        store = PersonaDiaryStore(neo4j_config)

        with pytest.raises(ValueError, match="missing string 'id'"):
            store._parse_node(node)

    def test_parse_node_missing_timestamp(self, neo4j_config):
        """Test parsing node without timestamp raises error."""
        node = Mock(spec=Node)
        node_data = {"id": "entry-123", "entry_type": "thought", "content": "Test"}
        node.__iter__ = lambda self: iter(node_data.items())
        node.keys = lambda: node_data.keys()
        node.__getitem__ = lambda self, key: node_data[key]
        node.get = lambda key, default=None: node_data.get(key, default)

        store = PersonaDiaryStore(neo4j_config)

        with pytest.raises(ValueError, match="missing 'timestamp'"):
            store._parse_node(node)

    def test_parse_node_missing_entry_type(self, neo4j_config):
        """Test parsing node without entry_type raises error."""
        node = Mock(spec=Node)
        node_data = {"id": "entry-123", "timestamp": datetime.now(), "content": "Test"}
        node.__iter__ = lambda self: iter(node_data.items())
        node.keys = lambda: node_data.keys()
        node.__getitem__ = lambda self, key: node_data[key]
        node.get = lambda key, default=None: node_data.get(key, default)
        node.get = lambda key, default=None: node_data.get(key, default)

        store = PersonaDiaryStore(neo4j_config)

        with pytest.raises(ValueError, match="missing string 'entry_type'"):
            store._parse_node(node)

    def test_parse_node_missing_content(self, neo4j_config):
        """Test parsing node without content raises error."""
        node = Mock(spec=Node)
        node_data = {
            "id": "entry-123",
            "timestamp": datetime.now(),
            "entry_type": "thought",
        }
        node.__iter__ = lambda self: iter(node_data.items())
        node.keys = lambda: node_data.keys()
        node.__getitem__ = lambda self, key: node_data[key]
        node.get = lambda key, default=None: node_data.get(key, default)

        store = PersonaDiaryStore(neo4j_config)

        with pytest.raises(ValueError, match="missing string 'content'"):
            store._parse_node(node)

    def test_parse_node_timestamp_string(self, neo4j_config):
        """Test parsing node with timestamp as ISO string."""
        node = Mock(spec=Node)
        node_data = {
            "id": "entry-123",
            "timestamp": "2024-01-15T10:30:00",
            "entry_type": "thought",
            "content": "Test",
        }
        node.__iter__ = lambda self: iter(node_data.items())
        node.keys = lambda: node_data.keys()
        node.__getitem__ = lambda self, key: node_data[key]
        node.get = lambda key, default=None: node_data.get(key, default)

        store = PersonaDiaryStore(neo4j_config)
        result = store._parse_node(node)

        assert isinstance(result.timestamp, datetime)
        assert result.timestamp.year == 2024

    def test_parse_node_metadata_dict(self, neo4j_config):
        """Test parsing node with metadata as dict."""
        node = Mock(spec=Node)
        node_data = {
            "id": "entry-123",
            "timestamp": datetime.now(),
            "entry_type": "thought",
            "content": "Test",
            "metadata": {"key": "value"},
        }
        node.__iter__ = lambda self: iter(node_data.items())
        node.keys = lambda: node_data.keys()
        node.__getitem__ = lambda self, key: node_data[key]
        node.get = lambda key, default=None: node_data.get(key, default)

        store = PersonaDiaryStore(neo4j_config)
        result = store._parse_node(node)

        assert result.metadata == {"key": "value"}

    def test_parse_node_empty_lists(self, neo4j_config):
        """Test parsing node with missing list fields defaults to empty lists."""
        node = Mock(spec=Node)
        node_data = {
            "id": "entry-123",
            "timestamp": datetime.now(),
            "entry_type": "thought",
            "content": "Test",
        }
        node.__iter__ = lambda self: iter(node_data.items())
        node.keys = lambda: node_data.keys()
        node.__getitem__ = lambda self, key: node_data[key]
        node.get = lambda key, default=None: node_data.get(key, default)

        store = PersonaDiaryStore(neo4j_config)
        result = store._parse_node(node)

        assert result.related_process_ids == []
        assert result.related_goal_ids == []
        assert result.emotion_tags == []
