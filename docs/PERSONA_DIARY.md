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
│                                                 │
│  POST   /api/persona/entries  ┐                 │
│  GET    /api/persona/entries  │  REST           │
│  GET    /api/persona/entries/{id}               │
│  WS     /ws/diagnostics  (persona_entry events) │
│                                                 │
│  Storage: PersonaDiaryStore → Neo4j (:PersonaEntry) │
└────────────────────┬────────────────────────────┘
                     │ Bolt
                     ▼
┌─────────────────────────────────────────────────┐
│              Neo4j (LOGOS HCG)                   │
│        (:PersonaEntry nodes + relationships)     │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│           Web UI / LLM Integration              │
│         PersonaDiary Component                  │
│         LLM Prompt Builder                      │
└─────────────────────────────────────────────────┘
```

## Persona Diary Store

Apollo now persists diary entries through `PersonaDiaryStore`, which writes
`(:PersonaEntry)` nodes directly into the LOGOS Neo4j instance (the same one
backing the Hybrid Causal Graph). The FastAPI server keeps a long-lived
connection to Neo4j, and every POST immediately emits a `persona_entry`
diagnostics event so the webapp reflects changes without a manual refresh.

Configure Neo4j credentials under the `hcg.neo4j` block in `config.yaml`. When
you run `scripts/run_apollo.sh` the Neo4j + Milvus dev containers are started
automatically (if necessary) before the API/webapp boot, so the diary store is
ready as soon as the UI loads.

## Data Model

### PersonaEntry

```python
class PersonaEntry(BaseModel):
    id: str                           # Unique identifier
    timestamp: datetime               # Creation timestamp
    entry_type: str                   # belief, decision, observation, reflection
    trigger: Optional[str]            # What caused this entry (e.g., 'error', 'user_request', 'self_model', 'meta')
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

### Trigger Field

The optional `trigger` field (free-form text) describes what caused the entry to be created. Common values for reflections include:

- **error** - Plan failure or mistake
- **user_request** - Explicit user instruction
- **correction** - User corrected the agent
- **session_boundary** - Conversation start/end
- **milestone** - Goal completion or achievement
- **self_model** - Reflection about agent's own capabilities/limitations
- **user_model** - Understanding of user preferences/patterns
- **strategy** - Analysis of approach effectiveness
- **learning** - Lessons from experience
- **meta** - Aggregate pattern analysis across multiple entries

For observations, triggers might describe the source (e.g., `chat_turn`, `sensor_reading`, `plan_execution`).

## CLI Usage

### Basic Entry
```bash
apollo-cli diary "Completed navigation task successfully"
```

### Full Entry with Options
```bash
apollo-cli diary "Analyzed spatial data and updated world model" \
  --type belief \
  --trigger "sensor_reading" \
  --summary "Spatial model refinement" \
  --sentiment positive \
  --confidence 0.92 \
  --process proc_sense_1 proc_update_2 \
  --goal goal_explore \
  --emotion analytical confident
```

### Reflection Entry Example
```bash
apollo-cli diary "Made incorrect assumption about user intent, need to ask clarifying questions earlier" \
  --type reflection \
  --trigger "error" \
  --sentiment neutral \
  --confidence 0.75
```

### All CLI Options

| Option | Description | Values |
|--------|-------------|--------|
| `--type` | Entry type | belief, decision, observation, reflection |
| `--trigger` | What caused this entry | Free-form text (e.g., 'error', 'user_request', 'self_model') |
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
    "trigger": "plan_execution",
    "content": "Selected path A over B due to shorter estimated time",
    "summary": "Path selection",
    "sentiment": "positive",
    "confidence": 0.87,
    "related_process_ids": ["proc_plan_123"],
    "related_goal_ids": ["goal_nav_456"],
    "emotion_tags": ["decisive", "focused"]
  }'
```

### Create Reflection Entry

```bash
curl -X POST http://localhost:8082/api/persona/entries \
  -H "Content-Type: application/json" \
  -d '{
    "entry_type": "reflection",
    "trigger": "error",
    "content": "Repeatedly failed to validate user input format. Need to add explicit validation step before processing.",
    "summary": "Input validation lesson",
    "sentiment": "neutral",
    "confidence": 0.80,
    "emotion_tags": ["analytical", "learning"]
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

1. **Start services (Neo4j + API + Web)**
   ```bash
   ./scripts/run_apollo.sh
   ```
   The script installs dependencies via Poetry/npm if needed, ensures the Neo4j/Milvus
   dev containers are running, then launches `apollo-api` and `npm run dev`.

2. **Access UI**
   - Navigate to http://localhost:3000 (default Vite port)
   - Click "Persona Diary"

3. **Features**
   - Search entries by text
   - Filter by entry type or sentiment
   - Inspect metadata (confidence, emotions, related goals/processes)
   - Live updates via diagnostics stream (no manual refresh needed)

4. **Verify streaming**
   - Create an entry via the CLI (`apollo-cli diary ...`) or the POST request above.
   - Observe the entry appear instantly in the web UI.
   - Optional: connect to `/ws/diagnostics` using `wscat` and watch for
     `{"type":"persona_entry", ...}` events.

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

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `503 persona store not available` when calling the API | Neo4j container isn’t running or credentials are wrong | Run `./scripts/run_apollo.sh` (it ensures Neo4j is up) or verify `hcg.neo4j` settings in `config.yaml`. |
| Diary tab never updates after creating entries | Diagnostics WebSocket unreachable | Confirm the browser can reach `/ws/diagnostics` (check console), and verify the FastAPI server logs “Diagnostics websocket connected”. |
| Tests fail with `ModuleNotFoundError: httpx` | FastAPI test client dependency missing | Install deps via Poetry (`poetry install`) or ensure CI uses Poetry so `httpx` is available. |
| Need sample data | Use `apollo-cli diary ...` or `scripts/dev/create_persona_samples.py` (if available) to seed entries, or POST directly to `/api/persona/entries`. |

When in doubt, re-run `./scripts/run_apollo.sh` to restart the API/webapp stack with the correct dependencies.
