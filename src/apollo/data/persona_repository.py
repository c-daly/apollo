"""Persistence adapter for PersonaEntry objects using Neo4j."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from neo4j import GraphDatabase, Driver

from apollo.config.settings import Neo4jConfig
from apollo.data.models import PersonaEntry


class PersonaRepository:
    """Persist and query persona diary entries from Neo4j."""

    def __init__(self, config: Neo4jConfig) -> None:
        self.config = config
        self._driver: Optional[Driver] = None

    def connect(self) -> None:
        if self._driver is None:
            self._driver = GraphDatabase.driver(
                self.config.uri,
                auth=(self.config.user, self.config.password),
            )

    def close(self) -> None:
        if self._driver:
            self._driver.close()
            self._driver = None

    def __enter__(self) -> "PersonaRepository":
        self.connect()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()

    def create_entry(self, entry: PersonaEntry) -> PersonaEntry:
        self._ensure_driver()
        query = """
        MERGE (entry:PersonaEntry {id: $id})
        SET entry.entry_type = $entry_type,
            entry.content = $content,
            entry.summary = $summary,
            entry.sentiment = $sentiment,
            entry.confidence = $confidence,
            entry.related_process_ids = $related_process_ids,
            entry.related_goal_ids = $related_goal_ids,
            entry.emotion_tags = $emotion_tags,
            entry.metadata = $metadata,
            entry.created_at = datetime($timestamp)
        RETURN entry
        """
        params: Dict[str, Any] = {
            "id": entry.id,
            "entry_type": entry.entry_type,
            "content": entry.content,
            "summary": entry.summary,
            "sentiment": entry.sentiment,
            "confidence": entry.confidence,
            "related_process_ids": entry.related_process_ids,
            "related_goal_ids": entry.related_goal_ids,
            "emotion_tags": entry.emotion_tags,
            "metadata": entry.metadata or {},
            "timestamp": entry.timestamp.isoformat(),
        }
        with self._driver.session() as session:  # type: ignore[union-attr]
            record = session.run(query, **params).single()
            if not record:
                raise RuntimeError("Neo4j returned no entry for persona create")
            return self._to_model(record["entry"])

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
        self._ensure_driver()
        query = """
        MATCH (entry:PersonaEntry)
        WHERE ($entry_type IS NULL OR entry.entry_type = $entry_type)
          AND ($sentiment IS NULL OR entry.sentiment = $sentiment)
          AND (
            $related_process_id IS NULL OR
            ANY(pid IN COALESCE(entry.related_process_ids, []) WHERE pid = $related_process_id)
          )
          AND (
            $related_goal_id IS NULL OR
            ANY(gid IN COALESCE(entry.related_goal_ids, []) WHERE gid = $related_goal_id)
          )
        RETURN entry
        ORDER BY entry.created_at DESC
        SKIP $offset
        LIMIT $limit
        """
        params: Dict[str, Any] = {
            "entry_type": entry_type,
            "sentiment": sentiment,
            "related_process_id": related_process_id,
            "related_goal_id": related_goal_id,
            "limit": limit,
            "offset": offset,
        }
        with self._driver.session() as session:  # type: ignore[union-attr]
            result = session.run(query, **params)
            return [self._to_model(record["entry"]) for record in result]

    def get_entry(self, entry_id: str) -> Optional[PersonaEntry]:
        self._ensure_driver()
        query = """
        MATCH (entry:PersonaEntry {id: $entry_id})
        RETURN entry
        """
        with self._driver.session() as session:  # type: ignore[union-attr]
            record = session.run(query, entry_id=entry_id).single()
            return self._to_model(record["entry"]) if record else None

    def _ensure_driver(self) -> None:
        if not self._driver:
            self.connect()

    def _to_model(self, node: Any) -> PersonaEntry:
        props = dict(node)
        timestamp = props.get("created_at") or props.get("timestamp")
        if timestamp is not None and hasattr(timestamp, "to_native"):
            timestamp = timestamp.to_native()
        elif isinstance(timestamp, str):
            timestamp = datetime.fromisoformat(timestamp)
        elif timestamp is None:
            timestamp = datetime.utcnow()
        return PersonaEntry(
            id=props.get("id", ""),
            timestamp=timestamp,
            entry_type=props.get("entry_type", "observation"),
            content=props.get("content", ""),
            summary=props.get("summary"),
            sentiment=props.get("sentiment"),
            confidence=props.get("confidence"),
            related_process_ids=props.get("related_process_ids", []),
            related_goal_ids=props.get("related_goal_ids", []),
            emotion_tags=props.get("emotion_tags", []),
            metadata=props.get("metadata", {}),
        )
