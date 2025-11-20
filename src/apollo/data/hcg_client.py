"""Neo4j client for read-only HCG graph queries."""

from datetime import datetime
from typing import Any, List, Optional

from neo4j import GraphDatabase, Driver

from apollo.config.settings import Neo4jConfig
from apollo.data.models import (
    Entity,
    State,
    Process,
    CausalEdge,
    PlanHistory,
    StateHistory,
    GraphSnapshot,
)


class HCGClient:
    """Read-only client for querying HCG graph data from Neo4j.

    This client provides methods to query entities, states, processes,
    causal edges, and historical data from the Hybrid Causal Graph stored
    in Neo4j. All operations are read-only to ensure data integrity.
    """

    def __init__(self, config: Neo4jConfig) -> None:
        """Initialize HCG client.

        Args:
            config: Neo4j configuration
        """
        self.config = config
        self._driver: Optional[Driver] = None

    def connect(self) -> None:
        """Establish connection to Neo4j database."""
        if self._driver is None:
            self._driver = GraphDatabase.driver(
                self.config.uri,
                auth=(self.config.user, self.config.password),
            )

    def close(self) -> None:
        """Close connection to Neo4j database."""
        if self._driver:
            self._driver.close()
            self._driver = None

    def __enter__(self) -> "HCGClient":
        """Context manager entry."""
        self.connect()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit."""
        self.close()

    def _parse_node(self, node: Any) -> Entity:
        """Parse Neo4j node into Entity model.

        Args:
            node: Neo4j node object

        Returns:
            Entity model
        """
        properties = dict(node)
        return Entity(
            id=properties.get("id", str(node.id)),
            type=properties.get("type", "unknown"),
            properties=properties,
            labels=list(node.labels),
            created_at=properties.get("created_at"),
            updated_at=properties.get("updated_at"),
        )

    def _parse_relationship(self, rel: Any) -> CausalEdge:
        """Parse Neo4j relationship into CausalEdge model.

        Args:
            rel: Neo4j relationship object

        Returns:
            CausalEdge model
        """
        properties = dict(rel)
        return CausalEdge(
            id=properties.get("id", str(rel.id)),
            source_id=str(rel.start_node.id),
            target_id=str(rel.end_node.id),
            edge_type=rel.type,
            properties=properties,
            weight=properties.get("weight", 1.0),
            created_at=properties.get("created_at", datetime.now()),
        )

    def get_entities(
        self,
        entity_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Entity]:
        """Get entities from HCG graph.

        Args:
            entity_type: Optional filter by entity type
            limit: Maximum number of entities to return
            offset: Number of entities to skip

        Returns:
            List of entities
        """
        if not self._driver:
            self.connect()

        query = """
        MATCH (n)
        WHERE $entity_type IS NULL OR n.type = $entity_type
        RETURN n
        ORDER BY n.created_at DESC
        SKIP $offset
        LIMIT $limit
        """

        with self._driver.session() as session:  # type: ignore
            result = session.run(
                query,
                entity_type=entity_type,
                limit=limit,
                offset=offset,
            )
            return [self._parse_node(record["n"]) for record in result]

    def get_entity_by_id(self, entity_id: str) -> Optional[Entity]:
        """Get a specific entity by ID.

        Args:
            entity_id: Entity identifier

        Returns:
            Entity or None if not found
        """
        if not self._driver:
            self.connect()

        query = """
        MATCH (n)
        WHERE n.id = $entity_id OR id(n) = $node_id
        RETURN n
        """

        with self._driver.session() as session:  # type: ignore
            result = session.run(
                query,
                entity_id=entity_id,
                node_id=int(entity_id) if entity_id.isdigit() else -1,
            )
            record = result.single()
            return self._parse_node(record["n"]) if record else None

    def get_states(
        self,
        limit: int = 100,
        offset: int = 0,
    ) -> List[State]:
        """Get state entities from HCG graph.

        Args:
            limit: Maximum number of states to return
            offset: Number of states to skip

        Returns:
            List of states
        """
        if not self._driver:
            self.connect()

        query = """
        MATCH (s:State)
        RETURN s
        ORDER BY s.timestamp DESC
        SKIP $offset
        LIMIT $limit
        """

        with self._driver.session() as session:  # type: ignore
            result = session.run(query, limit=limit, offset=offset)
            states = []
            for record in result:
                node = record["s"]
                props = dict(node)
                states.append(
                    State(
                        id=props.get("id", str(node.id)),
                        description=props.get("description", ""),
                        variables=props.get("variables", {}),
                        timestamp=props.get("timestamp", datetime.now()),
                        properties=props,
                    )
                )
            return states

    def get_processes(
        self,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Process]:
        """Get process entities from HCG graph.

        Args:
            status: Optional filter by process status
            limit: Maximum number of processes to return
            offset: Number of processes to skip

        Returns:
            List of processes
        """
        if not self._driver:
            self.connect()

        query = """
        MATCH (p:Process)
        WHERE $status IS NULL OR p.status = $status
        RETURN p
        ORDER BY p.created_at DESC
        SKIP $offset
        LIMIT $limit
        """

        with self._driver.session() as session:  # type: ignore
            result = session.run(
                query,
                status=status,
                limit=limit,
                offset=offset,
            )
            processes = []
            for record in result:
                node = record["p"]
                props = dict(node)
                processes.append(
                    Process(
                        id=props.get("id", str(node.id)),
                        name=props.get("name", ""),
                        description=props.get("description"),
                        status=props.get("status", "pending"),
                        inputs=props.get("inputs", []),
                        outputs=props.get("outputs", []),
                        properties=props,
                        created_at=props.get("created_at", datetime.now()),
                        completed_at=props.get("completed_at"),
                    )
                )
            return processes

    def get_causal_edges(
        self,
        entity_id: Optional[str] = None,
        edge_type: Optional[str] = None,
        limit: int = 100,
    ) -> List[CausalEdge]:
        """Get causal edges from HCG graph.

        Args:
            entity_id: Optional filter by source or target entity
            edge_type: Optional filter by edge type
            limit: Maximum number of edges to return

        Returns:
            List of causal edges
        """
        if not self._driver:
            self.connect()

        if entity_id:
            query = """
            MATCH (n)-[r]->(m)
            WHERE (n.id = $entity_id OR m.id = $entity_id)
              AND ($edge_type IS NULL OR type(r) = $edge_type)
            RETURN n, r, m
            LIMIT $limit
            """
        else:
            query = """
            MATCH (n)-[r]->(m)
            WHERE $edge_type IS NULL OR type(r) = $edge_type
            RETURN n, r, m
            LIMIT $limit
            """

        with self._driver.session() as session:  # type: ignore
            result = session.run(
                query,
                entity_id=entity_id,
                edge_type=edge_type,
                limit=limit,
            )
            edges = []
            for record in result:
                rel = record["r"]
                source = record["n"]
                target = record["m"]
                props = dict(rel)
                edges.append(
                    CausalEdge(
                        id=props.get("id", str(rel.id)),
                        source_id=dict(source).get("id", str(source.id)),
                        target_id=dict(target).get("id", str(target.id)),
                        edge_type=rel.type,
                        properties=props,
                        weight=props.get("weight", 1.0),
                        created_at=props.get("created_at", datetime.now()),
                    )
                )
            return edges

    def get_plan_history(
        self,
        goal_id: Optional[str] = None,
        limit: int = 10,
    ) -> List[PlanHistory]:
        """Get plan history from HCG graph.

        Args:
            goal_id: Optional filter by goal ID
            limit: Maximum number of plans to return

        Returns:
            List of plan history records
        """
        if not self._driver:
            self.connect()

        query = """
        MATCH (p:Plan)
        WHERE $goal_id IS NULL OR p.goal_id = $goal_id
        RETURN p
        ORDER BY p.created_at DESC
        LIMIT $limit
        """

        with self._driver.session() as session:  # type: ignore
            result = session.run(query, goal_id=goal_id, limit=limit)
            plans = []
            for record in result:
                node = record["p"]
                props = dict(node)
                plans.append(
                    PlanHistory(
                        id=props.get("id", str(node.id)),
                        goal_id=props.get("goal_id", ""),
                        status=props.get("status", "pending"),
                        steps=props.get("steps", []),
                        created_at=props.get("created_at", datetime.now()),
                        started_at=props.get("started_at"),
                        completed_at=props.get("completed_at"),
                        result=props.get("result"),
                    )
                )
            return plans

    def get_state_history(
        self,
        state_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[StateHistory]:
        """Get state change history from HCG graph.

        Args:
            state_id: Optional filter by state ID
            limit: Maximum number of history records to return

        Returns:
            List of state history records
        """
        if not self._driver:
            self.connect()

        query = """
        MATCH (h:StateHistory)
        WHERE $state_id IS NULL OR h.state_id = $state_id
        RETURN h
        ORDER BY h.timestamp DESC
        LIMIT $limit
        """

        with self._driver.session() as session:  # type: ignore
            result = session.run(query, state_id=state_id, limit=limit)
            history = []
            for record in result:
                node = record["h"]
                props = dict(node)
                history.append(
                    StateHistory(
                        id=props.get("id", str(node.id)),
                        state_id=props.get("state_id", ""),
                        timestamp=props.get("timestamp", datetime.now()),
                        changes=props.get("changes", {}),
                        previous_values=props.get("previous_values"),
                        trigger=props.get("trigger"),
                    )
                )
            return history

    def get_graph_snapshot(
        self,
        entity_types: Optional[List[str]] = None,
        limit: int = 200,
    ) -> GraphSnapshot:
        """Get a snapshot of the HCG graph.

        Args:
            entity_types: Optional filter by entity types
            limit: Maximum number of entities to include

        Returns:
            Graph snapshot with entities and edges
        """
        if not self._driver:
            self.connect()

        # Get entities
        if entity_types:
            node_query = """
            MATCH (n)
            WHERE n.type IN $entity_types
            RETURN n
            LIMIT $limit
            """
        else:
            node_query = """
            MATCH (n)
            RETURN n
            LIMIT $limit
            """

        # Get edges between selected nodes
        edge_query = """
        MATCH (n)-[r]->(m)
        WHERE id(n) IN $node_ids AND id(m) IN $node_ids
        RETURN n, r, m
        """

        with self._driver.session() as session:  # type: ignore
            # Get nodes
            node_result = session.run(
                node_query,
                entity_types=entity_types,
                limit=limit,
            )
            entities = [self._parse_node(record["n"]) for record in node_result]
            node_ids = [int(e.id) if e.id.isdigit() else -1 for e in entities]

            # Get edges
            edge_result = session.run(edge_query, node_ids=node_ids)
            edges = []
            for record in edge_result:
                rel = record["r"]
                source = record["n"]
                target = record["m"]
                props = dict(rel)
                edges.append(
                    CausalEdge(
                        id=props.get("id", str(rel.id)),
                        source_id=dict(source).get("id", str(source.id)),
                        target_id=dict(target).get("id", str(target.id)),
                        edge_type=rel.type,
                        properties=props,
                        weight=props.get("weight", 1.0),
                        created_at=props.get("created_at", datetime.now()),
                    )
                )

            return GraphSnapshot(
                entities=entities,
                edges=edges,
                timestamp=datetime.now(),
                metadata={
                    "entity_count": len(entities),
                    "edge_count": len(edges),
                    "entity_types": entity_types or [],
                },
            )

    def health_check(self) -> bool:
        """Check if Neo4j connection is healthy.

        Returns:
            True if connected and healthy, False otherwise
        """
        try:
            if not self._driver:
                self.connect()
            with self._driver.session() as session:  # type: ignore
                session.run("RETURN 1").single()
            return True
        except Exception:
            return False
