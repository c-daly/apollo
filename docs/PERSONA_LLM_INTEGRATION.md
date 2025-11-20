# Persona Diary LLM Integration Guide

## Overview

The Persona Diary API provides structured entries capturing the agent's internal reasoning, decisions, beliefs, and observations. These entries can be surfaced to LLM-based chat interfaces to provide richer context about the agent's recent experiences and decision-making process.

## API Endpoints

### Get Persona Entries
```
GET /api/persona/entries
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

When processing a user query in the chat interface, retrieve recent persona entries to provide context:

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