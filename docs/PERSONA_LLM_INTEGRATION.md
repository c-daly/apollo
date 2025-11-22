# Persona Diary LLM Integration Guide

## Overview

The Persona Diary API provides structured entries capturing the agent's internal reasoning, decisions, beliefs, and observations. These entries can be surfaced to LLM-based chat interfaces to provide richer context about the agent's recent experiences and decision-making process.

## API Endpoints

### Get Persona Entries
```
GET /api/persona/entries   (Apollo → PersonaDiaryStore → Neo4j)
```

**Query Parameters:**
- `entry_type` - Filter by type: belief, decision, observation, reflection
- `sentiment` - Filter by sentiment: positive, negative, neutral, mixed
- `related_process_id` - Filter by related process
- `related_goal_id` - Filter by related goal
- `limit` - Maximum entries to return (default: 100, max: 500)
- `offset` - Number of entries to skip (for pagination)

**Example Response:**
```json
[
  {
    "id": "entry_1_1700000000",
    "timestamp": "2025-11-20T18:00:00Z",
    "entry_type": "decision",
    "content": "Decided to navigate to the kitchen based on user request",
    "summary": "Navigation decision for kitchen goal",
    "sentiment": "positive",
    "confidence": 0.95,
    "related_process_ids": ["proc_nav_123"],
    "related_goal_ids": ["goal_kitchen_456"],
    "emotion_tags": ["confident", "focused"],
    "metadata": {
      "context": "user_request",
      "priority": "high"
    }
  }
]
```

## LLM Prompt Integration

### Example: Adding Context to Chat Prompts

When processing a user query in the chat interface, retrieve recent persona entries to provide context. The example below calls Apollo’s API (`http://localhost:8082/api/persona/entries`), which serves data directly from the Neo4j-backed `PersonaDiaryStore`. If your deployment exposes the API on another host/port, update the base URL accordingly.

```python
import requests
from datetime import datetime, timedelta

def get_recent_persona_context(limit=10):
    """Fetch recent persona entries for LLM context."""
    response = requests.get(
        "http://localhost:8082/api/persona/entries",
        params={"limit": limit}
    )
    return response.json()

def build_chat_prompt(user_message, system_context=""):
    """Build an LLM prompt with persona diary context."""
    
    # Get recent persona entries
    persona_entries = get_recent_persona_context(limit=5)
    
    # Format persona context
    persona_context = "Recent Agent Activities:\n"
    for entry in persona_entries:
        persona_context += f"- [{entry['entry_type'].upper()}] {entry['content']}"
        if entry.get('sentiment'):
            persona_context += f" (sentiment: {entry['sentiment']})"
        if entry.get('confidence'):
            persona_context += f" (confidence: {entry['confidence']:.0%})"
        persona_context += "\n"
    
    # Build full prompt
    prompt = f"""System Context:
{system_context}

{persona_context}

User: {user_message}

## Chat Panel Metadata & Telemetry

The Apollo web chat now forwards every Hermes `/llm` invocation with a consistent metadata envelope so downstream services (Hermes, diagnostics, persona diary) can reason about the conversation context:

- `surface`: Always `apollo-webapp.chat-panel` for the browser UI.
- `version`: The `VITE_APP_VERSION` string baked into the build (defaults to `dev`).
- `session_id`: Stable UUID for the browser session so multiple turns can be stitched together.
- `message_count`: Number of messages in the trimmed history buffer that Hermes receives.
- `locale`, `timezone`, `user_agent`: Lightweight client hints for analytics and prompt adaptation.
- `hermes_provider_hint` / `hermes_model_hint`: Optional overrides derived from the `.env` LLM settings.

Once Hermes responds, the webapp measures round-trip latency, extracts token usage, and attaches persona sentiment (if Hermes populates `raw.persona.sentiment`). That telemetry is POSTed to `POST /api/diagnostics/llm`, allowing the diagnostics panel to display live LLM latency, token counts, and persona sentiment next to the existing API/plan metrics.

Finally, every successful chat turn is persisted to Sophia's persona diary via
`POST /api/persona/entries`. The entry text equals the Hermes completion, the summary
mirrors the latest user prompt, and the metadata block records the Hermes response ID,
provider, and model. This keeps Neo4j/Sophia aligned with what the operator sees in
the chat timeline.

### CLI Chat Command

The new `apollo-cli chat "..."` command uses the same integration stack:

1. Fetch the latest persona-diary entries (`--persona-limit` controls the count; use `--no-persona` to disable).
2. Append a formatted “Persona diary context” block to the Hermes system prompt.
3. Send metadata such as `persona_entry_ids`, entry-type/sentiment histograms, CLI version, and provider/model hints.
4. Emit latency + token usage telemetry back to `POST /api/diagnostics/llm` so the dashboard mirrors CLI conversations just like browser chats.
5. Persist each successful completion to `POST /api/persona/entries`, so Sophia's Neo4j store receives the same record the UI relies on.

Provider/model/temperature/max-token overrides can be supplied via `config.yaml` (under `hermes.*`) or ad-hoc CLI flags. This keeps the CLI, browser, and diagnostics timelines in sync whenever Hermes is consulted.
