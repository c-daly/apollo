# HCG Visualization Data Layer

This document describes the HCG (Hybrid Causal Graph) visualization data layer in Apollo, which provides read-only access to Neo4j data for visualization and monitoring.

## Architecture

The data layer consists of three main components:

1. **Python Backend** (`src/apollo/data/`)
   - Neo4j read-only client
   - WebSocket server for real-time updates
   - SHACL-compliant data models

2. **TypeScript Frontend** (`webapp/src/lib/`, `webapp/src/hooks/`)
   - API client for REST queries
   - WebSocket client for real-time updates
   - React hooks with TanStack Query

3. **React Components** (`webapp/src/components/`)
   - Graph visualization (Cytoscape.js)
   - Status monitoring view
   - History timeline view

## Python Backend

### Data Models

The HCG ontology is represented by the following models in `src/apollo/data/models.py`, now aligned with the **Unified CWM State Contract** (see `logos/docs/hcg/CWM_SPEC.md`):

- **CWMState**: The unified envelope for all world model emissions.
- **CWM-A (Abstract)**:
    - **Entity**: Base entity in the HCG graph
    - **State**: Agent or world state snapshot
    - **Process**: Action or transformation
- **CWM-G (Generative)**:
    - **PerceptionFrame**: Raw sensor data
    - **ImaginedState**: Predicted future state
- **CWM-E (Emotional)**:
    - **PersonaEntry**: Diary/reflection entry
    - **EmotionState**: Affective tags

All models follow the HCG ontology specification (Section 4.1) and are SHACL-compliant.

### CWM State Integration

The data layer now exposes a unified stream of `CWMState` objects. This allows the frontend to render mixed timelines of abstract plans, generative predictions, and emotional reflections without custom parsers for each type.

```typescript
interface CWMState<T> {
  state_id: string;
  model_type: 'cwm-a' | 'cwm-g' | 'cwm-e';
  timestamp: string;
  status: 'hypothetical' | 'observed' | 'validated' | 'rejected';
  data: T;
}
```

### Neo4j Client

The `HCGClient` in `src/apollo/data/hcg_client.py` provides read-only queries:

```python
from apollo.config.settings import Neo4jConfig
from apollo.data import HCGClient

# Create client
config = Neo4jConfig(
    uri="bolt://localhost:7687",
    user="neo4j",
    password="password"
)

# Use as context manager
with HCGClient(config) as client:
    # Get entities
    entities = client.get_entities(entity_type="goal", limit=10)
    
    # Get states
    states = client.get_states(limit=50)
    
    # Get processes
    processes = client.get_processes(status="completed")
    
    # Get causal edges
    edges = client.get_causal_edges(entity_id="goal_123")
    
    # Get plan history
    plans = client.get_plan_history(goal_id="goal_123")
    
    # Get state history
    history = client.get_state_history(state_id="state_456")
    
    # Get graph snapshot
    snapshot = client.get_graph_snapshot(limit=200)
```

### WebSocket Server

The WebSocket server provides real-time updates:

```python
from apollo.config.settings import Neo4jConfig
from apollo.data.websocket_server import start_websocket_server

config = Neo4jConfig(
    uri="bolt://localhost:7687",
    user="neo4j",
    password="password"
)

# Start WebSocket server on port 8765
start_websocket_server(config, host="localhost", port=8765)
```

The server broadcasts updates when:
- New state changes are detected
- Graph structure changes
- Entities are created or modified

## TypeScript Frontend

### API Client

The `HCGAPIClient` in `webapp/src/lib/hcg-client.ts` provides REST API access:

```typescript
import { hcgClient } from '@/lib/hcg-client';

// Get entities
const entities = await hcgClient.getEntities('goal', 10, 0);

// Get entity by ID
const entity = await hcgClient.getEntityById('goal_123');

// Get states
const states = await hcgClient.getStates(50, 0);

// Get processes
const processes = await hcgClient.getProcesses('completed', 10, 0);

// Get causal edges
const edges = await hcgClient.getCausalEdges('goal_123');

// Get plan history
const plans = await hcgClient.getPlanHistory('goal_123');

// Get state history
const history = await hcgClient.getStateHistory('state_456');

// Get graph snapshot
const snapshot = await hcgClient.getGraphSnapshot(['goal', 'state'], 200);

// Health check
const isHealthy = await hcgClient.healthCheck();
```

### WebSocket Client

The `HCGWebSocketClient` in `webapp/src/lib/websocket-client.ts` manages real-time connections:

```typescript
import { hcgWebSocket } from '@/lib/websocket-client';

// Connect to WebSocket
hcgWebSocket.connect();

// Listen for messages
const unsubscribe = hcgWebSocket.onMessage((message) => {
  if (message.type === 'snapshot') {
    console.log('Received snapshot:', message.data);
  } else if (message.type === 'update') {
    console.log('Received update:', message.data);
  }
});

// Refresh data
hcgWebSocket.refresh();

// Check connection status
const isConnected = hcgWebSocket.isConnected();

// Disconnect
hcgWebSocket.disconnect();

// Cleanup
unsubscribe();
```

## React Hooks

### Data Fetching Hooks

The `useHCG.ts` hooks provide data fetching with TanStack Query:

```typescript
import {
  useEntities,
  useEntity,
  useStates,
  useProcesses,
  useCausalEdges,
  usePlanHistory,
  useStateHistory,
  useGraphSnapshot,
  useHCGHealth,
} from '@/hooks/useHCG';

function MyComponent() {
  // Fetch entities
  const { data: entities, isLoading, error } = useEntities('goal', 10, 0);
  
  // Fetch specific entity
  const { data: entity } = useEntity('goal_123');
  
  // Fetch states
  const { data: states } = useStates(50, 0);
  
  // Fetch processes
  const { data: processes } = useProcesses('completed', 10, 0);
  
  // Fetch causal edges
  const { data: edges } = useCausalEdges('goal_123');
  
  // Fetch plan history
  const { data: plans } = usePlanHistory('goal_123');
  
  // Fetch state history
  const { data: history } = useStateHistory('state_456');
  
  // Fetch graph snapshot
  const { data: snapshot } = useGraphSnapshot(['goal', 'state'], 200);
  
  // Check health
  const { data: isHealthy } = useHCGHealth();
  
  // ... use data
}
```

### WebSocket Hook

The `useWebSocket` hook manages WebSocket connections:

```typescript
import { useWebSocket } from '@/hooks/useWebSocket';

function MyComponent() {
  const { connected, lastMessage, connect, disconnect, refresh } = useWebSocket({
    autoConnect: true,
    onSnapshot: (snapshot) => {
      console.log('Received snapshot:', snapshot);
    },
    onUpdate: (update) => {
      console.log('Received update:', update);
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
  });
  
  // Connection status
  if (!connected) {
    return <div>Connecting to WebSocket...</div>;
  }
  
  // ... use data
}
```

## React Components

### HCG Graph Component

The `HCGGraph` component renders the causal graph using Cytoscape.js:

```typescript
import { HCGGraph } from '@/components';
import { useGraphSnapshot } from '@/hooks/useHCG';

function GraphView() {
  const { data: snapshot, isLoading } = useGraphSnapshot();
  
  if (isLoading || !snapshot) {
    return <div>Loading graph...</div>;
  }
  
  return (
    <HCGGraph
      snapshot={snapshot}
      width="100%"
      height="600px"
      onNodeClick={(nodeId) => console.log('Clicked node:', nodeId)}
      onEdgeClick={(edgeId) => console.log('Clicked edge:', edgeId)}
    />
  );
}
```

### Status View Component

The `StatusView` component displays current states and processes:

```typescript
import { StatusView } from '@/components';
import { useStates, useProcesses } from '@/hooks/useHCG';

function StatusMonitor() {
  const { data: states, isLoading: statesLoading, error: statesError } = useStates();
  const { data: processes, isLoading: processesLoading, error: processesError } = useProcesses();
  
  return (
    <StatusView
      states={states}
      processes={processes}
      loading={statesLoading || processesLoading}
      error={statesError || processesError}
    />
  );
}
```

### History View Component

The `HistoryView` component shows plan and state history:

```typescript
import { HistoryView } from '@/components';
import { usePlanHistory, useStateHistory } from '@/hooks/useHCG';

function HistoryTimeline() {
  const { data: plans, isLoading: plansLoading, error: plansError } = usePlanHistory();
  const { data: stateHistory, isLoading: historyLoading, error: historyError } = useStateHistory();
  
  return (
    <HistoryView
      planHistory={plans}
      stateHistory={stateHistory}
      loading={plansLoading || historyLoading}
      error={plansError || historyError}
    />
  );
}
```

## Configuration

### Python Configuration

Configure Neo4j connection in `config.yaml`:

```yaml
hcg:
  neo4j:
    uri: bolt://localhost:7687
    user: neo4j
    password: password
```

### TypeScript Configuration

Configure API endpoints in client initialization:

```typescript
import { HCGAPIClient } from '@/lib/hcg-client';

const client = new HCGAPIClient({
  baseUrl: 'http://localhost:8080',
  timeout: 30000,
});
```

Configure WebSocket URL:

```typescript
import { HCGWebSocketClient } from '@/lib/websocket-client';

const wsClient = new HCGWebSocketClient({
  url: 'ws://localhost:8765',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
});
```

## HCG Ontology Compliance

The data layer follows the HCG ontology specification (Section 4.1):

1. **Entities**: Nodes in the graph with types (goal, state, process, etc.)
2. **Causal Edges**: Directed edges representing causal relationships
3. **Properties**: SHACL-compliant property structures
4. **Temporal Data**: Timestamps for states and events
5. **History Tracking**: Plan and state change history

All queries return SHACL-compliant data structures that match the HCG schema.

## Testing

Run tests for the Python data layer:

```bash
pytest tests/test_hcg_client.py -v
```

Run TypeScript type checking:

```bash
cd webapp
npm run type-check
```

Run linting:

```bash
# Python
black src/apollo/data tests/test_hcg_client.py
ruff check src/apollo/data tests/test_hcg_client.py

# TypeScript
cd webapp
npm run lint
```

## Next Steps

1. **API Endpoints**: Add REST API endpoints in Sophia to expose HCG data
2. **Authentication**: Add authentication for WebSocket connections
3. **Caching**: Optimize query performance with Redis caching
4. **React Tests**: Add tests for React components
5. **Documentation**: Add API reference documentation
6. **Examples**: Add example applications using the data layer

## References

- HCG Ontology Specification (Section 4.1)
- SHACL Constraint Language: https://www.w3.org/TR/shacl/
- Neo4j Documentation: https://neo4j.com/docs/
- Cytoscape.js: https://js.cytoscape.org/
- TanStack Query: https://tanstack.com/query/
