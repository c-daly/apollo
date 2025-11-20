"""WebSocket server for real-time HCG updates."""

import asyncio
import json
from datetime import datetime
from typing import Any, Dict, Optional, Set

import websockets
from websockets.server import WebSocketServerProtocol

from apollo.config.settings import Neo4jConfig
from apollo.data.hcg_client import HCGClient


class HCGWebSocketServer:
    """WebSocket server for streaming HCG updates to clients.
    
    Provides real-time updates when the HCG graph changes, allowing
    React components to update visualizations without polling.
    """

    def __init__(
        self,
        neo4j_config: Neo4jConfig,
        host: str = "localhost",
        port: int = 8765,
        poll_interval: float = 1.0,
    ) -> None:
        """Initialize WebSocket server.

        Args:
            neo4j_config: Neo4j configuration for HCG client
            host: Host to bind WebSocket server
            port: Port to bind WebSocket server
            poll_interval: How often to check for updates (seconds)
        """
        self.neo4j_config = neo4j_config
        self.host = host
        self.port = port
        self.poll_interval = poll_interval
        self.clients: Set[WebSocketServerProtocol] = set()
        self._last_update: Optional[datetime] = None
        self._running = False

    async def register(self, websocket: WebSocketServerProtocol) -> None:
        """Register a new client connection.

        Args:
            websocket: WebSocket client connection
        """
        self.clients.add(websocket)
        # Send initial state
        await self.send_snapshot(websocket)

    async def unregister(self, websocket: WebSocketServerProtocol) -> None:
        """Unregister a client connection.

        Args:
            websocket: WebSocket client connection
        """
        self.clients.discard(websocket)

    async def send_snapshot(self, websocket: WebSocketServerProtocol) -> None:
        """Send current HCG snapshot to a client.

        Args:
            websocket: WebSocket client connection
        """
        try:
            with HCGClient(self.neo4j_config) as client:
                snapshot = client.get_graph_snapshot(limit=200)
                message = {
                    "type": "snapshot",
                    "timestamp": snapshot.timestamp.isoformat(),
                    "data": {
                        "entities": [e.model_dump() for e in snapshot.entities],
                        "edges": [e.model_dump() for e in snapshot.edges],
                        "metadata": snapshot.metadata,
                    },
                }
                await websocket.send(json.dumps(message, default=str))
        except Exception as e:
            error_msg = {
                "type": "error",
                "message": f"Failed to fetch snapshot: {str(e)}",
            }
            await websocket.send(json.dumps(error_msg))

    async def broadcast_update(self, update: Dict[str, Any]) -> None:
        """Broadcast an update to all connected clients.

        Args:
            update: Update message to broadcast
        """
        if self.clients:
            message = json.dumps(update, default=str)
            await asyncio.gather(
                *[client.send(message) for client in self.clients],
                return_exceptions=True,
            )

    async def check_for_updates(self) -> None:
        """Check for updates in HCG and broadcast to clients."""
        try:
            with HCGClient(self.neo4j_config) as client:
                # Get recent state changes
                history = client.get_state_history(limit=10)
                
                if history:
                    latest_timestamp = max(h.timestamp for h in history)
                    
                    # If we have new updates, broadcast them
                    if (
                        self._last_update is None
                        or latest_timestamp > self._last_update
                    ):
                        self._last_update = latest_timestamp
                        
                        update = {
                            "type": "update",
                            "timestamp": latest_timestamp.isoformat(),
                            "data": {
                                "history": [h.model_dump() for h in history],
                            },
                        }
                        await self.broadcast_update(update)
        except Exception as e:
            error_msg = {
                "type": "error",
                "message": f"Failed to check for updates: {str(e)}",
            }
            await self.broadcast_update(error_msg)

    async def poll_loop(self) -> None:
        """Main polling loop to check for updates."""
        while self._running:
            await self.check_for_updates()
            await asyncio.sleep(self.poll_interval)

    async def handle_client(self, websocket: WebSocketServerProtocol) -> None:
        """Handle a client connection.

        Args:
            websocket: WebSocket client connection
        """
        await self.register(websocket)
        try:
            async for message in websocket:
                # Handle incoming messages from client
                try:
                    data = json.loads(message)
                    message_type = data.get("type")
                    
                    if message_type == "subscribe":
                        # Client wants to subscribe to updates
                        await self.send_snapshot(websocket)
                    elif message_type == "refresh":
                        # Client requests a fresh snapshot
                        await self.send_snapshot(websocket)
                    elif message_type == "ping":
                        # Respond to ping
                        await websocket.send(
                            json.dumps({"type": "pong", "timestamp": datetime.now().isoformat()})
                        )
                except json.JSONDecodeError:
                    error_msg = {
                        "type": "error",
                        "message": "Invalid JSON message",
                    }
                    await websocket.send(json.dumps(error_msg))
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            await self.unregister(websocket)

    async def start(self) -> None:
        """Start the WebSocket server."""
        self._running = True
        
        # Start polling loop
        poll_task = asyncio.create_task(self.poll_loop())
        
        try:
            async with websockets.serve(self.handle_client, self.host, self.port):
                print(f"HCG WebSocket server running on ws://{self.host}:{self.port}")
                await asyncio.Future()  # Run forever
        finally:
            self._running = False
            poll_task.cancel()
            try:
                await poll_task
            except asyncio.CancelledError:
                pass

    def run(self) -> None:
        """Run the WebSocket server (blocking)."""
        asyncio.run(self.start())


def start_websocket_server(
    neo4j_config: Neo4jConfig,
    host: str = "localhost",
    port: int = 8765,
) -> None:
    """Start HCG WebSocket server.

    Args:
        neo4j_config: Neo4j configuration
        host: Host to bind server
        port: Port to bind server
    """
    server = HCGWebSocketServer(neo4j_config, host, port)
    server.run()
