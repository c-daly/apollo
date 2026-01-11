"""Neo4j-backed storage helpers for persona diary entries."""

from __future__ import annotations

import json
from datetime import datetime
from types import TracebackType
from typing import Any, Dict, List, Optional, Type

from neo4j import Driver, GraphDatabase
from neo4j.graph import Node

from apollo.config.settings import Neo4jConfig
from apollo.data.hcg_client import validate_entity_id
from apollo.data.models import PersonaEntry


class PersonaDiaryStore:
    """Persist and query persona diary entries in Neo4j."""

    def __init__(self, config: Neo4jConfig) -> None:
        self.config = config
        self._driver: Optional[Driver] = None

    def connect(self) -> None:
        """Establish a Neo4j connection."""
        if self._driver is None:
            self._driver = GraphDatabase.driver(
                self.config.uri,
                auth=(self.config.user, self.config.password),
            )

    def close(self) -> None:
        """Close the Neo4j connection."""
        if self._driver:
            self._driver.close()
            self._driver = None

    def __enter__(self) -> "PersonaDiaryStore":
        self.connect()
        return self

    def __exit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        self.close()

    def create_entry(self, entry: PersonaEntry) -> PersonaEntry:
        """Persist a persona diary entry and return the stored record."""
        self._ensure_driver()
        query = """
        CREATE (entry:PersonaEntry {
            id: $id,
            timestamp: $timestamp,
            entry_type: $entry_type,
            content: $content,
            summary: $summary,
            sentiment: $sentiment,
            confidence: $confidence,
            related_process_ids: $related_process_ids,
            related_goal_ids: $related_goal_ids,
            emotion_tags: $emotion_tags,
            metadata: $metadata
        })
        RETURN entry
        """

        with self._driver.session() as session:  # type: ignore[union-attr]
            record = session.run(
                query,
                id=entry.id,
                timestamp=entry.timestamp,
                entry_type=entry.entry_type,
                content=entry.content,
                summary=entry.summary,
                sentiment=entry.sentiment,
                confidence=entry.confidence,
                related_process_ids=entry.related_process_ids,
                related_goal_ids=entry.related_goal_ids,
                emotion_tags=entry.emotion_tags,
                metadata=json.dumps(entry.metadata) if entry.metadata else "{}",
            ).single()

        if not record:
            raise RuntimeError("Failed to persist persona entry")

        return self._parse_node(record["entry"])

    def list_entries(
        self,
        *,
        entry_type: Optional[str] = None,
        sentiment: Optional[str] = None,
        related_process_id: Optional[str] = None,
        related_goal_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[PersonaEntry]:
        """Fetch persona diary entries using the provided filters."""
        self._ensure_driver()

        # Validate string parameters to prevent injection
        if entry_type:
            validate_entity_id(entry_type)
        if sentiment:
            validate_entity_id(sentiment)
        if related_process_id:
            validate_entity_id(related_process_id)
        if related_goal_id:
            validate_entity_id(related_goal_id)

        query = """
        MATCH (entry:PersonaEntry)
        WHERE ($entry_type IS NULL OR entry.entry_type = $entry_type)
          AND ($sentiment IS NULL OR entry.sentiment = $sentiment)
          AND (
            $related_process_id IS NULL OR
            $related_process_id IN entry.related_process_ids
          )
          AND (
            $related_goal_id IS NULL OR
            $related_goal_id IN entry.related_goal_ids
          )
        RETURN entry
        ORDER BY entry.timestamp DESC
        SKIP $offset
        LIMIT $limit
        """

        with self._driver.session() as session:  # type: ignore[union-attr]
            result = session.run(
                query,
                entry_type=entry_type,
                sentiment=sentiment,
                related_process_id=related_process_id,
                related_goal_id=related_goal_id,
                limit=limit,
                offset=offset,
            )
            return [self._parse_node(record["entry"]) for record in result]

    def get_entry(self, entry_id: str) -> Optional[PersonaEntry]:
        """Fetch a single persona entry by ID."""
        self._ensure_driver()

        # Validate string parameter to prevent injection
        validate_entity_id(entry_id)

        query = """
        MATCH (entry:PersonaEntry {id: $entry_id})
        RETURN entry
        LIMIT 1
        """

        with self._driver.session() as session:  # type: ignore[union-attr]
            record = session.run(query, entry_id=entry_id).single()
            return self._parse_node(record["entry"]) if record else None

    def latest_entry_timestamp(self) -> Optional[datetime]:
        """Return the most recent entry timestamp, if any."""
        self._ensure_driver()
        query = """
        MATCH (entry:PersonaEntry)
        RETURN entry.timestamp AS ts
        ORDER BY entry.timestamp DESC
        LIMIT 1
        """
        with self._driver.session() as session:  # type: ignore[union-attr]
            record = session.run(query).single()
            return record["ts"] if record else None

    def recent_entries(self, limit: int = 5) -> List[PersonaEntry]:
        """Return the most recent persona entries."""
        return self.list_entries(limit=limit, offset=0)

    def _parse_node(self, node: Node) -> PersonaEntry:
        """Convert a Neo4j node into a PersonaEntry model."""
        props: Dict[str, Any] = dict(node)

        node_id = props.get("id")
        if not isinstance(node_id, str):
            raise ValueError("PersonaEntry node missing string 'id'")

        timestamp_value = props.get("timestamp")
        if timestamp_value is None:
            raise ValueError(
                f"PersonaEntry node {node_id} missing 'timestamp' property"
            )

        if isinstance(timestamp_value, datetime):
            timestamp = timestamp_value
        elif hasattr(timestamp_value, "to_native"):
            timestamp = timestamp_value.to_native()
        elif isinstance(timestamp_value, str):
            timestamp = datetime.fromisoformat(timestamp_value)
        else:
            raise ValueError(
                f"PersonaEntry node {node_id} has invalid 'timestamp' type: {type(timestamp_value)}"
            )

        entry_type = props.get("entry_type")
        if not isinstance(entry_type, str):
            raise ValueError("PersonaEntry node missing string 'entry_type'")

        content = props.get("content")
        if not isinstance(content, str):
            raise ValueError("PersonaEntry node missing string 'content'")

        def _string_list(value: Any) -> List[str]:
            if isinstance(value, list):
                return [str(item) for item in value]
            if value is None:
                return []
            return [str(value)]

        metadata_value = props.get("metadata")
        metadata: Dict[str, Any] = {}
        if isinstance(metadata_value, dict):
            metadata = dict(metadata_value)
        elif isinstance(metadata_value, str):
            try:
                metadata = json.loads(metadata_value)
            except json.JSONDecodeError:
                pass

        return PersonaEntry(
            id=node_id,
            timestamp=timestamp,
            entry_type=entry_type,
            content=content,
            summary=props.get("summary"),
            sentiment=props.get("sentiment"),
            confidence=props.get("confidence"),
            related_process_ids=_string_list(props.get("related_process_ids")),
            related_goal_ids=_string_list(props.get("related_goal_ids")),
            emotion_tags=_string_list(props.get("emotion_tags")),
            metadata=metadata,
        )

    def _ensure_driver(self) -> None:
        if self._driver is None:
            self.connect()
