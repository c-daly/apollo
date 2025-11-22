"""FastAPI server for Apollo HCG data access.

This server provides REST API endpoints to query Neo4j HCG data,
stream telemetry, and serve real-time diagnostics.
"""

import asyncio
import contextlib
import json
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime
import time
from typing import Any, AsyncGenerator, AsyncIterator, Deque, Dict, List, Optional, Union
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from apollo.client.hermes_client import HermesClient
from apollo.config.settings import ApolloConfig
from apollo.data.hcg_client import HCGClient
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


class DiagnosticsManager:
    """Keeps a rolling buffer of log entries and telemetry snapshots."""

    def __init__(self, max_logs: int = 200):
        self._logs: Deque[DiagnosticLogEntry] = deque(maxlen=max_logs)
        self._telemetry = TelemetrySnapshot(
            api_latency_ms=0.0,
            request_count=0,
            success_rate=100.0,
            active_plans=0,
            last_update=datetime.utcnow(),
        )
        self._subscribers: set[asyncio.Queue] = set()

    def get_logs(self, limit: int = 50) -> List[DiagnosticLogEntry]:
        return list(self._logs)[:limit]

    def get_telemetry(self) -> TelemetrySnapshot:
        return self._telemetry

    async def record_log(self, level: str, message: str) -> None:
        entry = DiagnosticLogEntry(
            id=f"log-{int(datetime.utcnow().timestamp()*1000)}",
            timestamp=datetime.utcnow(),
            level=level,
            message=message,
        )
        self._logs.appendleft(entry)
        await self._broadcast(
            DiagnosticsEvent(type="log", data=entry.model_dump()).model_dump()
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
                "last_update": datetime.utcnow(),
            }
        )
        await self._broadcast(
            DiagnosticsEvent(
                type="telemetry", data=self._telemetry.model_dump()
            ).model_dump()
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
                "last_llm_update": datetime.utcnow(),
                "last_llm_session": session_id,
            }
        )
        await self._broadcast(
            DiagnosticsEvent(
                type="telemetry", data=self._telemetry.model_dump()
            ).model_dump()
        )

    async def broadcast_persona_entry(self, entry: PersonaEntry) -> None:
        """Broadcast a newly created persona entry to subscribers."""
        await self._broadcast(
            DiagnosticsEvent(
                type="persona_entry",
                data=entry.model_dump(),
            ).model_dump()
        )

    def register(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers.add(queue)
        return queue

    def unregister(self, queue: asyncio.Queue) -> None:
        self._subscribers.discard(queue)

    async def _broadcast(self, event: dict) -> None:
        for queue in list(self._subscribers):
            await queue.put(event)


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
        while True:
            if not hcg_client:
                await asyncio.sleep(5)
                continue

            try:
                start = datetime.utcnow()
                health = await asyncio.to_thread(hcg_client.health_check)
                latency_ms = (datetime.utcnow() - start).total_seconds() * 1000.0

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
            except Exception as exc:  # noqa: BLE001
                await diagnostics_manager.record_log(
                    "error", f"Telemetry poll failed: {exc}"
                )

            await asyncio.sleep(5)

    diagnostics_task = asyncio.create_task(telemetry_poller())

    yield

    # Shutdown: Close HCG client and persona store
    if diagnostics_task:
        diagnostics_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await diagnostics_task
    if persona_store:
        persona_store.close()
        await diagnostics_manager.record_log("info", "Persona diary store disconnected")
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
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
        neo4j_connected = hcg_client.health_check()

    return HealthResponse(
        status="healthy" if neo4j_connected else "degraded",
        timestamp=datetime.now().isoformat(),
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
        entities = hcg_client.get_entities(
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
    if not hcg_client:
        raise HTTPException(status_code=503, detail="HCG client not available")

    try:
        entity = hcg_client.get_entity_by_id(entity_id)
        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")
        return entity
    except HTTPException:
        raise
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
        states = hcg_client.get_states(limit=limit, offset=offset)
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
        processes = hcg_client.get_processes(
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
        edges = hcg_client.get_causal_edges(
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
        plans = hcg_client.get_plan_history(goal_id=goal_id, limit=limit)
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
        history = hcg_client.get_state_history(state_id=state_id, limit=limit)
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
        snapshot = hcg_client.get_graph_snapshot(
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
                prompt_tokens=usage.get("prompt_tokens")
                or usage.get("promptTokens"),
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
            await diagnostics_manager.record_log(
                "error", f"Chat stream failed: {exc}"
            )
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
        timestamp=datetime.now(),
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
        stored_entry = persona_store.create_entry(entry)
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
    """Broadcast diagnostic logs + telemetry over WebSocket."""
    await websocket.accept()
    queue = diagnostics_manager.register()
    try:
        await websocket.send_json(
            DiagnosticsEvent(
                type="telemetry", data=diagnostics_manager.get_telemetry().model_dump()
            ).model_dump()
        )
        await websocket.send_json(
            DiagnosticsEvent(
                type="logs",
                data=[
                    log.model_dump() for log in diagnostics_manager.get_logs(limit=20)
                ],
            ).model_dump()
        )
        while True:
            event = await queue.get()
            await websocket.send_json(event)
    except WebSocketDisconnect:
        diagnostics_manager.unregister(queue)


def main() -> None:
    """Main entry point for apollo-api CLI command."""
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8082)


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
        timestamp=datetime.now(),
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
        stored_entry = persona_store.create_entry(entry)
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
        return persona_store.list_entries(
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
        entry = persona_store.get_entry(entry_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch persona entry: {exc}"
        ) from exc

    if not entry:
        raise HTTPException(status_code=404, detail="Persona entry not found")

    return entry
