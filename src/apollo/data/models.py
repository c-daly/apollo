"""Data models for HCG ontology entities following Section 4.1 specification."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Entity(BaseModel):
    """Base entity in HCG ontology.

    Represents any node in the Hybrid Causal Graph.
    """

    id: str = Field(..., description="Unique identifier for the entity")
    type: str = Field(..., description="Entity type (e.g., 'goal', 'state', 'action')")
    properties: Dict[str, Any] = Field(
        default_factory=dict, description="Entity properties"
    )
    labels: List[str] = Field(
        default_factory=list, description="Neo4j labels for the entity"
    )
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")


class State(BaseModel):
    """State entity representing agent or world state in HCG.

    States are snapshots of the world or agent at a point in time.
    """

    id: str = Field(..., description="Unique state identifier")
    type: str = Field(default="state", description="Entity type")
    description: str = Field(..., description="State description")
    variables: Dict[str, Any] = Field(
        default_factory=dict, description="State variables"
    )
    timestamp: datetime = Field(..., description="State timestamp")
    properties: Dict[str, Any] = Field(
        default_factory=dict, description="Additional properties"
    )


class Process(BaseModel):
    """Process entity representing actions or transformations in HCG.

    Processes transform states and create causal relationships.
    """

    id: str = Field(..., description="Unique process identifier")
    type: str = Field(default="process", description="Entity type")
    name: str = Field(..., description="Process name")
    description: Optional[str] = Field(None, description="Process description")
    status: str = Field(
        default="pending", description="Process status (pending, running, completed)"
    )
    inputs: List[str] = Field(default_factory=list, description="Input state IDs")
    outputs: List[str] = Field(default_factory=list, description="Output state IDs")
    properties: Dict[str, Any] = Field(
        default_factory=dict, description="Additional properties"
    )
    created_at: datetime = Field(..., description="Creation timestamp")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")


class CausalEdge(BaseModel):
    """Causal edge representing relationships between entities in HCG.

    Edges define causal relationships, dependencies, and transformations.
    """

    id: str = Field(..., description="Unique edge identifier")
    source_id: str = Field(..., description="Source entity ID")
    target_id: str = Field(..., description="Target entity ID")
    edge_type: str = Field(
        ..., description="Edge type (e.g., 'causes', 'requires', 'produces')"
    )
    properties: Dict[str, Any] = Field(
        default_factory=dict, description="Edge properties"
    )
    weight: float = Field(default=1.0, description="Edge weight or strength")
    created_at: datetime = Field(..., description="Creation timestamp")


class PlanHistory(BaseModel):
    """Historical record of a plan in HCG.

    Tracks plan generation, execution, and outcomes.
    """

    id: str = Field(..., description="Unique plan identifier")
    goal_id: str = Field(..., description="Associated goal ID")
    status: str = Field(
        ..., description="Plan status (pending, executing, completed, failed)"
    )
    steps: List[Dict[str, Any]] = Field(default_factory=list, description="Plan steps")
    created_at: datetime = Field(..., description="Plan creation time")
    started_at: Optional[datetime] = Field(None, description="Execution start time")
    completed_at: Optional[datetime] = Field(None, description="Completion time")
    result: Optional[Dict[str, Any]] = Field(None, description="Execution result")


class StateHistory(BaseModel):
    """Historical record of state changes in HCG.

    Tracks state transitions over time for visualization and analysis.
    """

    id: str = Field(..., description="Unique history entry identifier")
    state_id: str = Field(..., description="State identifier")
    timestamp: datetime = Field(..., description="Change timestamp")
    changes: Dict[str, Any] = Field(default_factory=dict, description="State changes")
    previous_values: Optional[Dict[str, Any]] = Field(
        None, description="Previous state values"
    )
    trigger: Optional[str] = Field(None, description="What triggered the state change")


class GraphSnapshot(BaseModel):
    """Complete snapshot of HCG graph state.

    Used for visualization and analysis of the entire graph.
    """

    entities: List[Entity] = Field(
        default_factory=list, description="All entities in the graph"
    )
    edges: List[CausalEdge] = Field(
        default_factory=list, description="All causal edges"
    )
    timestamp: datetime = Field(..., description="Snapshot timestamp")
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Snapshot metadata"
    )
