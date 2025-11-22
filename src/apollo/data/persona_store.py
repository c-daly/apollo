"""Neo4j-backed storage helpers for persona diary entries."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from neo4j import Driver, GraphDatabase

from apollo.config.settings import Neo4jConfig
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

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:  # type: ignore[override]
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
                metadata=entry.metadata,
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

    def _parse_node(self, node) -> PersonaEntry:
        """Convert a Neo4j node to a PersonaEntry."""
        props = dict(node)
        return PersonaEntry(
            id=props.get("id"),
            timestamp=props.get("timestamp"),
            entry_type=props.get("entry_type"),
            content=props.get("content"),
            summary=props.get("summary"),
            sentiment=props.get("sentiment"),
            confidence=props.get("confidence"),
            related_process_ids=props.get("related_process_ids", []),
            related_goal_ids=props.get("related_goal_ids", []),
            emotion_tags=props.get("emotion_tags", []),
            metadata=props.get("metadata", {}),
        )

    def _ensure_driver(self) -> None:
        if self._driver is None:
            self.connect()
