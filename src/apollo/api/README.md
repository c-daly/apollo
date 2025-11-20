# Apollo HCG API

REST API server for querying HCG (Hybrid Causal Graph) data from Neo4j.

## Overview

The Apollo HCG API provides read-only access to the LOGOS knowledge graph stored in Neo4j. It exposes endpoints for querying entities, states, processes, causal edges, plan history, and state history.

## Installation

The API server is included with the main Apollo package:

```bash
# Install Apollo with dependencies
pip install -e .
```

Dependencies:
- `fastapi>=0.104.0` - Web framework
- `uvicorn[standard]>=0.24.0` - ASGI server
- `neo4j>=5.0.0` - Neo4j driver
- `pydantic>=2.0.0` - Data validation

## Configuration

Configure Neo4j connection in `config.yaml`:

```yaml
hcg:
  neo4j:
    uri: bolt://localhost:7687
    user: neo4j
    password: password
```

Or use environment variables:
```bash
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=password
```

## Running the Server

### Using the CLI command:

```bash
apollo-api
```

### Using uvicorn directly:

```bash
uvicorn apollo.api.server:app --host 0.0.0.0 --port 8082
```

### Development mode with auto-reload:

```bash
uvicorn apollo.api.server:app --reload --host 0.0.0.0 --port 8082
```

The API will be available at `http://localhost:8082`

## API Endpoints

### Health Check

**GET** `/api/hcg/health`

Returns the health status of the API and Neo4j connection.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-20T10:30:00Z",
  "neo4j_connected": true
}
```

### Entities

**GET** `/api/hcg/entities`

Query entities from the HCG graph.

**Query Parameters:**
- `type` (optional): Filter by entity type
- `limit` (default: 100, max: 500): Number of entities to return
- `offset` (default: 0): Number of entities to skip

**Example:**
```bash
curl "http://localhost:8082/api/hcg/entities?type=goal&limit=10"
```

**Response:**
```json
[
  {
    "id": "goal_123",
    "type": "goal",
    "properties": {
      "name": "Navigate to kitchen",
      "priority": "high"
    },
    "labels": ["Goal"],
    "created_at": "2024-01-20T10:00:00Z"
  }
]
```

### Entity by ID

**GET** `/api/hcg/entities/{entity_id}`

Get a specific entity by its ID.

**Example:**
```bash
curl "http://localhost:8082/api/hcg/entities/goal_123"
```

### States

**GET** `/api/hcg/states`

Query state nodes from the HCG graph.

**Query Parameters:**
- `limit` (default: 100, max: 500)
- `offset` (default: 0)

**Example:**
```bash
curl "http://localhost:8082/api/hcg/states?limit=20"
```

### Processes

**GET** `/api/hcg/processes`

Query process nodes from the HCG graph.

**Query Parameters:**
- `status` (optional): Filter by status (pending, running, completed, failed)
- `limit` (default: 100, max: 500)
- `offset` (default: 0)

**Example:**
```bash
curl "http://localhost:8082/api/hcg/processes?status=running"
```

### Causal Edges

**GET** `/api/hcg/edges`

Query causal edges (relationships) from the HCG graph.

**Query Parameters:**
- `entity_id` (optional): Filter by source or target entity
- `edge_type` (optional): Filter by edge type
- `limit` (default: 100, max: 500)

**Example:**
```bash
curl "http://localhost:8082/api/hcg/edges?entity_id=goal_123&limit=50"
```

### Plan History

**GET** `/api/hcg/plans`

Query plan history from the HCG graph.

**Query Parameters:**
- `goal_id` (optional): Filter by goal ID
- `limit` (default: 10, max: 100)

**Example:**
```bash
curl "http://localhost:8082/api/hcg/plans?goal_id=goal_123"
```

**Response:**
```json
[
  {
    "id": "plan_456",
    "goal_id": "goal_123",
    "status": "completed",
    "steps": [
      {"name": "Move forward", "order": 1},
      {"name": "Turn left", "order": 2}
    ],
    "created_at": "2024-01-20T10:00:00Z",
    "started_at": "2024-01-20T10:01:00Z",
    "completed_at": "2024-01-20T10:05:00Z"
  }
]
```

### State History

**GET** `/api/hcg/history`

Query state change history from the HCG graph.

**Query Parameters:**
- `state_id` (optional): Filter by state ID
- `limit` (default: 50, max: 200)

**Example:**
```bash
curl "http://localhost:8082/api/hcg/history?limit=30"
```

**Response:**
```json
[
  {
    "id": "hist_789",
    "state_id": "state_101",
    "timestamp": "2024-01-20T10:02:00Z",
    "changes": {
      "position": {"x": 10, "y": 20}
    },
    "trigger": "plan_execution"
  }
]
```

### Graph Snapshot

**GET** `/api/hcg/snapshot`

Get a complete snapshot of the HCG graph including entities and edges.

**Query Parameters:**
- `entity_types` (optional): Comma-separated list of entity types to include
- `limit` (default: 200, max: 1000): Maximum number of entities

**Example:**
```bash
curl "http://localhost:8082/api/hcg/snapshot?entity_types=goal,plan&limit=100"
```

**Response:**
```json
{
  "entities": [...],
  "edges": [...],
  "timestamp": "2024-01-20T10:30:00Z",
  "metadata": {
    "entity_count": 45,
    "edge_count": 78,
    "entity_types": ["goal", "plan"]
  }
}
```

## CORS Configuration

The API has CORS enabled for all origins (`*`) in development. For production, update the CORS middleware in `server.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-production-domain.com"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)
```

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK` - Successful request
- `404 Not Found` - Entity not found
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Neo4j not available

Error responses include a detail message:

```json
{
  "detail": "HCG client not available"
}
```

## Integration with Web Dashboard

The web dashboard (`webapp/`) uses this API through TypeScript client hooks:

```typescript
// webapp/src/lib/hcg-client.ts
import { useGraphSnapshot } from '../hooks/useHCG'

const { data, isLoading, error } = useGraphSnapshot(['goal', 'plan'], 200)
```

Configure the API URL in `webapp/.env`:

```env
VITE_SOPHIA_API_URL=http://localhost:8082
```

## Performance Considerations

- All endpoints support pagination via `limit` and `offset`
- Default limits are conservative for browser performance
- Consider indexing commonly queried fields in Neo4j
- Use entity type filtering to reduce data transfer
- Monitor API latency via the telemetry dashboard

## Security Best Practices

1. **Authentication**: Add authentication middleware before production
2. **Rate Limiting**: Implement rate limiting for public endpoints
3. **Input Validation**: Already using Pydantic for request validation
4. **Read-Only**: API only performs read operations
5. **CORS**: Restrict origins in production
6. **HTTPS**: Use HTTPS in production with proper certificates

## Development

### Running Tests

```bash
# Run API tests
pytest tests/api/

# Run with coverage
pytest --cov=apollo.api tests/api/
```

### Code Quality

```bash
# Format code
black src/apollo/api/

# Lint code
ruff check src/apollo/api/

# Type check
mypy src/apollo/api/
```

## Troubleshooting

### Neo4j Connection Failed

```
neo4j_connected: false
```

**Solutions:**
1. Check Neo4j is running: `neo4j status`
2. Verify connection URI in config.yaml
3. Check credentials (user/password)
4. Test connection: `neo4j-admin ping`

### Import Errors

```
ModuleNotFoundError: No module named 'fastapi'
```

**Solution:**
```bash
pip install -e .
```

### Port Already in Use

```
Error: [Errno 48] Address already in use
```

**Solution:**
```bash
# Find process using port 8082
lsof -i :8082

# Kill the process
kill -9 <PID>

# Or use a different port
uvicorn apollo.api.server:app --port 8083
```

## Documentation

- API Documentation (Swagger UI): `http://localhost:8082/docs`
- ReDoc Documentation: `http://localhost:8082/redoc`
- OpenAPI JSON: `http://localhost:8082/openapi.json`

## Support

For issues or questions:
1. Check the main README: `../../README.md`
2. Review Phase 2 specification: `../../docs/phase2/PHASE2_SPEC.md`
3. See verification docs: `../../docs/phase2/VERIFY.md`
