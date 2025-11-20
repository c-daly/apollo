# Apollo API Clients

TypeScript client libraries for interacting with Sophia (cognitive core) and Hermes (language/embedding) services.

## Overview

Apollo provides type-safe, fully tested API clients for the LOGOS ecosystem:

- **Sophia Client**: Interact with the cognitive core for goal planning and execution
- **Hermes Client**: Generate text embeddings and perform semantic search
- **Configuration**: Centralized config management with environment variable support

## Installation

The API clients are part of the Apollo webapp. No additional installation is required.

```bash
cd webapp
npm install
```

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
# Sophia API Configuration
VITE_SOPHIA_API_URL=http://localhost:8080
VITE_SOPHIA_API_KEY=                    # Optional
VITE_SOPHIA_TIMEOUT=30000               # Optional, in milliseconds

# Hermes API Configuration
VITE_HERMES_API_URL=http://localhost:8081
VITE_HERMES_API_KEY=                    # Optional
VITE_HERMES_TIMEOUT=30000               # Optional, in milliseconds

# Feature Flags
VITE_ENABLE_CHAT=true
VITE_ENABLE_DIAGNOSTICS=true
```

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

The Hermes client provides text embedding and semantic search capabilities.

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

// Custom model and normalization
const response = await hermesClient.embedText({
  text: 'Pick up the red block',
  model: 'all-MiniLM-L6-v2',
  normalize: false,
})
```

### Batch Embeddings

```typescript
const batchResponse = await hermesClient.embedBatch({
  texts: [
    'Navigate to the kitchen',
    'Pick up the red block',
    'Place object on table',
  ],
})

if (batchResponse.success) {
  console.log('Embeddings:', batchResponse.data.embeddings)
  console.log('Count:', batchResponse.data.count)
}
```

### Semantic Search

```typescript
// Basic search
const searchResponse = await hermesClient.search({
  query: 'Find navigation goals',
})

if (searchResponse.success) {
  const results = searchResponse.data.results
  results.forEach((result) => {
    console.log(`ID: ${result.id}, Score: ${result.score}`)
    console.log(`Text: ${result.text}`)
  })
}

// Search with custom parameters
const searchResponse = await hermesClient.search({
  query: 'object manipulation',
  k: 5, // Top 5 results
  model: 'sentence-transformers',
  filter: {
    category: 'goals',
    status: 'active',
  },
})
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
interface CreateGoalRequest {
  goal: string
  priority?: string
  metadata?: Record<string, unknown>
}

interface GoalResponse {
  goal_id: string
  description: string
  priority?: string
  status: string
  created_at: string
}

interface PlanResponse {
  plan_id: string
  goal_id: string
  steps: Array<{
    step_id: string
    action: string
    parameters?: Record<string, unknown>
    preconditions?: string[]
    effects?: string[]
  }>
  status: string
  created_at: string
}

interface ExecuteStepRequest {
  plan_id: string
  step_index: number
}
```

### Hermes Types

```typescript
interface EmbedTextRequest {
  text: string
  model?: string
  normalize?: boolean
}

interface EmbeddingResponse {
  embedding: number[]
  model: string
  dimensions: number
  normalized: boolean
}

interface SearchRequest {
  query: string
  k?: number
  model?: string
  filter?: Record<string, unknown>
}

interface SearchResult {
  id: string
  score: number
  text?: string
  metadata?: Record<string, unknown>
}
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
| `hermes_client.embed_batch()` | `hermesClient.embedBatch()` |

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
