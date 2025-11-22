# Apollo API Clients

Apollo ships SDK-backed clients for both the Python CLI surface and the TypeScript web application.

## Python (CLI) Clients

The CLI code in `src/apollo/client/` is a thin wrapper around the generated Python packages that live in the [`logos`](https://github.com/c-daly/logos) repository (`logos-sophia-sdk` and `logos-hermes-sdk`). The helper module at `src/apollo/sdk/__init__.py` is responsible for:

- Building configured SDK instances using `ApolloConfig` (host, port, timeout, API key).
- Providing the shared `ServiceResponse` base class so every operation returns `success / data / error` fields.
- Normalizing error handling (authorization failures, transport errors, timeouts) in one place.

### Quick Start

```python
from apollo.client.sophia_client import SophiaClient
from apollo.client.hermes_client import HermesClient
from apollo.config.settings import ApolloConfig

config = ApolloConfig.load()  # loads config.yaml or defaults
sophia = SophiaClient(config.sophia)
hermes = HermesClient(config.hermes)

plan = sophia.create_goal("Navigate to the kitchen")
if plan.success:
    print(plan.data["goal_id"])
else:
    print(plan.error)

embedding = hermes.embed_text("Pick up the red block")
```

Every response inherits from `ServiceResponse`, so test fixtures and CLI commands can treat all service calls uniformly:

```python
response = sophia.get_state(limit=5)
if not response.success:
    raise RuntimeError(response.error)

state = response.data  # already serialized via SDK model.to_dict()
```

### Regenerating the Python SDKs

1. From the `logos` repository, run `./scripts/generate-sdks.sh` to emit the latest Python packages under `sdk/python/{sophia,hermes}`.
2. Commit the regenerated SDKs inside `logos`.
3. Update the `git+https://...#subdirectory=sdk/python/...` commit hashes in `pyproject.toml` (this repository) so Poetry fetches the new artifacts.
4. Run `poetry lock --no-update && poetry install` (or `pip install -e .`) to refresh your local environment.

### Persona Diary Helper

`PersonaClient` (`src/apollo/client/persona_client.py`) targets the persona diary
endpoints exposed by `apollo-api`. Those routes now persist entries via
`PersonaDiaryStore` into Neo4j, emit diagnostics events, and serve filtered
results back to the CLI/webapp. The client continues to return `ServiceResponse`
objects so consumers handle success/error uniformly with the Sophia/Hermes
clients, and it reads connection details from the `persona_api` block in
`config.yaml`.

## TypeScript (Web) Clients

The sections below describe the TypeScript SDKs that power the Apollo web application.

## Overview

Apollo provides type-safe, fully tested API clients for the LOGOS ecosystem:

- **Sophia Client**: Interact with the cognitive core for goal planning and execution
- **Hermes Client**: Generate text embeddings, run simple NLP helpers, and proxy LLM calls
- **Configuration**: Centralized config management with environment variable support

## Installation

The API clients are part of the Apollo webapp. No additional installation is required.

```bash
cd webapp
npm install
```

### Shared SDK Packages

The TypeScript clients wrap the generated `@logos/sophia-sdk` and
`@logos/hermes-sdk` packages. To keep CI simple, the SDKs are vendored under
`webapp/vendor/@logos/*` and were copied from
[`c-daly/logos`](https://github.com/c-daly/logos) commit
`9549b089203ed1d8bb6560ab56ba02e7dbbefb61` (folders `sdk-web/sophia` and
`sdk-web/hermes`).

To refresh them after the OpenAPI contracts change:

```bash
# From the apollo repo root (with ../logos pointing at the desired commit)
rm -rf webapp/vendor
mkdir -p webapp/vendor/@logos
rsync -a --exclude node_modules ../logos/sdk-web/sophia/ webapp/vendor/@logos/sophia-sdk
rsync -a --exclude node_modules ../logos/sdk-web/hermes/ webapp/vendor/@logos/hermes-sdk
npm install --prefix webapp
```

Please update `webapp/vendor/README.md` with the new commit hash whenever you
refresh the snapshot.

## Quick Start

### Basic Usage

```typescript
import { sophiaClient, hermesClient } from './lib'

// Check service health
const sophiaHealthy = await sophiaClient.healthCheck()
const hermesHealthy = await hermesClient.healthCheck()

// Create a goal
const goalResponse = await sophiaClient.createGoal({
  goal: 'Navigate to the kitchen',
  priority: 'high',
})

// Generate text embedding
const embeddingResponse = await hermesClient.embedText({
  text: 'Navigate to the kitchen',
})
```

### Using Custom Configuration

```typescript
import { SophiaClient, HermesClient } from './lib'

const sophia = new SophiaClient({
  baseUrl: 'http://custom-sophia:8080',
  apiKey: 'your-api-key',
  timeout: 60000, // 60 seconds
})

const hermes = new HermesClient({
  baseUrl: 'http://custom-hermes:8081',
  apiKey: 'your-api-key',
  timeout: 60000,
})
```

## Configuration

### Environment Variables

Apollo uses Vite environment variables for configuration. Create a `.env` file in the `webapp` directory:

```env
# HCG API Configuration
VITE_HCG_API_URL=http://localhost:8082
VITE_HCG_WS_URL=ws://localhost:8082/ws/hcg
VITE_HCG_TIMEOUT=30000                  # Optional, in milliseconds

# Sophia API Configuration
VITE_SOPHIA_API_URL=http://localhost:8080
VITE_SOPHIA_API_KEY=                    # Optional
VITE_SOPHIA_TIMEOUT=30000               # Optional, in milliseconds

# Hermes API Configuration
VITE_HERMES_API_URL=http://localhost:8081
VITE_HERMES_API_KEY=                    # Optional
VITE_HERMES_TIMEOUT=30000               # Optional, in milliseconds
VITE_HERMES_LLM_PROVIDER=               # Optional provider override (e.g., openai)
VITE_HERMES_LLM_MODEL=                  # Optional model override
VITE_HERMES_LLM_TEMPERATURE=0.1         # Optional sampling temperature
VITE_HERMES_LLM_MAX_TOKENS=512          # Optional max completion tokens
VITE_HERMES_SYSTEM_PROMPT=              # Optional system prompt override

# Feature Flags
VITE_ENABLE_CHAT=true
VITE_ENABLE_DIAGNOSTICS=true
```

### Diagnostics Client

The diagnostics panel consumes the telemetry/log endpoints exposed by `apollo-api`:

- `GET /api/diagnostics/logs?limit=100` → latest log entries.
- `GET /api/diagnostics/metrics` → aggregated telemetry snapshot.
- `POST /api/diagnostics/llm` → ingest Hermes `/llm` telemetry (latency + token usage + persona sentiment) so the dashboard reflects chat usage.
- `WS /ws/diagnostics` → streaming feed for real-time updates.

See `webapp/src/lib/diagnostics-client.ts` and `webapp/src/hooks/useDiagnosticsStream.ts` for example usage.

### Loading Configuration

```typescript
import { loadConfig, validateConfig, isConfigValid } from './lib'

// Load all configuration
const config = loadConfig()
console.log(config.sophia.baseUrl) // http://localhost:8080

// Validate configuration
if (!isConfigValid()) {
  const missing = validateConfig()
  console.error('Missing configuration:', missing)
}
```

## Sophia Client

The Sophia client provides access to the cognitive core for goal planning and execution.

### Creating Goals

```typescript
import { sophiaClient } from './lib'

// Simple goal
const response = await sophiaClient.createGoal({
  goal: 'Pick up the red block',
})

// Goal with priority
const response = await sophiaClient.createGoal({
  goal: 'Navigate to kitchen',
  priority: 'high',
})

// Goal with metadata
const response = await sophiaClient.createGoal({
  goal: 'Move object',
  metadata: {
    object: 'red_block',
    target_location: 'table',
  },
})

if (response.success) {
  console.log('Goal created:', response.data.goal_id)
} else {
  console.error('Error:', response.error)
}
```

### Getting Agent State

```typescript
const stateResponse = await sophiaClient.getState()

if (stateResponse.success) {
  const state = stateResponse.data
  console.log('Beliefs:', state.state.beliefs)
  console.log('Goals:', state.state.goals)
  console.log('Plans:', state.state.plans)
}
```

### Planning

```typescript
// Invoke planner for a goal
const planResponse = await sophiaClient.invokePlanner('goal_12345')

if (planResponse.success) {
  const plan = planResponse.data
  console.log('Plan ID:', plan.plan_id)
  console.log('Steps:', plan.steps)
}

// Get recent plans
const plansResponse = await sophiaClient.getPlans(10)
if (plansResponse.success) {
  console.log('Plans:', plansResponse.data.plans)
}
```

### Executing Plans

```typescript
// Execute a step
const executeResponse = await sophiaClient.executeStep({
  plan_id: 'plan_456',
  step_index: 0,
})

if (executeResponse.success) {
  console.log('Step result:', executeResponse.data.result)
  console.log('New state:', executeResponse.data.new_state)
}
```

### Simulating Plans

```typescript
// Simulate without initial state
const simResponse = await sophiaClient.simulatePlan({
  plan_id: 'plan_789',
})

// Simulate with custom initial state
const simResponse = await sophiaClient.simulatePlan({
  plan_id: 'plan_789',
  initial_state: {
    location: 'bedroom',
    holding: null,
  },
})

if (simResponse.success) {
  console.log('Final state:', simResponse.data.final_state)
  console.log('Execution trace:', simResponse.data.execution_trace)
}
```

### Health Checks

```typescript
// Simple health check
const isHealthy = await sophiaClient.healthCheck()

// Detailed health info
const healthResponse = await sophiaClient.getHealth()
if (healthResponse.success) {
  console.log('Status:', healthResponse.data.status)
  console.log('Version:', healthResponse.data.version)
}
```

## Hermes Client

The Hermes client provides text embedding plus auxiliary language utilities such as
lightweight NLP preprocessing and proxying requests to the configured LLM provider.

### Generating Embeddings

```typescript
import { hermesClient } from './lib'

// Single text embedding
const response = await hermesClient.embedText({
  text: 'Navigate to the kitchen',
})

if (response.success) {
  console.log('Embedding:', response.data.embedding)
  console.log('Dimensions:', response.data.dimensions)
  console.log('Model:', response.data.model)
}

// Custom model
const response = await hermesClient.embedText({
  text: 'Pick up the red block',
  model: 'all-MiniLM-L6-v2',
})
```

### Simple NLP

```typescript
const nlpResponse = await hermesClient.simpleNlp({
  text: 'Pick up the red block near the table.',
  operations: ['tokenize', 'ner'],
})

if (nlpResponse.success) {
  console.log('Tokens:', nlpResponse.data.tokens)
  console.log('Entities:', nlpResponse.data.entities)
}
```

### LLM Gateway

```typescript
const completion = await hermesClient.llmGenerate({
  provider: 'echo',
  model: 'echo',
  metadata: {
    surface: 'apollo-webapp.chat-panel',
    persona_entry_ids: ['entry_123', 'entry_456'],
  },
  messages: [
    { role: 'system', content: 'You are supporting Apollo operators.' },
    {
      role: 'system',
      content: 'Persona context:\n- Observation @ 10:00: Picked up the red block',
    },
    { role: 'user', content: 'Summarize the last process execution.' },
  ],
})

if (completion.success && completion.data) {
  const content = completion.data.choices?.[0]?.message?.content
  console.log('LLM response:', content)
  console.log('Usage:', completion.data.usage)
}
```

The same `/llm` endpoint is exposed through the CLI via `apollo-cli chat "..."`. By default the CLI (and the browser chat panel) fetch the five most recent persona-diary entries, fold them into the system prompt, and tag each request with metadata (`persona_entry_ids`, sentiment counts, etc.) so diagnostics can reconstruct the conversation history. Override the provider/model/temperature with `--provider`, `--model`, `--temperature`, `--max-tokens`, or disable persona context with `--no-persona`.

### Apollo Chat Streaming API

Browsers now talk to Apollo’s API instead of Hermes directly. `POST /api/chat/stream`
accepts the same conversation payload that Hermes expects plus optional metadata
and relays chunks back via SSE. The server forwards the call to Hermes, records
telemetry, and persists persona diary entries so clients don’t need to call
multiple endpoints.

```typescript
const response = await fetch('http://localhost:8082/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [
      { role: 'system', content: 'You are helping with Apollo operations.' },
      { role: 'user', content: 'List the last three plans.' },
    ],
    metadata: {
      surface: 'apollo-webapp.chat-panel',
      session_id: crypto.randomUUID(),
    },
    provider: 'openai',
    model: 'gpt-4o-mini',
  }),
})

if (!response.ok || !response.body) throw new Error('Chat stream failed')
const reader = response.body.getReader()
const decoder = new TextDecoder()
let buffer = ''
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  for (const event of buffer.split('\n\n')) {
    if (!event.startsWith('data:')) continue
    const payload = JSON.parse(event.slice(5))
    if (payload.type === 'chunk') renderChunk(payload.content)
    if (payload.type === 'end') finalize(payload.content)
  }
}
```

### Health Checks

```typescript
// Simple health check
const isHealthy = await hermesClient.healthCheck()

// Get available models
const healthResponse = await hermesClient.getHealth()
if (healthResponse.success) {
  console.log('Available models:', healthResponse.data.models)
}
```

## Error Handling

All API client methods return a consistent response structure:

```typescript
interface Response<T> {
  success: boolean
  data?: T
  error?: string
}
```

### Handling Errors

```typescript
const response = await sophiaClient.createGoal({
  goal: 'Test goal',
})

if (response.success) {
  // Success - use response.data
  console.log('Goal ID:', response.data.goal_id)
} else {
  // Error - use response.error
  console.error('Failed to create goal:', response.error)
}
```

### Common Error Types

- **Connection Errors**: Service is unreachable
- **Timeout Errors**: Request took too long
- **Validation Errors**: Invalid request parameters
- **Server Errors**: Internal service errors

```typescript
try {
  const response = await sophiaClient.getState()
  
  if (!response.success) {
    if (response.error?.includes('timed out')) {
      console.error('Request timed out')
    } else if (response.error?.includes('connect')) {
      console.error('Cannot connect to Sophia')
    } else {
      console.error('Error:', response.error)
    }
  }
} catch (error) {
  console.error('Unexpected error:', error)
}
```

## Type Definitions

### Sophia Types

```typescript
import type {
  PlanRequest,
  PlanResponse,
  SimulationRequest,
  SimulationResponse,
  StateResponse,
} from '@logos/sophia-sdk'
```

### Hermes Types

```typescript
import type {
  EmbedText200Response as EmbeddingResponse,
  EmbedTextRequest,
  LLMRequest,
  LLMResponse,
  SimpleNlp200Response,
  SimpleNlpRequest,
} from '@logos/hermes-sdk'
```

## CLI/Web Parity

The TypeScript API clients are designed to match the functionality of the Python CLI clients, ensuring consistent behavior between command-line and web interfaces.

### Python CLI → TypeScript Web

| Python CLI | TypeScript Web |
|------------|----------------|
| `sophia_client.create_goal()` | `sophiaClient.createGoal()` |
| `sophia_client.get_state()` | `sophiaClient.getState()` |
| `sophia_client.invoke_planner()` | `sophiaClient.invokePlanner()` |
| `sophia_client.execute_step()` | `sophiaClient.executeStep()` |
| `sophia_client.simulate_plan()` | `sophiaClient.simulatePlan()` |
| `hermes_client.embed_text()` | `hermesClient.embedText()` |

## Testing

The API clients include comprehensive test coverage:

```bash
cd webapp
npm test
```

### Test Structure

- **Unit Tests**: Each client method is tested independently
- **Error Handling**: Tests for connection errors, timeouts, and validation
- **Authentication**: Tests for API key handling
- **Type Safety**: TypeScript compilation ensures type correctness

### Running Specific Tests

```bash
# Run Sophia client tests
npm test sophia-client

# Run Hermes client tests
npm test hermes-client

# Run config tests
npm test config

# Run with coverage
npm run coverage
```

## Best Practices

### 1. Use Default Clients

```typescript
// Good - uses environment configuration
import { sophiaClient, hermesClient } from './lib'

// Avoid - requires manual config
import { SophiaClient } from './lib'
const client = new SophiaClient({ baseUrl: '...' })
```

### 2. Check Health Before Operations

```typescript
const isHealthy = await sophiaClient.healthCheck()
if (!isHealthy) {
  console.error('Sophia service is not available')
  return
}

// Proceed with operations
const response = await sophiaClient.getState()
```

### 3. Handle Errors Gracefully

```typescript
const response = await sophiaClient.createGoal({
  goal: 'Navigate to kitchen',
})

if (!response.success) {
  // Log error and provide user feedback
  console.error('Failed to create goal:', response.error)
  showNotification('Unable to create goal. Please try again.')
  return
}

// Continue with success case
processGoal(response.data)
```

### 4. Use TypeScript Types

```typescript
import type { GoalResponse, PlanResponse } from './lib'

function processGoal(goal: GoalResponse) {
  console.log(`Processing goal ${goal.goal_id}`)
}

function executePlan(plan: PlanResponse) {
  plan.steps.forEach((step) => {
    console.log(`Step: ${step.action}`)
  })
}
```

### 5. Configure Timeouts Appropriately

```typescript
// Long-running operations need higher timeouts
const sophia = new SophiaClient({
  baseUrl: 'http://sophia:8080',
  timeout: 120000, // 2 minutes for plan generation
})
```

## Troubleshooting

### Service Connection Issues

```typescript
const isHealthy = await sophiaClient.healthCheck()
if (!isHealthy) {
  console.error('Cannot connect to Sophia service')
  console.error('Check that VITE_SOPHIA_API_URL is correct')
  console.error('Verify Sophia service is running')
}
```

### Configuration Validation

```typescript
import { validateConfig, isConfigValid } from './lib'

if (!isConfigValid()) {
  const missing = validateConfig()
  console.error('Configuration errors:')
  missing.forEach((key) => {
    console.error(`  - ${key} is not set`)
  })
}
```

### Authentication Errors

```typescript
const response = await sophiaClient.getState()
if (!response.success && response.error?.includes('401')) {
  console.error('Authentication failed')
  console.error('Check VITE_SOPHIA_API_KEY is correct')
}
```

## Related Documentation

- [Apollo README](../README.md) - Main Apollo documentation
- [API Specifications](../api-specs/) - OpenAPI specs for Sophia and Hermes
- [Python CLI Client](../src/apollo/client/) - Python client implementation
- [Configuration Guide](../docs/PROTOTYPE-WIRING.md) - Detailed configuration guide
