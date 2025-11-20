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
)


# Global HCG client instance
hcg_client: Optional[HCGClient] = None


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


def main() -> None:
    """Main entry point for apollo-api CLI command."""
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8082)


if __name__ == "__main__":
    main()
