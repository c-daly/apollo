# Persona Diary Feature

The Persona Diary captures the agent's internal reasoning, decisions, beliefs, and observations, providing a narrative of its decision-making process for LLM-based chat interfaces.

## Overview

The Persona Diary API provides structured entries that can be surfaced to LLM prompts, giving the chat interface rich context about:
- Recent decisions and their confidence levels
- Belief updates about the world state
- Observations from sensors and interactions
- Reflective analysis of past performance

## Architecture

```
┌─────────────────────────────────────────────────┐
│              CLI / User Input                    │
│            apollo-cli diary                      │
└────────────────────┬────────────────────────────┘
                     │ HTTP POST
                     ▼
┌─────────────────────────────────────────────────┐
│           Apollo API Server                      │
│           (FastAPI - Port 8082)                  │
│                                                   │
│  POST   /api/persona/entries  (proxy to Sophia)  │
│  GET    /api/persona/entries  (proxy to Sophia)  │
│  GET    /api/persona/entries/{id}  (proxy)       │
│                                                   │
│  Storage: Sophia `/persona/entries` → Neo4j (:PersonaEntry) │
└────────────────────┬────────────────────────────┘
                     │ HTTP GET
                     ▼
┌─────────────────────────────────────────────────┐
│           Web UI / LLM Integration              │
│         PersonaDiary Component                   │
│         LLM Prompt Builder                       │
└─────────────────────────────────────────────────┘
```

## Sophia Persona Store

Sophia exposes `/persona/entries` endpoints that persist entries as `(:PersonaEntry)`
nodes inside its Neo4j knowledge graph. Apollo no longer writes to Neo4j directly—
the CLI and `apollo-api` simply forward create/list/get calls to Sophia, which
ensures diary data survives restarts, links to goals/processes, and stays consistent
with the rest of the cognitive state. Configure `persona_api` in `config.yaml`
to point at your Sophia deployment (host/port/API key), and Apollo will proxy
requests through the shared PersonaClient.

## Data Model

### PersonaEntry

```python
class PersonaEntry(BaseModel):
    id: str                           # Unique identifier
    timestamp: datetime               # Creation timestamp
    entry_type: str                   # belief, decision, observation, reflection
    content: str                      # Main narrative content
    summary: Optional[str]            # Brief summary
    sentiment: Optional[str]          # positive, negative, neutral, mixed
    confidence: Optional[float]       # 0.0-1.0 for decisions/beliefs
    related_process_ids: List[str]    # Linked process IDs
    related_goal_ids: List[str]       # Linked goal IDs
    emotion_tags: List[str]           # Emotion descriptors
    metadata: Dict[str, Any]          # Additional context
```

### Entry Types

- **belief**: Updates to the agent's understanding of the world
- **decision**: Choices made by the agent with reasoning
- **observation**: Information gathered from sensors or interactions
- **reflection**: Analysis of past performance or patterns

## CLI Usage

### Basic Entry
```bash
apollo-cli diary "Completed navigation task successfully"
```

### Full Entry with Options
```bash
apollo-cli diary "Analyzed spatial data and updated world model" \
  --type belief \
  --summary "Spatial model refinement" \
  --sentiment positive \
  --confidence 0.92 \
  --process proc_sense_1 proc_update_2 \
  --goal goal_explore \
  --emotion analytical confident
```

### All CLI Options

| Option | Description | Values |
|--------|-------------|--------|
| `--type` | Entry type | belief, decision, observation, reflection |
| `--summary` | Brief summary | Any text |
| `--sentiment` | Emotional tone | positive, negative, neutral, mixed |
| `--confidence` | Confidence level | 0.0 to 1.0 |
| `--process` | Related process IDs | Multiple allowed |
| `--goal` | Related goal IDs | Multiple allowed |
| `--emotion` | Emotion tags | Multiple allowed |

## API Usage

### Create Entry

```bash
curl -X POST http://localhost:8082/api/persona/entries \
  -H "Content-Type: application/json" \
  -d '{
    "entry_type": "decision",
    "content": "Selected path A over B due to shorter estimated time",
    "summary": "Path selection",
    "sentiment": "positive",
    "confidence": 0.87,
    "related_process_ids": ["proc_plan_123"],
    "related_goal_ids": ["goal_nav_456"],
    "emotion_tags": ["decisive", "focused"]
  }'
```

### List Entries

```bash
# Get all entries
curl http://localhost:8082/api/persona/entries

# Filter by type
curl "http://localhost:8082/api/persona/entries?entry_type=decision&limit=10"

# Filter by sentiment
curl "http://localhost:8082/api/persona/entries?sentiment=positive"

# Filter by related IDs
curl "http://localhost:8082/api/persona/entries?related_goal_id=goal_123"
```

### Get Specific Entry

```bash
curl http://localhost:8082/api/persona/entries/entry_1_1763665967
```

## Web UI Usage

1. **Start Services**
   ```bash
   # Terminal 1: API server
   apollo-api
   
   # Terminal 2: Web app
   cd webapp && npm run dev
   ```

2. **Access UI**
   - Navigate to http://localhost:5173
   - Click "Persona Diary" tab

3. **Features**
   - Search entries by text
   - Filter by entry type
   - Filter by sentiment
   - View entry metadata (confidence, emotions, links)
   - Refresh to reload from API

## LLM Integration

### Fetching Context for Prompts

```python
import requests

def get_persona_context(limit=5, entry_types=None):
    """Fetch recent persona entries for LLM context."""
    params = {"limit": limit}
    if entry_types:
        params["entry_type"] = entry_types
    
    response = requests.get(
        "http://localhost:8082/api/persona/entries",
        params=params
    )
    return response.json()

def build_llm_prompt(user_message):
    """Build prompt with persona diary context."""
    entries = get_persona_context(limit=5)
    
    context = "Recent Agent Activities:\n"
    for entry in entries:
        context += f"- [{entry['entry_type'].upper()}] {entry['content']}"
        if entry.get('confidence'):
            context += f" (confidence: {entry['confidence']:.0%})"
        context += "\n"
    
    prompt = f"""{context}

User: {user_message}
