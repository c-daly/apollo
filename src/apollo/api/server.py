"""FastAPI server for Apollo HCG data access.

This server provides REST API endpoints to query Neo4j HCG data,
stream telemetry, and serve real-time diagnostics.
"""

from datetime import datetime
from typing import AsyncIterator, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from apollo.config.settings import ApolloConfig
from apollo.data.hcg_client import HCGClient
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


# Global HCG client instance
hcg_client: Optional[HCGClient] = None

# In-memory storage for persona entries (in production, use a database)
persona_entries: List[PersonaEntry] = []


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """FastAPI lifespan context manager."""
    global hcg_client

    # Startup: Initialize HCG client
    config = ApolloConfig.load()
    if config.hcg and config.hcg.neo4j:
        hcg_client = HCGClient(config.hcg.neo4j)
        hcg_client.connect()
        print("HCG client connected to Neo4j")

    yield

    # Shutdown: Close HCG client
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
    """Create a new persona diary entry.

    This endpoint allows creation of new diary entries capturing the agent's
    internal reasoning, decisions, beliefs, and observations.
    """
    global persona_entries

    # Generate unique ID
    entry_id = f"entry_{len(persona_entries) + 1}_{int(datetime.now().timestamp())}"

    # Create the entry
    entry = PersonaEntry(
        id=entry_id,
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

    # Store the entry
    persona_entries.append(entry)

    return entry


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
    """Get persona diary entries with optional filtering.

    Returns a list of diary entries sorted by timestamp (most recent first).
    """
    global persona_entries

    # Apply filters
    filtered = persona_entries

    if entry_type:
        filtered = [e for e in filtered if e.entry_type == entry_type]

    if sentiment:
        filtered = [e for e in filtered if e.sentiment == sentiment]

    if related_process_id:
        filtered = [e for e in filtered if related_process_id in e.related_process_ids]

    if related_goal_id:
        filtered = [e for e in filtered if related_goal_id in e.related_goal_ids]

    # Sort by timestamp (most recent first)
    sorted_entries = sorted(filtered, key=lambda e: e.timestamp, reverse=True)

    # Apply pagination
    paginated = sorted_entries[offset : offset + limit]

    return paginated


@app.get("/api/persona/entries/{entry_id}", response_model=PersonaEntry)
async def get_persona_entry(entry_id: str) -> PersonaEntry:
    """Get a specific persona diary entry by ID."""
    global persona_entries

    for entry in persona_entries:
        if entry.id == entry_id:
            return entry

    raise HTTPException(status_code=404, detail="Persona entry not found")


def main() -> None:
    """Main entry point for apollo-api CLI command."""
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8082)


if __name__ == "__main__":
    main()
