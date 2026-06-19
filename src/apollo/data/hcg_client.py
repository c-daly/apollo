"""Neo4j client for read-only HCG graph queries."""

import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

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


def validate_entity_id(entity_id: str) -> str:
    """Validate and sanitize entity ID to prevent injection attacks.

    Args:
        entity_id: The entity identifier to validate

    Returns:
        Sanitized entity ID

    Raises:
        ValueError: If entity_id is invalid
    """
    if not entity_id or not isinstance(entity_id, str):
        raise ValueError("Invalid entity ID: must be a non-empty string")

    # Strip whitespace
    entity_id = entity_id.strip()

    if not entity_id:
        raise ValueError("Invalid entity ID: cannot be empty or whitespace")

    # Length limit (256 chars is reasonable for IDs)
    if len(entity_id) > 256:
        raise ValueError("Invalid entity ID: exceeds maximum length of 256 characters")

    # Whitelist approach: only allow safe characters
    # Allow: alphanumeric, hyphens, underscores, dots, colons (for UUIDs and namespaced IDs)
    # This blocks quotes, slashes, backslashes, null bytes, and other injection vectors
    if not re.match(r"^[\w\-.:]+$", entity_id):
        raise ValueError("Invalid entity ID: contains invalid characters")

    return entity_id


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

    def _convert_value(self, value: Any) -> Any:
        """Convert Neo4j types to Python native types."""
        if value is None:
            return None
        if hasattr(value, "to_native"):
            return value.to_native()
        if isinstance(value, bytes):
            try:
                return value.decode("utf-8")
            except UnicodeDecodeError:
                return f"<bytes len={len(value)}>"
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value)
            except ValueError:
                pass
        return value

    def _parse_json_field(self, value: Any, default: Any = None) -> Any:
        """Parse JSON string field if necessary."""
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return default
        return value if value is not None else default

    def _sanitize_props(self, props: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively convert Neo4j types to Python native types in a dictionary."""
        sanitized: Dict[str, Any] = {}
        for key, value in props.items():
            if isinstance(value, dict):
                sanitized[key] = self._sanitize_props(value)
            elif isinstance(value, list):
                sanitized[key] = [
                    (
                        self._sanitize_props(item)
                        if isinstance(item, dict)
                        else self._convert_value(item)
                    )
                    for item in value
                ]
            else:
                sanitized[key] = self._convert_value(value)
        return sanitized

    def _parse_node(self, node: Any) -> Entity:
        """Parse Neo4j node into Entity model.

        Args:
            node: Neo4j node object

        Returns:
            Entity model
        """
        properties = dict(node)
        return Entity(
            # LOGOS nodes key on a stable `uuid`; fall back to a legacy `id`
            # property, then the (unstable) internal node id as a last resort.
            id=properties.get("id") or properties.get("uuid") or str(node.id),
            type=properties.get("type", "unknown"),
            properties=self._sanitize_props(properties),
            labels=list(node.labels),
            created_at=self._convert_value(properties.get("created_at")),
            updated_at=self._convert_value(properties.get("updated_at")),
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
            properties=self._sanitize_props(properties),
            weight=properties.get("weight", 1.0),
            created_at=self._convert_value(properties.get("created_at"))
            or datetime.now(timezone.utc),
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
        entity_id = validate_entity_id(entity_id)

        if not self._driver:
            self.connect()

        query = """
        MATCH (n)
        WHERE n.id = $entity_id OR n.uuid = $entity_id OR id(n) = $node_id
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
                        variables=self._parse_json_field(props.get("variables"), {}),
                        timestamp=self._convert_value(props.get("timestamp"))
                        or datetime.now(timezone.utc),
                        properties=self._sanitize_props(props),
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
                        inputs=self._parse_json_field(props.get("inputs"), []),
                        outputs=self._parse_json_field(props.get("outputs"), []),
                        properties=self._sanitize_props(props),
                        created_at=self._convert_value(props.get("created_at"))
                        or datetime.now(timezone.utc),
                        completed_at=self._convert_value(props.get("completed_at")),
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

        # Validate string parameters to prevent injection
        if entity_id:
            entity_id = validate_entity_id(entity_id)
        if edge_type:
            edge_type = validate_entity_id(edge_type)

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
                        properties=self._sanitize_props(props),
                        weight=props.get("weight", 1.0),
                        created_at=self._convert_value(props.get("created_at"))
                        or datetime.now(timezone.utc),
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

        # Validate string parameters to prevent injection
        if goal_id:
            goal_id = validate_entity_id(goal_id)

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

                steps_raw = self._parse_json_field(props.get("steps"), [])
                steps = [
                    self._sanitize_props(s) if isinstance(s, dict) else s
                    for s in steps_raw
                ]

                result_raw = self._parse_json_field(props.get("result"))
                plan_result = (
                    self._sanitize_props(result_raw)
                    if isinstance(result_raw, dict)
                    else result_raw
                )

                plans.append(
                    PlanHistory(
                        id=props.get("id", str(node.id)),
                        goal_id=props.get("goal_id", ""),
                        status=props.get("status", "pending"),
                        steps=steps,
                        created_at=self._convert_value(props.get("created_at"))
                        or datetime.now(timezone.utc),
                        started_at=self._convert_value(props.get("started_at")),
                        completed_at=self._convert_value(props.get("completed_at")),
                        result=plan_result,
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

        # Validate string parameters to prevent injection
        if state_id:
            state_id = validate_entity_id(state_id)

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

                changes_raw = self._parse_json_field(props.get("changes"), {})
                changes = (
                    self._sanitize_props(changes_raw)
                    if isinstance(changes_raw, dict)
                    else changes_raw
                )

                prev_raw = self._parse_json_field(props.get("previous_values"))
                previous_values = (
                    self._sanitize_props(prev_raw)
                    if isinstance(prev_raw, dict)
                    else prev_raw
                )

                history.append(
                    StateHistory(
                        id=props.get("id", str(node.id)),
                        state_id=props.get("state_id", ""),
                        timestamp=self._convert_value(props.get("timestamp"))
                        or datetime.now(timezone.utc),
                        changes=changes,
                        previous_values=previous_values,
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

        # Validate string parameters to prevent injection
        if entity_types:
            entity_types = [
                validate_entity_id(entity_type) for entity_type in entity_types
            ]

        # Get entities
        if entity_types:
            node_query = """
            MATCH (n)
            WHERE n.type IN $entity_types
            RETURN n, id(n) as internal_id
            LIMIT $limit
            """
        else:
            node_query = """
            MATCH (n)
            RETURN n, id(n) as internal_id
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

            entities = []
            node_ids = []
            for record in node_result:
                entities.append(self._parse_node(record["n"]))
                node_ids.append(record["internal_id"])

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
                        properties=self._sanitize_props(props),
                        weight=props.get("weight", 1.0),
                        created_at=self._convert_value(props.get("created_at"))
                        or datetime.now(timezone.utc),
                    )
                )

            return GraphSnapshot(
                entities=entities,
                edges=edges,
                timestamp=datetime.now(timezone.utc),
                metadata={
                    "entity_count": len(entities),
                    "edge_count": len(edges),
                    "entity_types": entity_types or [],
                },
            )

    # ------------------------------------------------------------------
    # Scoped / de-reified graph queries (CLI + explorer share this layer)
    # ------------------------------------------------------------------
    def get_graph_stats(self) -> Dict[str, Any]:
        """Counts that let a client size the graph before fetching any of it.

        Separates *content* nodes (the logical graph) from reified *edge-nodes*
        (predicate/IS_A edges stored as nodes), so a UI/CLI can show real scale
        (content) vs storage scale (all nodes) without loading the graph.
        """
        if not self._driver:
            self.connect()
        with self._driver.session() as session:  # type: ignore
            totals = session.run(
                """
                MATCH (n)
                RETURN count(n) AS total,
                       count(CASE WHEN n.relation IS NULL THEN 1 END) AS content,
                       count(CASE WHEN n.relation IS NOT NULL THEN 1 END) AS edges
                """
            ).single()
            type_row = session.run(
                "MATCH (n) WHERE n.type = 'type_definition' RETURN count(n) AS c"
            ).single()
            by_realm = {
                r["realm"]: r["c"]
                for r in session.run(
                    "MATCH (n) WHERE n.relation IS NULL AND n.type IS NOT NULL "
                    "RETURN n.type AS realm, count(n) AS c ORDER BY c DESC"
                )
            }
            top_predicates = {
                r["rel"]: r["c"]
                for r in session.run(
                    "MATCH (n) WHERE n.relation IS NOT NULL "
                    "RETURN n.relation AS rel, count(n) AS c ORDER BY c DESC LIMIT 20"
                )
            }
        return {
            "total_nodes": totals["total"] if totals else 0,
            "content_nodes": totals["content"] if totals else 0,
            "edge_nodes": totals["edges"] if totals else 0,
            "type_definitions": type_row["c"] if type_row else 0,
            "by_realm": by_realm,
            "top_predicates": top_predicates,
        }

    def get_type_summaries(self, limit: int = 500) -> List[Dict[str, Any]]:
        """The positional type layer, computed server-side.

        A type is *any node something IS_A's* (positional typing) — not a node
        tagged ``type_definition`` — so emergent types are included. Each row
        carries the type's member count (incoming IS_A) and its parent type.
        """
        if not self._driver:
            self.connect()
        query = """
        MATCH (isa:Node {relation:'IS_A'})-[:TO]->(t)
        WITH t, count(DISTINCT isa) AS member_count
        OPTIONAL MATCH (t)<-[:FROM]-(pe:Node {relation:'IS_A'})-[:TO]->(parent)
        RETURN t.uuid AS uuid, t.name AS name, member_count, parent.name AS parent
        ORDER BY member_count DESC, name
        LIMIT $limit
        """
        with self._driver.session() as session:  # type: ignore
            return [
                {
                    "uuid": r["uuid"],
                    "name": r["name"],
                    "member_count": r["member_count"],
                    "parent": r["parent"],
                }
                for r in session.run(query, limit=limit)
            ]

    def get_neighborhood(
        self,
        node_id: str,
        depth: int = 1,
        limit: int = 100,
    ) -> GraphSnapshot:
        """De-reified logical neighborhood of a node, scoped by depth + limit.

        Collapses reified edge-nodes back to logical edges (src --predicate-->
        tgt) and returns only content nodes, so a client can expand the graph one
        neighborhood at a time instead of loading the whole thing. ``depth`` is
        clamped to [1, 4]; expansion stops once ``limit`` nodes are collected.
        """
        node_id = validate_entity_id(node_id)
        depth = max(1, min(depth, 4))
        if not self._driver:
            self.connect()

        expand = """
        UNWIND $roots AS rid
        MATCH (root {uuid: rid})
        MATCH (e)-[:FROM|TO]->(root) WHERE e.relation IS NOT NULL
        MATCH (e)-[:FROM]->(src) MATCH (e)-[:TO]->(tgt)
        RETURN DISTINCT e, src, tgt
        """
        entities: Dict[str, Entity] = {}
        edges: Dict[str, CausalEdge] = {}
        frontier: List[str] = [node_id]
        seen_roots: set = set()

        with self._driver.session() as session:  # type: ignore
            root_rec = session.run(
                "MATCH (root {uuid: $rid}) RETURN root LIMIT 1",
                rid=node_id,
            ).single()
            if root_rec:
                root = self._parse_node(root_rec["root"])
                entities[root.id] = root

            for _ in range(depth):
                roots = [r for r in frontier if r not in seen_roots]
                seen_roots.update(roots)
                if not roots or len(entities) >= limit:
                    break
                next_frontier: List[str] = []
                for rec in session.run(expand, roots=roots):
                    src = self._parse_node(rec["src"])
                    tgt = self._parse_node(rec["tgt"])
                    props = dict(rec["e"])
                    for node in (src, tgt):
                        if node.id not in entities and len(entities) < limit:
                            entities[node.id] = node
                            next_frontier.append(node.id)
                    edge_id = props.get("uuid", str(rec["e"].id))
                    edges[edge_id] = CausalEdge(
                        id=edge_id,
                        source_id=src.id,
                        target_id=tgt.id,
                        edge_type=props.get("relation", "RELATED"),
                        properties=self._sanitize_props(props),
                        weight=props.get("weight", 1.0),
                        created_at=self._convert_value(props.get("created_at"))
                        or datetime.now(timezone.utc),
                    )
                frontier = next_frontier

        node_ids = set(entities)
        kept_edges = [
            e
            for e in edges.values()
            if e.source_id in node_ids and e.target_id in node_ids
        ]
        return GraphSnapshot(
            entities=list(entities.values()),
            edges=kept_edges,
            timestamp=datetime.now(timezone.utc),
            metadata={
                "root": node_id,
                "depth": depth,
                "entity_count": len(entities),
                "edge_count": len(kept_edges),
                "reified": False,
            },
        )

    def search_nodes(self, query: str, limit: int = 25) -> List[Entity]:
        """Find content nodes whose name contains *query* (or whose uuid equals
        it) — entry points for navigating a large graph."""
        if not self._driver:
            self.connect()
        q = (query or "").strip()
        if not q:
            return []
        cypher = """
        MATCH (n)
        WHERE n.relation IS NULL
          AND ((n.name IS NOT NULL AND toLower(n.name) CONTAINS toLower($q))
               OR n.uuid = $q)
        RETURN n
        ORDER BY n.name
        LIMIT $limit
        """
        with self._driver.session() as session:  # type: ignore
            return [
                self._parse_node(rec["n"])
                for rec in session.run(cypher, q=q, limit=limit)
            ]

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
