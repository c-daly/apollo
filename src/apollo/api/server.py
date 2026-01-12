"""FastAPI server for Apollo HCG data access.

This server provides REST API endpoints to query Neo4j HCG data,
stream telemetry, and serve real-time diagnostics.
"""

import asyncio
import contextlib
import json
import os
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import time
import httpx
from typing import (
    Any,
    AsyncGenerator,
    AsyncIterator,
    Deque,
    Dict,
    List,
    Optional,
    Union,
)
from uuid import uuid4

from fastapi import (
    FastAPI,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    UploadFile,
    File,
    Form,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from apollo.client.hermes_client import HermesClient
from apollo.config.settings import ApolloConfig
from apollo.data.hcg_client import HCGClient, validate_entity_id
from apollo.data.persona_store import PersonaDiaryStore
from apollo.data.models import (
    Entity,
    State,
    Process,
    CausalEdge,
    PlanHistory,
    StateHistory,
    GraphSnapshot,
    PersonaEntry,
)
from logos_hermes_sdk.models.llm_message import LLMMessage
from logos_hermes_sdk.models.llm_request import LLMRequest


# Global HCG client instance
hcg_client: Optional[HCGClient] = None
persona_store: Optional[PersonaDiaryStore] = None
hermes_client: Optional[HermesClient] = None

diagnostics_task: Optional[asyncio.Task] = None


class DiagnosticLogEntry(BaseModel):
    id: str
    timestamp: datetime
    level: str
    message: str


class TelemetrySnapshot(BaseModel):
    api_latency_ms: float
    request_count: int
    success_rate: float
    active_plans: int
    last_update: datetime
    active_websockets: int = 0
    last_broadcast: Optional[datetime] = None
    llm_latency_ms: Optional[float] = None
    llm_prompt_tokens: Optional[int] = None
    llm_completion_tokens: Optional[int] = None
    llm_total_tokens: Optional[int] = None
    persona_sentiment: Optional[str] = None
    persona_confidence: Optional[float] = None
    last_llm_update: Optional[datetime] = None
    last_llm_session: Optional[str] = None


DiagnosticsPayload = Union[Dict[str, Any], List[Dict[str, Any]], None]


class DiagnosticsEvent(BaseModel):
    type: str
    data: DiagnosticsPayload = None


class WebSocketConnection:
    """Represents a single WebSocket connection with its queue and metadata."""

    def __init__(self, connection_id: str, websocket: WebSocket):
        self.connection_id = connection_id
        self.websocket = websocket
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=100)  # Limit queue size
        self.connected_at = datetime.now(timezone.utc)
        self.last_heartbeat = datetime.now(timezone.utc)
        self.messages_sent = 0
        self.messages_dropped = 0


class DiagnosticsManager:
    """Keeps a rolling buffer of log entries and telemetry snapshots."""

    def __init__(self, max_logs: int = 200):
        self._logs: Deque[DiagnosticLogEntry] = deque(maxlen=max_logs)
        self._telemetry = TelemetrySnapshot(
            api_latency_ms=0.0,
            request_count=0,
            success_rate=100.0,
            active_plans=0,
            last_update=datetime.now(timezone.utc),
            active_websockets=0,
            last_broadcast=None,
        )
        self._connections: Dict[str, WebSocketConnection] = {}
        self._lock = asyncio.Lock()

    def get_logs(self, limit: int = 50) -> List[DiagnosticLogEntry]:
        return list(self._logs)[:limit]

    def get_telemetry(self) -> TelemetrySnapshot:
        return self._telemetry

    async def record_log(self, level: str, message: str) -> None:
        entry = DiagnosticLogEntry(
            id=f"log-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
            timestamp=datetime.now(timezone.utc),
            level=level,
            message=message,
        )
        self._logs.appendleft(entry)
        await self._broadcast(
            DiagnosticsEvent(type="log", data=entry.model_dump(mode="json")).model_dump(
                mode="json"
            )
        )

    async def update_telemetry(
        self,
        *,
        api_latency_ms: float,
        request_increment: int,
        success_rate: float,
        active_plans: int,
    ) -> None:
        self._telemetry = self._telemetry.model_copy(
            update={
                "api_latency_ms": round(api_latency_ms, 2),
                "request_count": self._telemetry.request_count + request_increment,
                "success_rate": round(success_rate, 2),
                "active_plans": active_plans,
                "last_update": datetime.now(timezone.utc),
                "active_websockets": len(self._connections),
            }
        )
        await self._broadcast(
            DiagnosticsEvent(
                type="telemetry", data=self._telemetry.model_dump(mode="json")
            ).model_dump(mode="json")
        )

    async def record_llm_metrics(
        self,
        *,
        latency_ms: float,
        prompt_tokens: Optional[int],
        completion_tokens: Optional[int],
        total_tokens: Optional[int],
        persona_sentiment: Optional[str],
        persona_confidence: Optional[float],
        session_id: Optional[str],
    ) -> None:
        self._telemetry = self._telemetry.model_copy(
            update={
                "llm_latency_ms": round(latency_ms, 2),
                "llm_prompt_tokens": prompt_tokens,
                "llm_completion_tokens": completion_tokens,
                "llm_total_tokens": total_tokens,
                "persona_sentiment": persona_sentiment,
                "persona_confidence": persona_confidence,
                "last_llm_update": datetime.now(timezone.utc),
                "last_llm_session": session_id,
            }
        )
        await self._broadcast(
            DiagnosticsEvent(
                type="telemetry", data=self._telemetry.model_dump(mode="json")
            ).model_dump(mode="json")
        )

    async def broadcast_persona_entry(self, entry: PersonaEntry) -> None:
        """Broadcast a newly created persona entry to subscribers."""
        await self._broadcast(
            DiagnosticsEvent(
                type="persona_entry",
                data=entry.model_dump(mode="json"),
            ).model_dump(mode="json")
        )

    async def broadcast_graph_update(self, update_data: Dict[str, Any]) -> None:
        """Broadcast HCG graph changes to subscribers."""
        await self._broadcast(
            DiagnosticsEvent(
                type="graph_update",
                data=update_data,
            ).model_dump(mode="json")
        )

    async def register(self, websocket: WebSocket) -> WebSocketConnection:
        """Register a new WebSocket connection."""
        connection_id = str(uuid4())
        connection = WebSocketConnection(connection_id, websocket)

        async with self._lock:
            self._connections[connection_id] = connection
            self._telemetry = self._telemetry.model_copy(
                update={"active_websockets": len(self._connections)}
            )

        # Log after releasing the lock to avoid deadlock
        await self.record_log("info", f"WebSocket connected: {connection_id}")
        return connection

    async def unregister(self, connection_id: str) -> None:
        """Unregister and clean up a WebSocket connection."""
        async with self._lock:
            connection = self._connections.pop(connection_id, None)
            self._telemetry = self._telemetry.model_copy(
                update={"active_websockets": len(self._connections)}
            )

        # Log after releasing the lock to avoid deadlock
        if connection:
            await self.record_log(
                "info",
                f"WebSocket disconnected: {connection_id} "
                f"(sent: {connection.messages_sent}, dropped: {connection.messages_dropped})",
            )

    async def _broadcast(self, event: dict) -> None:
        """Broadcast an event to all connected clients with queue management."""
        async with self._lock:
            self._telemetry = self._telemetry.model_copy(
                update={"last_broadcast": datetime.now(timezone.utc)}
            )
            connections = list(self._connections.values())

        for connection in connections:
            try:
                # Non-blocking put with immediate failure if queue is full
                connection.queue.put_nowait(event)
            except asyncio.QueueFull:
                # Drop message for slow clients
                connection.messages_dropped += 1
                # Note: We don't log here to avoid recursive _broadcast calls


diagnostics_manager = DiagnosticsManager()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """FastAPI lifespan context manager."""
    global hcg_client, diagnostics_task, persona_store, hermes_client

    # Startup: Initialize HCG client
    config = ApolloConfig.load()
    if config.hcg and config.hcg.neo4j:
        hcg_client = HCGClient(config.hcg.neo4j)
        hcg_client.connect()
        print("HCG client connected to Neo4j")
        diagnostics_manager._logs.clear()
        await diagnostics_manager.record_log("info", "HCG client connected to Neo4j")

        try:
            persona_store = PersonaDiaryStore(config.hcg.neo4j)
            persona_store.connect()
            await diagnostics_manager.record_log(
                "info", "Persona diary store connected to Neo4j"
            )
        except Exception as exc:  # noqa: BLE001
            persona_store = None
            await diagnostics_manager.record_log(
                "warning",
                f"Persona diary store unavailable, falling back to memory: {exc}",
            )
    if config.hermes:
        try:
            hermes_client = HermesClient(config.hermes)
            await diagnostics_manager.record_log("info", "Hermes client configured")
        except Exception as exc:  # noqa: BLE001
            hermes_client = None
            await diagnostics_manager.record_log(
                "error", f"Hermes client unavailable: {exc}"
            )

    async def telemetry_poller() -> None:
        consecutive_failures = 0

        while True:
            if not hcg_client:
                await asyncio.sleep(5)
                continue

            try:
                start = datetime.now(timezone.utc)
                health = await asyncio.to_thread(hcg_client.health_check)
                latency_ms = (
                    datetime.now(timezone.utc) - start
                ).total_seconds() * 1000.0

                processes = await asyncio.to_thread(
                    hcg_client.get_processes, "running", 10, 0
                )
                active_plans = sum(1 for p in processes if p.status == "running")
                success_rate = 100.0 if health else 92.0

                await diagnostics_manager.update_telemetry(
                    api_latency_ms=latency_ms,
                    request_increment=1,
                    success_rate=success_rate,
                    active_plans=active_plans,
                )

                await diagnostics_manager.record_log(
                    "info",
                    f"HCG health check {'passed' if health else 'degraded'} "
                    f"({latency_ms:.1f} ms)",
                )

                # Reset failure counter on success
                if consecutive_failures > 0:
                    await diagnostics_manager.record_log(
                        "info",
                        f"HCG connection recovered after {consecutive_failures} failures",
                    )
                    consecutive_failures = 0

            except Exception as exc:  # noqa: BLE001
                consecutive_failures += 1
                error_msg = str(exc)

                # Only log errors periodically to avoid spam
                # Log first error, then every 12th failure (once per minute at 5s intervals)
                if consecutive_failures == 1 or consecutive_failures % 12 == 0:
                    await diagnostics_manager.record_log(
                        "error",
                        f"Telemetry poll failed ({consecutive_failures} consecutive): {error_msg}",
                    )

            await asyncio.sleep(5)

    diagnostics_task = asyncio.create_task(telemetry_poller())

    # Initialize shared HTTP client with connection pooling
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(30.0),
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
    ) as http_client:
        app.state.http_client = http_client
        await diagnostics_manager.record_log("info", "HTTP connection pool initialized")

        yield  # Application runs here

        # Shutdown: Close HCG client and persona store
        # NOTE: This cleanup code MUST be inside the async with block
        # so it runs BEFORE the HTTP client is closed
        if diagnostics_task:
            diagnostics_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await diagnostics_task
        if persona_store:
            persona_store.close()
            await diagnostics_manager.record_log(
                "info", "Persona diary store disconnected"
            )
        if hcg_client:
            hcg_client.close()
            print("HCG client disconnected")


app = FastAPI(
    title="Apollo HCG API",
    description="REST API for querying HCG graph data from Neo4j",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS
origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://127.0.0.1:3000",
    "http://0.0.0.0:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    timestamp: str
    neo4j_connected: bool


class LLMTelemetryPayload(BaseModel):
    """Schema for ingesting Hermes LLM telemetry."""

    latency_ms: float = Field(gt=0, description="Round-trip latency in ms")
    prompt_tokens: Optional[int] = Field(
        default=None, ge=0, description="Prompt token count"
    )
    completion_tokens: Optional[int] = Field(
        default=None, ge=0, description="Completion token count"
    )
    total_tokens: Optional[int] = Field(
        default=None, ge=0, description="Total token count"
    )
    persona_sentiment: Optional[str] = Field(
        default=None, description="Persona sentiment label"
    )
    persona_confidence: Optional[float] = Field(
        default=None, ge=0.0, le=1.0, description="Confidence for persona sentiment"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Additional diagnostic metadata"
    )


class ChatMessagePayload(BaseModel):
    """Represents an inbound chat message."""

    role: str
    content: str


class ChatStreamRequest(BaseModel):
    """Request envelope for streaming chat completions."""

    messages: List[ChatMessagePayload]
    metadata: Dict[str, Any] = Field(default_factory=dict)
    provider: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=None, ge=1)


@app.get("/api/hcg/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    neo4j_connected = False
    if hcg_client:
        neo4j_connected = await asyncio.to_thread(hcg_client.health_check)

    return HealthResponse(
        status="healthy" if neo4j_connected else "degraded",
        timestamp=datetime.now(timezone.utc).isoformat(),
        neo4j_connected=neo4j_connected,
    )


@app.get("/api/hcg/entities", response_model=List[Entity])
async def get_entities(
    type: Optional[str] = Query(None, description="Filter by entity type"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of entities"),
    offset: int = Query(0, ge=0, description="Number of entities to skip"),
) -> List[Entity]:
    """Get entities from HCG graph."""
    if not hcg_client:
        raise HTTPException(status_code=503, detail="HCG client not available")

    try:
        entities = await asyncio.to_thread(
            hcg_client.get_entities,
            entity_type=type,
            limit=limit,
            offset=offset,
        )
        return entities
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch entities: {str(e)}"
        )


@app.get("/api/hcg/entities/{entity_id}", response_model=Entity)
async def get_entity(entity_id: str) -> Entity:
    """Get a specific entity by ID."""
    # Validate at API boundary before calling (potentially mocked) client
    try:
        entity_id = validate_entity_id(entity_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not hcg_client:
        raise HTTPException(status_code=503, detail="HCG client not available")

    try:
        entity = await asyncio.to_thread(hcg_client.get_entity_by_id, entity_id)
        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")
        return entity
    except HTTPException:
        raise
    except ValueError as e:
        # Input validation error from validate_entity_id
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch entity: {str(e)}")


@app.get("/api/hcg/states", response_model=List[State])
async def get_states(
    limit: int = Query(100, ge=1, le=500, description="Maximum number of states"),
    offset: int = Query(0, ge=0, description="Number of states to skip"),
) -> List[State]:
    """Get state entities from HCG graph."""
    if not hcg_client:
        raise HTTPException(status_code=503, detail="HCG client not available")

    try:
        states = await asyncio.to_thread(
            hcg_client.get_states, limit=limit, offset=offset
        )
        return states
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch states: {str(e)}")


@app.get("/api/hcg/processes", response_model=List[Process])
async def get_processes(
    status: Optional[str] = Query(None, description="Filter by process status"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of processes"),
    offset: int = Query(0, ge=0, description="Number of processes to skip"),
) -> List[Process]:
    """Get process entities from HCG graph."""
    if not hcg_client:
        raise HTTPException(status_code=503, detail="HCG client not available")

    try:
        processes = await asyncio.to_thread(
            hcg_client.get_processes,
            status=status,
            limit=limit,
            offset=offset,
        )
        return processes
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch processes: {str(e)}"
        )


@app.get("/api/hcg/edges", response_model=List[CausalEdge])
async def get_causal_edges(
    entity_id: Optional[str] = Query(
        None, description="Filter by source or target entity"
    ),
    edge_type: Optional[str] = Query(None, description="Filter by edge type"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of edges"),
) -> List[CausalEdge]:
    """Get causal edges from HCG graph."""
    if not hcg_client:
        raise HTTPException(status_code=503, detail="HCG client not available")

    try:
        edges = await asyncio.to_thread(
            hcg_client.get_causal_edges,
            entity_id=entity_id,
            edge_type=edge_type,
            limit=limit,
        )
        return edges
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch edges: {str(e)}")


@app.get("/api/hcg/plans", response_model=List[PlanHistory])
async def get_plan_history(
    goal_id: Optional[str] = Query(None, description="Filter by goal ID"),
    limit: int = Query(10, ge=1, le=100, description="Maximum number of plans"),
) -> List[PlanHistory]:
    """Get plan history from HCG graph."""
    if not hcg_client:
        raise HTTPException(status_code=503, detail="HCG client not available")

    try:
        plans = await asyncio.to_thread(
            hcg_client.get_plan_history, goal_id=goal_id, limit=limit
        )
        return plans
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch plan history: {str(e)}"
        )


@app.get("/api/hcg/history", response_model=List[StateHistory])
async def get_state_history(
    state_id: Optional[str] = Query(None, description="Filter by state ID"),
    limit: int = Query(
        50, ge=1, le=200, description="Maximum number of history records"
    ),
) -> List[StateHistory]:
    """Get state change history from HCG graph."""
    if not hcg_client:
        raise HTTPException(status_code=503, detail="HCG client not available")

    try:
        history = await asyncio.to_thread(
            hcg_client.get_state_history, state_id=state_id, limit=limit
        )
        return history
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch state history: {str(e)}"
        )


@app.get("/api/hcg/snapshot", response_model=GraphSnapshot)
async def get_graph_snapshot(
    entity_types: Optional[str] = Query(
        None, description="Comma-separated list of entity types"
    ),
    limit: int = Query(200, ge=1, le=1000, description="Maximum number of entities"),
) -> GraphSnapshot:
    """Get a snapshot of the HCG graph."""
    if not hcg_client:
        raise HTTPException(status_code=503, detail="HCG client not available")

    try:
        types_list = entity_types.split(",") if entity_types else None
        snapshot = await asyncio.to_thread(
            hcg_client.get_graph_snapshot,
            entity_types=types_list,
            limit=limit,
        )
        return snapshot
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch graph snapshot: {str(e)}"
        )


@app.post("/api/chat/stream")
async def chat_stream(request: ChatStreamRequest) -> StreamingResponse:
    """Stream Hermes completions back to the client while logging telemetry/persona."""

    if not hermes_client:
        raise HTTPException(status_code=503, detail="Hermes client not configured")

    async def event_stream() -> AsyncGenerator[str, None]:
        metadata = _sanitize_metadata(dict(request.metadata or {}))
        start_time = time.perf_counter()
        try:
            llm_request = _build_llm_request(request, metadata)
            hermes_response = await asyncio.to_thread(
                hermes_client.llm_generate, llm_request
            )
            if not hermes_response.success or not hermes_response.data:
                message = (
                    hermes_response.error
                    or "Hermes did not return a completion response."
                )
                yield _sse_event({"type": "error", "message": message})
                return

            llm_payload = hermes_response.data
            content = _extract_completion_text(llm_payload)
            accumulated = ""
            for chunk in _chunk_text(content):
                accumulated += chunk
                yield _sse_event({"type": "chunk", "content": chunk})

            usage = llm_payload.get("usage") or {}
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            session_id = metadata.get("session_id")
            await diagnostics_manager.record_llm_metrics(
                latency_ms=latency_ms,
                prompt_tokens=usage.get("prompt_tokens") or usage.get("promptTokens"),
                completion_tokens=usage.get("completion_tokens")
                or usage.get("completionTokens"),
                total_tokens=usage.get("total_tokens") or usage.get("totalTokens"),
                persona_sentiment=None,
                persona_confidence=None,
                session_id=session_id,
            )

            persona_metadata = {
                **metadata,
                "hermes_response_id": llm_payload.get("id"),
                "hermes_provider": llm_payload.get("provider"),
                "hermes_model": llm_payload.get("model"),
            }
            latest_user_message = _latest_user_message(request.messages)
            await _persist_persona_entry_from_chat(
                content=accumulated,
                summary=latest_user_message or accumulated,
                metadata=persona_metadata,
            )

            await diagnostics_manager.record_log(
                "info",
                (
                    "Hermes chat completion | "
                    f"session={session_id or 'n/a'} latency={latency_ms:.1f}ms "
                    f"tokens={usage.get('total_tokens') or usage.get('totalTokens') or 'n/a'}"
                ),
            )

            yield _sse_event(
                {
                    "type": "end",
                    "content": accumulated,
                    "usage": usage,
                }
            )
        except Exception as exc:  # noqa: BLE001
            await diagnostics_manager.record_log("error", f"Chat stream failed: {exc}")
            yield _sse_event({"type": "error", "message": str(exc)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


def _build_llm_request(
    stream_request: ChatStreamRequest, metadata: Dict[str, Any]
) -> LLMRequest:
    messages = [
        LLMMessage(role=msg.role, content=msg.content)
        for msg in stream_request.messages
    ]
    if not messages:
        raise HTTPException(status_code=400, detail="Messages cannot be empty")
    return LLMRequest(
        messages=messages,
        metadata=metadata or None,
        provider=stream_request.provider,
        model=stream_request.model,
        temperature=stream_request.temperature,
        max_tokens=stream_request.max_tokens,
    )


def _chunk_text(content: str, chunk_size: int = 200) -> List[str]:
    if not content:
        return []
    chunks: List[str] = []
    buffer = ""
    for token in content.split(" "):
        candidate = f"{buffer} {token}".strip()
        if len(candidate) > chunk_size and buffer:
            chunks.append(buffer)
            buffer = token
        else:
            buffer = candidate
    if buffer:
        chunks.append(buffer)
    return chunks


def _extract_completion_text(llm_payload: Dict[str, Any]) -> str:
    choices = llm_payload.get("choices") or []
    for choice in choices:
        message = choice.get("message") or {}
        content = message.get("content")
        if content:
            return str(content)
    return ""


def _sse_event(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _latest_user_message(messages: List[ChatMessagePayload]) -> Optional[str]:
    for msg in reversed(messages):
        if msg.role == "user" and msg.content:
            return msg.content
    return None


async def _persist_persona_entry_from_chat(
    *, content: str, summary: str, metadata: Dict[str, Any]
) -> None:
    if not persona_store:
        return
    entry = PersonaEntry(
        id=f"persona_{uuid4().hex}",
        timestamp=datetime.now(timezone.utc),
        entry_type="observation",
        content=content,
        summary=_truncate_summary(summary),
        sentiment=None,
        confidence=None,
        related_process_ids=[],
        related_goal_ids=[],
        emotion_tags=[],
        metadata=metadata,
    )
    try:
        stored_entry = await asyncio.to_thread(persona_store.create_entry, entry)
        await diagnostics_manager.broadcast_persona_entry(stored_entry)
    except Exception as exc:  # noqa: BLE001
        await diagnostics_manager.record_log(
            "error", f"Failed to persist persona diary entry: {exc}"
        )


def _sanitize_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    sanitized: Dict[str, Any] = {}
    for key, value in metadata.items():
        if value in (None, "", [], {}):
            continue
        sanitized[key] = value
    return sanitized


def _truncate_summary(text: str, max_length: int = 160) -> str:
    text = text.strip()
    if len(text) <= max_length:
        return text
    return f"{text[:max_length].rstrip()}…"


@app.get(
    "/api/diagnostics/logs",
    response_model=List[DiagnosticLogEntry],
    name="diagnostics_logs",
)
async def get_diagnostic_logs(
    limit: int = Query(50, ge=1, le=200, description="Maximum number of log entries"),
) -> List[DiagnosticLogEntry]:
    """Return recent diagnostic log entries."""
    return diagnostics_manager.get_logs(limit)


@app.post(
    "/api/diagnostics/llm",
    status_code=202,
    name="diagnostics_llm_ingest",
)
async def ingest_llm_telemetry(payload: LLMTelemetryPayload) -> dict[str, str]:
    """Ingest Hermes LLM telemetry so the dashboard reflects chat activity."""

    session_id = payload.metadata.get("session_id") if payload.metadata else None
    await diagnostics_manager.record_llm_metrics(
        latency_ms=payload.latency_ms,
        prompt_tokens=payload.prompt_tokens,
        completion_tokens=payload.completion_tokens,
        total_tokens=payload.total_tokens,
        persona_sentiment=payload.persona_sentiment,
        persona_confidence=payload.persona_confidence,
        session_id=session_id,
    )

    await diagnostics_manager.record_log(
        "info",
        (
            "Hermes chat completion | "
            f"session={session_id or 'n/a'} "
            f"latency={payload.latency_ms:.1f}ms "
            f"tokens={payload.total_tokens or 'n/a'}"
        ),
    )

    return {"status": "accepted"}


@app.get(
    "/api/diagnostics/metrics",
    response_model=TelemetrySnapshot,
    name="diagnostics_metrics",
)
async def get_diagnostic_metrics() -> TelemetrySnapshot:
    """Return latest telemetry metrics snapshot."""
    return diagnostics_manager.get_telemetry()


@app.websocket("/ws/diagnostics")
async def diagnostics_websocket(websocket: WebSocket) -> None:
    """Enhanced WebSocket endpoint for diagnostic logs, telemetry, and real-time updates.

    Supports:
    - Real-time log streaming
    - Telemetry updates
    - Persona diary entry notifications
    - HCG graph change notifications
    - Heartbeat/ping-pong for connection health
    - Message queuing for slow clients
    - Robust error handling and cleanup
    """
    connection: Optional[WebSocketConnection] = None

    try:
        await websocket.accept()
        connection = await diagnostics_manager.register(websocket)

        async def heartbeat_listener() -> None:
            """Listen for ping messages from client and respond with pong."""
            try:
                while True:
                    data = await websocket.receive_text()
                    try:
                        message = json.loads(data)
                        if message.get("type") == "ping":
                            connection.last_heartbeat = datetime.now(timezone.utc)
                            await websocket.send_json(
                                {
                                    "type": "pong",
                                    "timestamp": datetime.now(timezone.utc).isoformat(),
                                    "connection_id": connection.connection_id,
                                }
                            )
                    except json.JSONDecodeError:
                        await diagnostics_manager.record_log(
                            "warning",
                            f"Invalid JSON from client {connection.connection_id}",
                        )
            except WebSocketDisconnect:
                pass
            except Exception as e:
                await diagnostics_manager.record_log(
                    "error",
                    f"Heartbeat listener error for {connection.connection_id}: {str(e)}",
                )

        async def message_sender() -> None:
            """Send queued messages to the client."""
            try:
                # Send initial snapshot
                await websocket.send_json(
                    DiagnosticsEvent(
                        type="telemetry",
                        data=diagnostics_manager.get_telemetry().model_dump(
                            mode="json"
                        ),
                    ).model_dump(mode="json")
                )
                connection.messages_sent += 1

                await websocket.send_json(
                    DiagnosticsEvent(
                        type="logs",
                        data=[
                            log.model_dump(mode="json")
                            for log in diagnostics_manager.get_logs(limit=20)
                        ],
                    ).model_dump(mode="json")
                )
                connection.messages_sent += 1

                # Stream queued events
                while True:
                    event = await connection.queue.get()
                    await websocket.send_json(event)
                    connection.messages_sent += 1

            except WebSocketDisconnect:
                pass
            except Exception as e:
                await diagnostics_manager.record_log(
                    "error",
                    f"Message sender error for {connection.connection_id}: {str(e)}",
                )
                raise

        # Run both tasks concurrently
        listener_task = asyncio.create_task(heartbeat_listener())
        sender_task = asyncio.create_task(message_sender())

        # Wait for either task to complete (indicating disconnection or error)
        done, pending = await asyncio.wait(
            [listener_task, sender_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        # Cancel remaining tasks
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    except WebSocketDisconnect:
        pass
    except Exception as e:
        await diagnostics_manager.record_log(
            "error",
            f"WebSocket error: {str(e)}",
        )
    finally:
        if connection:
            await diagnostics_manager.unregister(connection.connection_id)


def main() -> None:
    """Main entry point for apollo-api CLI command."""
    import uvicorn
    import os

    from apollo.env import APOLLO_PORTS

    port = int(os.getenv("APOLLO_PORT", str(APOLLO_PORTS.api)))
    host = os.getenv("APOLLO_HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()


class CreatePersonaEntryRequest(BaseModel):
    """Request model for creating a persona entry."""

    entry_type: str
    content: str
    summary: Optional[str] = None
    sentiment: Optional[str] = None
    confidence: Optional[float] = None
    related_process_ids: List[str] = []
    related_goal_ids: List[str] = []
    emotion_tags: List[str] = []
    metadata: dict = {}


@app.post("/api/persona/entries", response_model=PersonaEntry, status_code=201)
async def create_persona_entry(request: CreatePersonaEntryRequest) -> PersonaEntry:
    """Create a new persona diary entry."""
    if not persona_store:
        raise HTTPException(status_code=503, detail="Persona store not available")

    entry = PersonaEntry(
        id=f"persona_{uuid4().hex}",
        timestamp=datetime.now(timezone.utc),
        entry_type=request.entry_type,
        content=request.content,
        summary=request.summary,
        sentiment=request.sentiment,
        confidence=request.confidence,
        related_process_ids=request.related_process_ids,
        related_goal_ids=request.related_goal_ids,
        emotion_tags=request.emotion_tags,
        metadata=request.metadata,
    )

    try:
        stored_entry = await asyncio.to_thread(persona_store.create_entry, entry)
        await diagnostics_manager.record_log(
            "info", f"Persona entry created ({request.entry_type})"
        )
        await diagnostics_manager.broadcast_persona_entry(stored_entry)
        return stored_entry
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"Failed to create persona entry: {exc}"
        ) from exc


@app.get("/api/persona/entries", response_model=List[PersonaEntry])
async def get_persona_entries(
    entry_type: Optional[str] = Query(None, description="Filter by entry type"),
    sentiment: Optional[str] = Query(None, description="Filter by sentiment"),
    related_process_id: Optional[str] = Query(
        None, description="Filter by related process ID"
    ),
    related_goal_id: Optional[str] = Query(
        None, description="Filter by related goal ID"
    ),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of entries"),
    offset: int = Query(0, ge=0, description="Number of entries to skip"),
) -> List[PersonaEntry]:
    """Get persona diary entries with optional filtering."""
    if not persona_store:
        raise HTTPException(status_code=503, detail="Persona store not available")

    try:
        return await asyncio.to_thread(
            persona_store.list_entries,
            entry_type=entry_type,
            sentiment=sentiment,
            related_process_id=related_process_id,
            related_goal_id=related_goal_id,
            limit=limit,
            offset=offset,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch persona entries: {exc}"
        ) from exc


@app.get("/api/persona/entries/{entry_id}", response_model=PersonaEntry)
async def get_persona_entry(entry_id: str) -> PersonaEntry:
    """Get a specific persona diary entry by ID."""
    if not persona_store:
        raise HTTPException(status_code=503, detail="Persona store not available")

    try:
        entry = await asyncio.to_thread(persona_store.get_entry, entry_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch persona entry: {exc}"
        ) from exc

    if not entry:
        raise HTTPException(status_code=404, detail="Persona entry not found")

    return entry


# ---------------------------------------------------------------------
# Media Upload Proxy Endpoints
# ---------------------------------------------------------------------


@app.post("/api/media/upload")
async def upload_media(
    file: UploadFile = File(...),
    media_type: str = Form(...),
    question: Optional[str] = Form(None),
) -> dict:
    """Proxy media upload to Hermes /ingest/media endpoint.

    Hermes processes the media (STT, embeddings) and forwards to Sophia
    for storage and perception workflows.

    Args:
        file: Media file to upload (image/video/audio)
        media_type: Type of media (IMAGE, VIDEO, AUDIO)
        question: Optional question context for the media

    Returns:
        Media ingestion response with sample_id, metadata, and processing results

    Raises:
        HTTPException: 413 if file exceeds 100 MB limit
        HTTPException: 503 if Hermes service unavailable
    """
    # Server-side size validation - enforce 100 MB limit
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB in bytes

    config = ApolloConfig.load()
    hermes_url = f"http://{config.hermes.host}:{config.hermes.port}"
    hermes_token = config.hermes.api_key or os.getenv("HERMES_API_KEY")

    # Hermes token is optional for media ingestion
    headers = {}
    if hermes_token:
        headers["Authorization"] = f"Bearer {hermes_token}"

    try:
        # Validate file size without loading entire file into memory
        file.file.seek(0, 2)  # Seek to end
        file_size = file.file.tell()
        file.file.seek(0)  # Reset to beginning

        if file_size > MAX_FILE_SIZE:
            await diagnostics_manager.record_log(
                "warning",
                f"Media upload rejected: {file.filename} exceeds 100 MB limit ({file_size / (1024 * 1024):.2f} MB)",
            )
            raise HTTPException(
                status_code=413,
                detail=f"File size ({file_size / (1024 * 1024):.2f} MB) exceeds 100 MB limit",
            )

        # Stream file to Hermes without loading into memory
        # Hermes will process and forward to Sophia
        files = {"file": (file.filename, file.file, file.content_type)}
        data = {"media_type": media_type}
        if question:
            data["question"] = question

        # Proxy request to Hermes with streaming using shared HTTP client
        response = await app.state.http_client.post(
            f"{hermes_url}/ingest/media",
            files=files,
            data=data,
            headers=headers,
            timeout=config.hermes.timeout,
        )
        response.raise_for_status()

        await diagnostics_manager.record_log(
            "info",
            f"Media uploaded via Hermes: {file.filename} ({media_type}, {file_size / (1024 * 1024):.2f} MB)",
        )

        return response.json()  # type: ignore[no-any-return]

    except httpx.HTTPStatusError as exc:
        await diagnostics_manager.record_log(
            "error",
            f"Media upload failed: HTTP {exc.response.status_code} - {exc.response.text}",
        )
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Hermes upload failed: {exc.response.text}",
        ) from exc
    except httpx.RequestError as exc:
        await diagnostics_manager.record_log(
            "error",
            f"Media upload connection error: {str(exc)}",
        )
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to Hermes service: {str(exc)}",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        await diagnostics_manager.record_log(
            "error",
            f"Media upload failed: {str(exc)}",
        )
        raise HTTPException(
            status_code=500,
            detail=f"Media upload failed: {str(exc)}",
        ) from exc


@app.get("/api/media/samples")
async def list_media_samples(
    media_type: Optional[str] = Query(None, description="Filter by media type"),
    limit: int = Query(20, ge=1, le=100, description="Maximum number of samples"),
    offset: int = Query(0, ge=0, description="Number of samples to skip"),
) -> dict:
    """Proxy request to Sophia GET /media/samples endpoint.

    Args:
        media_type: Optional filter by media type (IMAGE, VIDEO, AUDIO)
        limit: Maximum number of samples to return
        offset: Number of samples to skip for pagination

    Returns:
        List of media samples with metadata
    """
    config = ApolloConfig.load()
    sophia_url = f"http://{config.sophia.host}:{config.sophia.port}"
    sophia_token = config.sophia.api_key or os.getenv("SOPHIA_API_TOKEN")

    if not sophia_token:
        raise HTTPException(
            status_code=503,
            detail="Sophia API token not configured. Set SOPHIA_API_KEY in config or SOPHIA_API_TOKEN env var.",
        )

    try:
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if media_type:
            params["media_type"] = media_type

        response = await app.state.http_client.get(
            f"{sophia_url}/media/samples",
            params=params,
            headers={"Authorization": f"Bearer {sophia_token}"},
            timeout=config.sophia.timeout,
        )
        response.raise_for_status()
        return response.json()  # type: ignore[no-any-return]

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Sophia request failed: {exc.response.text}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to Sophia service: {str(exc)}",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch media samples: {str(exc)}",
        ) from exc


@app.get("/api/media/samples/{sample_id}")
async def get_media_sample(sample_id: str) -> dict:
    """Proxy request to Sophia GET /media/samples/{sample_id} endpoint.

    Args:
        sample_id: Media sample ID to retrieve

    Returns:
        Media sample details with metadata
    """
    config = ApolloConfig.load()
    sophia_url = f"http://{config.sophia.host}:{config.sophia.port}"
    sophia_token = config.sophia.api_key or os.getenv("SOPHIA_API_TOKEN")

    if not sophia_token:
        raise HTTPException(
            status_code=503,
            detail="Sophia API token not configured. Set SOPHIA_API_KEY in config or SOPHIA_API_TOKEN env var.",
        )

    try:
        response = await app.state.http_client.get(
            f"{sophia_url}/media/samples/{sample_id}",
            headers={"Authorization": f"Bearer {sophia_token}"},
            timeout=config.sophia.timeout,
        )
        response.raise_for_status()
        return response.json()  # type: ignore[no-any-return]

    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail=f"Media sample not found: {sample_id}",
            ) from exc
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Sophia request failed: {exc.response.text}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to Sophia service: {str(exc)}",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch media sample: {str(exc)}",
        ) from exc
