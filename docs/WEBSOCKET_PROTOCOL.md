# Apollo WebSocket Protocol Documentation

## Overview

Apollo provides a WebSocket endpoint at `/ws/diagnostics` for real-time updates of logs, telemetry, persona diary entries, and HCG graph changes. The implementation includes robust connection management, heartbeat monitoring, message queuing for slow clients, and comprehensive error handling.

## Connection

### Endpoint
```
ws://localhost:8082/ws/diagnostics
```

### Connection Flow

1. **Client connects** to `/ws/diagnostics`
2. **Server accepts** connection and assigns a unique connection ID
3. **Server sends initial snapshot**:
   - Current telemetry state
   - Last 20 log entries
4. **Server broadcasts** real-time updates as they occur
5. **Heartbeat** mechanism maintains connection health
6. **Clean disconnection** with proper resource cleanup

## Message Types

All messages follow the `DiagnosticsEvent` format:

```typescript
interface DiagnosticsEvent {
  type: string;
  data: any;
}
```

### 1. Telemetry Updates (`telemetry`)

Real-time metrics about the Apollo system state.

```json
{
  "type": "telemetry",
  "data": {
    "api_latency_ms": 45.2,
    "request_count": 142,
    "success_rate": 98.5,
    "active_plans": 3,
    "last_update": "2025-11-23T13:45:30.123Z",
    "active_websockets": 2,
    "last_broadcast": "2025-11-23T13:45:30.456Z",
    "llm_latency_ms": 1250.5,
    "llm_prompt_tokens": 120,
    "llm_completion_tokens": 85,
    "llm_total_tokens": 205,
    "persona_sentiment": "positive",
    "persona_confidence": 0.92,
    "last_llm_update": "2025-11-23T13:45:28.789Z",
    "last_llm_session": "session-123"
  }
}
```

### 2. Log Events (`log`)

Individual log entries as they are created.

```json
{
  "type": "log",
  "data": {
    "id": "log-1732368330123",
    "timestamp": "2025-11-23T13:45:30.123Z",
    "level": "info",
    "message": "HCG health check passed (45.2 ms)"
  }
}
```

**Log Levels**: `info`, `warning`, `error`

### 3. Log Batch (`logs`)

Initial snapshot of recent log entries sent on connection.

```json
{
  "type": "logs",
  "data": [
    {
      "id": "log-1732368330123",
      "timestamp": "2025-11-23T13:45:30.123Z",
      "level": "info",
      "message": "HCG health check passed"
    },
    // ... up to 20 recent logs
  ]
}
```

### 4. Persona Entry Created (`persona_entry`)

Broadcast when a new persona diary entry is created.

```json
{
  "type": "persona_entry",
  "data": {
    "id": "entry-abc123",
    "timestamp": "2025-11-23T13:45:30.123Z",
    "entry_type": "observation",
    "content": "User engaged with planning interface",
    "summary": "User interaction",
    "sentiment": "neutral",
    "confidence": 0.85,
    "metadata": {
      "source": "ui",
      "session_id": "session-123"
    }
  }
}
```

**Entry Types**: `observation`, `reflection`, `goal`, `plan`, `decision`, `outcome`

### 5. Graph Update (`graph_update`)

Broadcast when the HCG graph structure changes.

```json
{
  "type": "graph_update",
  "data": {
    "update_type": "entity_added",
    "entity_id": "entity-123",
    "timestamp": "2025-11-23T13:45:30.123Z",
    "details": {
      // Update-specific details
    }
  }
}
```

### 6. Heartbeat Messages

#### Client → Server: `ping`
```json
{
  "type": "ping"
}
```

#### Server → Client: `pong`
```json
{
  "type": "pong",
  "timestamp": "2025-11-23T13:45:30.123Z",
  "connection_id": "8c00ac35-297f-4db3-ad32-d360c5b04b70"
}
```

**Recommended ping interval**: 10 seconds

## Connection Management

### Server-Side Features

#### Connection Tracking
- Each connection receives a unique UUID
- Connection metadata tracked:
  - `connection_id`: Unique identifier
  - `connected_at`: Connection timestamp
  - `last_heartbeat`: Last ping received
  - `messages_sent`: Total messages sent
  - `messages_dropped`: Messages dropped due to slow client

#### Message Queuing
- Each connection has a bounded queue (max 100 messages)
- Non-blocking queue operations prevent slow clients from blocking others
- When queue is full, messages are dropped for that specific client
- Dropped message count tracked per connection

#### Error Handling
- WebSocket disconnections handled gracefully
- Connection cleanup automatic on disconnect
- Error logging for troubleshooting
- Task cancellation on disconnect

#### Concurrency
- Supports multiple concurrent connections
- Thread-safe connection management with asyncio locks
- Parallel message broadcasting to all connected clients

### Client-Side Recommendations

#### Connection Management
```typescript
const ws = new WebSocket('ws://localhost:8082/ws/diagnostics');

ws.onopen = () => {
  console.log('Connected to diagnostics stream');
  // Start sending periodic pings
  startHeartbeat();
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleMessage(message);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected from diagnostics stream');
  // Implement reconnection logic
  scheduleReconnect();
};
```

#### Heartbeat Implementation
```typescript
function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 10000); // Ping every 10 seconds
}
```

#### Reconnection Strategy
- Use exponential backoff (1s, 1.5s, 2.25s, ...)
- Add jitter to prevent thundering herd
- Cap maximum delay (e.g., 30 seconds)
- Limit maximum reconnection attempts

```typescript
class ExponentialBackoff {
  attempt = 0;
  baseDelay = 1000;
  maxDelay = 30000;

  next(): number {
    const delay = Math.min(
      this.maxDelay,
      this.baseDelay * Math.pow(1.5, this.attempt)
    );
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    this.attempt++;
    return Math.max(this.baseDelay, delay + jitter);
  }

  reset(): void {
    this.attempt = 0;
  }
}
```

## Performance Characteristics

### Server Limits
- **Max queue size per connection**: 100 messages
- **Max connections**: Limited by server resources (tested with 10+ concurrent)
- **Message broadcasting**: O(n) where n is number of connections

### Network Behavior
- **Initial payload**: Telemetry + 20 recent logs (~10KB typical)
- **Message frequency**: Variable based on system activity
  - Telemetry updates: Every 5 seconds (background)
  - Log events: As they occur
  - Persona entries: As created
  - Graph updates: As they occur

### Slow Client Handling
- Messages dropped when client queue is full
- No impact on other connected clients
- Dropped message count logged every 10 messages

## Security Considerations

### Current Implementation
- No authentication on WebSocket endpoint
- Runs on same port as REST API
- CORS configured for local development

### Recommended Production Settings
- Implement authentication token verification
- Use WSS (WebSocket Secure) over TLS
- Configure appropriate CORS policies
- Rate limiting on connection attempts
- Monitor connection count and resource usage

## Testing

### Manual Testing with `wscat`
```bash
# Install wscat
npm install -g wscat

# Connect to diagnostics stream
wscat -c ws://localhost:8082/ws/diagnostics

# Send ping
> {"type": "ping"}

# Observe pong response and real-time updates
```

### Integration Testing
```python
from fastapi.testclient import TestClient
from apollo.api import server

with TestClient(server.app) as client:
    with client.websocket_connect("/ws/diagnostics") as websocket:
        # Receive initial messages
        telemetry = websocket.receive_json()
        logs = websocket.receive_json()
        
        # Send ping
        websocket.send_json({"type": "ping"})
        
        # Receive pong
        pong = websocket.receive_json()
        assert pong["type"] == "pong"
```

## Troubleshooting

### Common Issues

#### Connection Hangs on Initial Messages
- **Symptom**: WebSocket connects but no messages received
- **Cause**: Possible deadlock in connection registration
- **Solution**: Ensure asyncio locks are released before broadcasting

#### Messages Not Received
- **Symptom**: Some messages missing
- **Cause**: Client queue full (slow consumer)
- **Solution**: Check connection stats for dropped messages, optimize message handling

#### Frequent Disconnections
- **Symptom**: WebSocket disconnects repeatedly
- **Cause**: Network issues or missing heartbeat
- **Solution**: Implement proper heartbeat and reconnection logic

#### High Memory Usage
- **Symptom**: Server memory grows with connections
- **Cause**: Queue buildup or connection leaks
- **Solution**: Check connection cleanup in error paths

### Debug Logging

Server logs connection events:
```
INFO: WebSocket connected: 8c00ac35-297f-4db3-ad32-d360c5b04b70
INFO: WebSocket disconnected: 8c00ac35-297f-4db3-ad32-d360c5b04b70 (sent: 142, dropped: 0)
WARNING: Dropped 10 messages for slow client 8c00ac35-...
```

## Migration from Polling

If your client currently polls REST endpoints:

### Before (Polling)
```typescript
setInterval(async () => {
  const logs = await fetch('/api/diagnostics/logs');
  const telemetry = await fetch('/api/diagnostics/telemetry');
  updateUI(await logs.json(), await telemetry.json());
}, 1000); // Poll every second
```

### After (WebSocket)
```typescript
const ws = new WebSocket('ws://localhost:8082/ws/diagnostics');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'log') {
    updateLogs(message.data);
  } else if (message.type === 'telemetry') {
    updateTelemetry(message.data);
  } else if (message.type === 'persona_entry') {
    updatePersonaDiary(message.data);
  }
};
```

### Benefits
- **Reduced latency**: Updates received immediately
- **Lower server load**: No polling overhead
- **Lower bandwidth**: Only changed data sent
- **Better UX**: Real-time responsiveness

## References

- Server implementation: `src/apollo/api/server.py` (`DiagnosticsManager`, `/ws/diagnostics` endpoint)
- Client implementation: `webapp/src/lib/websocket-client.ts` (`HCGWebSocketClient`)
- Integration tests: `tests/test_diagnostics_integration.py`
- Issue: [#82](https://github.com/c-daly/apollo/issues/82)
