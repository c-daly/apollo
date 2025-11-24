"""Tests for WebSocket streaming functionality."""

import json
from datetime import datetime
from unittest.mock import AsyncMock, Mock, patch

import pytest
import websockets

from apollo.config.settings import Neo4jConfig
from apollo.data.models import CausalEdge, Entity, GraphSnapshot, State
from apollo.data.websocket_server import HCGWebSocketServer


@pytest.fixture
def neo4j_config():
    """Neo4j configuration fixture."""
    return Neo4jConfig(
        uri="bolt://localhost:7687",
        username="neo4j",
        password="test_password",
        database="neo4j",
    )


@pytest.fixture
def sample_entities():
    """Sample entities for testing."""
    return [
        Entity(
            id="entity-1",
            type="PERSON",
            properties={"name": "Alice", "age": 30},
            labels=["Person", "Entity"],
        ),
        Entity(
            id="entity-2",
            type="LOCATION",
            properties={"name": "Office"},
            labels=["Location", "Entity"],
        ),
    ]


@pytest.fixture
def sample_edges():
    """Sample edges for testing."""
    return [
        CausalEdge(
            id="edge-1",
            source_id="entity-1",
            target_id="entity-2",
            edge_type="LOCATED_AT",
            properties={},
            weight=1.0,
            created_at=datetime.now(),
        )
    ]


@pytest.fixture
def sample_snapshot(sample_entities, sample_edges):
    """Sample graph snapshot for testing."""
    return GraphSnapshot(
        timestamp=datetime.now(),
        entities=sample_entities,
        edges=sample_edges,
        metadata={"total_entities": 2, "total_edges": 1},
    )


class TestHCGWebSocketServer:
    """Test HCGWebSocketServer class."""

    def test_server_initialization(self, neo4j_config):
        """Test WebSocket server initializes with correct config."""
        server = HCGWebSocketServer(
            neo4j_config=neo4j_config,
            host="0.0.0.0",
            port=9999,
            poll_interval=2.0,
        )

        assert server.neo4j_config == neo4j_config
        assert server.host == "0.0.0.0"
        assert server.port == 9999
        assert server.poll_interval == 2.0
        assert len(server.clients) == 0
        assert server._last_update is None
        assert server._running is False

    @pytest.mark.asyncio
    async def test_register_client(self, neo4j_config, sample_snapshot):
        """Test registering a WebSocket client."""
        server = HCGWebSocketServer(neo4j_config)

        mock_websocket = AsyncMock()
        mock_websocket.send = AsyncMock()

        # Mock HCGClient to return snapshot
        with patch("apollo.data.websocket_server.HCGClient") as mock_hcg:
            mock_client_instance = Mock()
            mock_client_instance.get_graph_snapshot.return_value = sample_snapshot
            mock_hcg.return_value.__enter__.return_value = mock_client_instance

            await server.register(mock_websocket)

        assert mock_websocket in server.clients
        # Should have sent initial snapshot
        mock_websocket.send.assert_called_once()
        sent_message = json.loads(mock_websocket.send.call_args[0][0])
        assert sent_message["type"] == "snapshot"
        assert "data" in sent_message
        assert "entities" in sent_message["data"]

    @pytest.mark.asyncio
    async def test_unregister_client(self, neo4j_config):
        """Test unregistering a WebSocket client."""
        server = HCGWebSocketServer(neo4j_config)

        mock_websocket = Mock()
        server.clients.add(mock_websocket)

        await server.unregister(mock_websocket)

        assert mock_websocket not in server.clients

    @pytest.mark.asyncio
    async def test_send_snapshot(self, neo4j_config, sample_snapshot):
        """Test sending snapshot to a client."""
        server = HCGWebSocketServer(neo4j_config)
        mock_websocket = AsyncMock()

        with patch("apollo.data.websocket_server.HCGClient") as mock_hcg:
            mock_client_instance = Mock()
            mock_client_instance.get_graph_snapshot.return_value = sample_snapshot
            mock_hcg.return_value.__enter__.return_value = mock_client_instance

            await server.send_snapshot(mock_websocket)

        mock_websocket.send.assert_called_once()
        sent_message = json.loads(mock_websocket.send.call_args[0][0])

        assert sent_message["type"] == "snapshot"
        assert sent_message["data"]["metadata"]["total_entities"] == 2
        assert len(sent_message["data"]["entities"]) == 2
        assert len(sent_message["data"]["edges"]) == 1

    @pytest.mark.asyncio
    async def test_send_snapshot_error_handling(self, neo4j_config):
        """Test error handling when sending snapshot fails."""
        server = HCGWebSocketServer(neo4j_config)
        mock_websocket = AsyncMock()

        with patch("apollo.data.websocket_server.HCGClient") as mock_hcg:
            mock_hcg.return_value.__enter__.side_effect = Exception(
                "Neo4j connection failed"
            )

            await server.send_snapshot(mock_websocket)

        mock_websocket.send.assert_called_once()
        sent_message = json.loads(mock_websocket.send.call_args[0][0])

        assert sent_message["type"] == "error"
        assert "Neo4j connection failed" in sent_message["message"]

    @pytest.mark.asyncio
    async def test_broadcast_update(self, neo4j_config):
        """Test broadcasting updates to multiple clients."""
        server = HCGWebSocketServer(neo4j_config)

        # Add multiple mock clients
        clients = [AsyncMock() for _ in range(3)]
        for client in clients:
            server.clients.add(client)

        update = {
            "type": "update",
            "timestamp": datetime.now().isoformat(),
            "data": {"test": "value"},
        }

        await server.broadcast_update(update)

        # All clients should receive the update
        for client in clients:
            client.send.assert_called_once()
            sent_message = json.loads(client.send.call_args[0][0])
            assert sent_message["type"] == "update"
            assert sent_message["data"]["test"] == "value"

    @pytest.mark.asyncio
    async def test_broadcast_to_no_clients(self, neo4j_config):
        """Test broadcasting when no clients are connected."""
        server = HCGWebSocketServer(neo4j_config)

        update = {"type": "update", "data": {}}

        # Should not raise error
        await server.broadcast_update(update)

    @pytest.mark.asyncio
    async def test_check_for_updates(self, neo4j_config):
        """Test checking for updates from HCG."""
        server = HCGWebSocketServer(neo4j_config)

        # Add a mock client
        mock_websocket = AsyncMock()
        server.clients.add(mock_websocket)

        # Mock state history
        mock_history = [
            State(
                id="state-1",
                description="Active state",
                timestamp=datetime.now(),
                variables={"status": "active"},
                properties={},
            )
        ]

        with patch("apollo.data.websocket_server.HCGClient") as mock_hcg:
            mock_client_instance = Mock()
            mock_client_instance.get_state_history.return_value = mock_history
            mock_hcg.return_value.__enter__.return_value = mock_client_instance

            await server.check_for_updates()

        # Client should receive update broadcast
        mock_websocket.send.assert_called_once()
        sent_message = json.loads(mock_websocket.send.call_args[0][0])
        assert sent_message["type"] == "update"
        assert "history" in sent_message["data"]

    @pytest.mark.asyncio
    async def test_handle_client_ping(self, neo4j_config, sample_snapshot):
        """Test handling ping message from client."""
        server = HCGWebSocketServer(neo4j_config)

        mock_websocket = AsyncMock()
        # Mock async iteration
        ping_message = json.dumps({"type": "ping"})
        mock_websocket.__aiter__.return_value = iter([ping_message])

        with patch("apollo.data.websocket_server.HCGClient") as mock_hcg:
            mock_client_instance = Mock()
            mock_client_instance.get_graph_snapshot.return_value = sample_snapshot
            mock_hcg.return_value.__enter__.return_value = mock_client_instance

            await server.handle_client(mock_websocket)

        # Should have sent initial snapshot + pong response
        assert mock_websocket.send.call_count == 2
        pong_message = json.loads(mock_websocket.send.call_args_list[1][0][0])
        assert pong_message["type"] == "pong"
        assert "timestamp" in pong_message

    @pytest.mark.asyncio
    async def test_handle_client_subscribe(self, neo4j_config, sample_snapshot):
        """Test handling subscribe message from client."""
        server = HCGWebSocketServer(neo4j_config)

        mock_websocket = AsyncMock()
        subscribe_message = json.dumps({"type": "subscribe"})
        mock_websocket.__aiter__.return_value = iter([subscribe_message])

        with patch("apollo.data.websocket_server.HCGClient") as mock_hcg:
            mock_client_instance = Mock()
            mock_client_instance.get_graph_snapshot.return_value = sample_snapshot
            mock_hcg.return_value.__enter__.return_value = mock_client_instance

            await server.handle_client(mock_websocket)

        # Should send snapshot twice: initial register + subscribe request
        assert mock_websocket.send.call_count == 2

    @pytest.mark.asyncio
    async def test_handle_client_invalid_json(self, neo4j_config, sample_snapshot):
        """Test handling invalid JSON from client."""
        server = HCGWebSocketServer(neo4j_config)

        mock_websocket = AsyncMock()
        invalid_message = "not valid json {"
        mock_websocket.__aiter__.return_value = iter([invalid_message])

        with patch("apollo.data.websocket_server.HCGClient") as mock_hcg:
            mock_client_instance = Mock()
            mock_client_instance.get_graph_snapshot.return_value = sample_snapshot
            mock_hcg.return_value.__enter__.return_value = mock_client_instance

            await server.handle_client(mock_websocket)

        # Should send snapshot + error message
        assert mock_websocket.send.call_count == 2
        error_message = json.loads(mock_websocket.send.call_args_list[1][0][0])
        assert error_message["type"] == "error"
        assert "Invalid JSON" in error_message["message"]

    @pytest.mark.asyncio
    async def test_handle_client_connection_closed(self, neo4j_config, sample_snapshot):
        """Test handling connection close gracefully."""
        server = HCGWebSocketServer(neo4j_config)

        mock_websocket = AsyncMock()
        # Simulate connection closed during iteration
        messages = [json.dumps({"type": "ping"})]

        # Create a proper async iterator that raises ConnectionClosed
        class ClosingIterator:
            def __init__(self, messages):
                self.messages = iter(messages)
                self.first = True

            def __aiter__(self):
                return self

            async def __anext__(self):
                if self.first:
                    self.first = False
                    return next(self.messages)
                raise websockets.exceptions.ConnectionClosed(None, None)

        mock_websocket.__aiter__ = lambda self: ClosingIterator(messages)

        with patch("apollo.data.websocket_server.HCGClient") as mock_hcg:
            mock_client_instance = Mock()
            mock_client_instance.get_graph_snapshot.return_value = sample_snapshot
            mock_hcg.return_value.__enter__.return_value = mock_client_instance

            # Should not raise exception
            await server.handle_client(mock_websocket)

        # Client should be unregistered
        assert mock_websocket not in server.clients
