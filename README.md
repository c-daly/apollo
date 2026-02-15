# Apollo

**UI and command layer for Project LOGOS**

Apollo is the user interface and command layer for the LOGOS ecosystem, providing a thin client for interacting with Sophia (the cognitive core), visualizing agent state, and monitoring plan execution.

## Features

- **Command Interface**: CLI tool for sending commands to Sophia cognitive core
- **State Visualization**: Real-time display of agent state and HCG graph structure
- **Plan Monitoring**: Track plan generation and execution status
- **Interactive Dashboard**: Web-based UI for observing and controlling the LOGOS agent
- **History & Logging**: Command history and comprehensive logging of agent activities

## Architecture

Apollo serves as the user-facing layer in the LOGOS architecture:

```
User ──> Apollo ──> Sophia ──> HCG (Neo4j + Milvus)
         (UI/CLI)    (Core)     (Knowledge Store)
```

Apollo consists of two main components:

1. **CLI Tool** (`apollo-cli`): Command-line interface for direct interaction
2. **Web Dashboard**: React-based web application for visualization and monitoring

## Installation

### Prerequisites

- **Node.js 18+** (for web dashboard) - [Download](https://nodejs.org/)
- **npm 9+** (comes with Node.js)
- **Python 3.11+** (for CLI tool)
- **Docker** (for connecting to LOGOS infrastructure)

Verify your installation:
```bash
node --version  # Should be v18.x or higher
npm --version   # Should be 9.x or higher
python --version  # Should be 3.11 or higher
```

### Install CLI Tool

```bash
# Install with Poetry
poetry install

# Or install with development dependencies
poetry install --with dev
```

### Install Web Dashboard Dependencies

```bash
cd webapp
npm install
```

This will install all JavaScript/TypeScript dependencies defined in `webapp/package.json`. The lock file (`package-lock.json`) ensures reproducible builds across all environments.

### Using Docker

Apollo is available as a pre-built container image for easy deployment:

```bash
# Pull the latest Apollo image
docker pull ghcr.io/c-daly/apollo:latest

# Run Apollo API server
docker run -d \
  -p 27000:27000 \
  -e APOLLO_PORT=27000 \
  -e NEO4J_URI=bolt://neo4j:7687 \
  -e NEO4J_USER=neo4j \
  -e NEO4J_PASSWORD=your_password \
  -e SOPHIA_HOST=sophia \
  -e SOPHIA_PORT=8000 \
  -e HERMES_HOST=hermes \
  -e HERMES_PORT=8080 \
  ghcr.io/c-daly/apollo:latest
```

The container includes all Python dependencies and the Apollo API service. For development and testing, Apollo uses the `logos-foundry` base image which includes all LOGOS shared packages. For host-based access, the LOGOS port offsets apply (Apollo API 27000, Sophia 47000, Hermes 17000, Neo4j Bolt 27687, Milvus gRPC 27530).

## Quick Start

### Running the Full Stack Demo

The `start_demo.sh` script provides a convenient way to start the entire LOGOS stack (Infrastructure, Hermes, Apollo API, and Webapp).

```bash
# Start all services in the background
./scripts/start_demo.sh start

# Check the status of all services
./scripts/start_demo.sh status

# Stop all services
./scripts/start_demo.sh stop
```

The script handles:
- Validating environment variables and dependencies
- Starting Docker containers (Neo4j, Milvus)
- Starting Hermes (LLM Gateway)
- Starting Apollo API and Webapp
- Managing PID files and preventing duplicate processes

### Using the CLI

```bash
# Start the Apollo CLI
apollo-cli

# Create a goal
apollo-cli goal "Navigate to the kitchen"

# Create a goal with priority
apollo-cli goal "Pick up the red block" --priority high

# Invoke planner with a natural-language goal
apollo-cli plan "Inspect the kitchen counters"

# View current agent state
apollo-cli state

# Show recent plans
apollo-cli plans --recent 5

# Send a command to Sophia (alias for plan)
apollo-cli send "pick up the red block"

# Display command history
apollo-cli history
```

**Goal→Plan→Simulate→State Loop**:
```bash
# 1. Create (or restate) the goal
apollo-cli goal "Navigate to kitchen" --priority high

# 2. Generate a plan for the goal
apollo-cli plan "Navigate to kitchen"

# 3. Run a dry-run simulation to verify the plan
apollo-cli simulate <plan_id>

# 4. Check updated state
apollo-cli state
```

### Using Planning Commands

**Simulate Plan Execution:**
```bash
# Simulate a plan without committing changes
apollo-cli simulate "plan_12345"
```

**Generate Text Embeddings:**
```bash
# Generate embeddings with Hermes
apollo-cli embed "Navigate to the kitchen"

# Use specific model
apollo-cli embed "Pick up the red block" --model small-e5

# Chat through Hermes (/llm) with persona context
apollo-cli chat "Summarize current HCG status and next steps"

# Override provider/model/temperature for an ad-hoc run
apollo-cli chat "Draft a plan for tidying the lab" --provider openai --model gpt-4o-mini --temperature 0.2
```

Both the CLI `chat` command and the Apollo web chat automatically pull the most recent persona-diary entries (default: 5) and prepend them to the Hermes system prompt so responses stay grounded in Sophia's latest beliefs/decisions. Use `--persona-limit` or `--no-persona` to tune that behaviour in the CLI.

### Hermes LLM Gateway

Hermes defaults to a deterministic `echo` provider so demos work without credentials. To hit a real model:

1. Export provider credentials (OpenAI-compatible today):
   ```bash
   export HERMES_LLM_PROVIDER=openai
   export HERMES_LLM_API_KEY=sk-...
   export HERMES_LLM_MODEL=gpt-4o-mini
   ```
2. Start the gateway from the sibling repo:
   ```bash
   cd ../hermes
   poetry install --with dev
   HERMES_PORT=17000 poetry run hermes   # serves http://localhost:17000
   ```
3. Point Apollo at it (`VITE_HERMES_*` in `.env`, `hermes.*` in `config.yaml`).

See [docs/HERMES_SETUP.md](docs/HERMES_SETUP.md) for a complete walkthrough, including verification commands and Milvus/ML extras.

### Authentication & Token Configuration

The LOGOS stack uses bearer tokens for inter-service authentication. All services must share the same token value (`sophia_dev` for development).

**Quick setup:**
```bash
# Sophia (validates tokens)
SOPHIA_API_TOKEN="sophia_dev" poetry run uvicorn sophia.api.app:app --port 47000

# Hermes (forwards tokens to Sophia)
SOPHIA_API_KEY="sophia_dev" SOPHIA_PORT="47000" python -m hermes.main

# Apollo (reads token from config.yaml: sophia.api_key)
./scripts/run_apollo.sh
```

See [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for the complete authentication chain, common issues, and troubleshooting.

### Shared SDK Clients

Apollo CLI now depends exclusively on the generated Python SDKs that live in the [`logos`](https://github.com/c-daly/logos) repository:

- `logos-sophia-sdk` (commit `9549b08`): exposes `PlanRequest`, `StateResponse`, and JEPA simulation types that back every `apollo-cli` command.
- `logos-hermes-sdk` (commit `9549b08`): exposes embedding/NLP helpers used by the `embed` command.

The thin wrappers in `src/apollo/client/*` all subclass the shared `ServiceResponse` base from `src/apollo/sdk/__init__.py`, so every CLI and API surface gets the same `success / data / error` contract and consistent auth + timeout handling. `ApolloConfig` wires host/port/API-key values into the SDK `Configuration` objects at start up.

Running `poetry install` will automatically pull both SDKs from GitHub. To regenerate them after OpenAPI changes:

1. `git clone https://github.com/c-daly/logos.git` (or reuse the existing checkout).
2. Run `./scripts/generate-sdks.sh` from the repo root to rebuild the Python and TypeScript clients from `contracts/*.openapi.yaml`.
3. Commit the regenerated SDKs inside `logos`, then bump the `git+https://...` commit hashes in `pyproject.toml` here so Poetry picks up the new artifacts.
4. `poetry lock --no-update && poetry install` to refresh your virtualenv.

### Running the Web Dashboard

```bash
cd webapp

# Copy environment template
cp .env.example .env

# Edit .env with your API configuration
# VITE_HCG_API_URL=http://localhost:27000
# VITE_HCG_WS_URL=ws://localhost:8765
# VITE_SOPHIA_API_URL=http://localhost:47000
# VITE_HERMES_API_URL=http://localhost:17000
# VITE_MOCK_DATA_MODE=false

# Start development server
npm run dev

# Or start with mock data (no backend required)
npm run dev:mock
```

The dashboard will be available at `http://localhost:5173`

**Web Dashboard Features:**
- **Chat Panel**: Conversational interface for natural language commands routed through Hermes `/llm` with automatic telemetry + token usage reporting
- **Graph Viewer**: Interactive visualization of HCG (goals, plans, steps)
- **Diagnostics**: Real-time logs & telemetry streamed from `/ws/diagnostics` with REST fallback (`/api/diagnostics/logs`, `/api/diagnostics/metrics`, `/api/diagnostics/llm`)
- **Persona Diary**: Agent's internal reasoning and decision-making trace
- See [WebSocket Protocol Documentation](docs/WEBSOCKET_PROTOCOL.md) for real-time update details

**Mock Data Fixtures:**
The webapp includes mock CWMState fixtures for development without backend dependencies:
- **CWM-A/G/E Records**: Actions, Goals with visual frames, and Events
- **JEPA Outputs**: Joint-Embedding Predictive Architecture predictions
- **Mock Service**: In-memory service for deterministic testing
- See [Fixtures Documentation](webapp/src/fixtures/README.md) for usage

**API Clients:**
The webapp includes TypeScript API clients that mirror the Python CLI functionality:
- **Sophia Client**: Goal creation, planning, execution, and simulation
- **Hermes Client**: Text embedding and semantic search
- See [API Client Documentation](docs/API_CLIENTS.md) for detailed usage

## Configuration

Apollo supports configuration through environment variables (recommended) or YAML files.

### Environment Setup (Recommended)

1. Copy the example configuration:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` to set your API keys and service URLs:
   ```bash
   # Required
   OPENAI_API_KEY=sk-...

   # Optional (defaults shown)
   HERMES_HOST=0.0.0.0
   HERMES_PORT=17000
   APOLLO_HOST=0.0.0.0
   APOLLO_PORT=27000
   NEO4J_URI=bolt://localhost:27687
   ```

3. Validate your environment:
   ```bash
   python3 scripts/check_env.py
   ```

The `start_demo.sh` script will automatically source this `.env` file and validate the environment before starting services.

### Python CLI Configuration (Legacy)

You can also use a `config.yaml` file, though environment variables are preferred for consistency across the stack.

Create a `config.yaml` file:

```yaml
# config.yaml
sophia:
  host: localhost
  port: 47000
  timeout: 30
  api_key: ${SOPHIA_API_KEY}  # Optional bearer token

hermes:
  host: localhost
  port: 17000
  timeout: 30
  api_key: ${HERMES_API_KEY}
  provider: openai        # Optional provider override
  model: gpt-4o-mini      # Optional model override
  temperature: 0.7        # Optional temperature (0.0 - 2.0)
  max_tokens: 512         # Optional max completion tokens
  system_prompt: ""       # Optional custom system prompt for chat

persona_api:
  host: localhost
  port: 27000
  timeout: 15
  api_key: ${PERSONA_API_KEY}
  
hcg:
  neo4j:
    uri: bolt://localhost:27687
    user: neo4j
    password: password
  milvus:
    host: localhost
    port: 27530
```

**Environment Variables:**
```bash
# Optional API keys
export SOPHIA_API_KEY=your_sophia_key
export HERMES_API_KEY=your_hermes_key
```

The `persona_api` block configures how the CLI and `apollo-api` proxy reach Sophia's persona diary endpoints. Leave the defaults if `apollo-api` is running locally on port `27000`; otherwise adjust host/port/API key so the `apollo-cli diary`/`chat` commands and the webapp can submit entries.

### Web Dashboard Configuration

Copy `.env.example` to `.env` in the `webapp` directory:

```bash
cd webapp
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# HCG API
VITE_HCG_API_URL=http://localhost:27000
VITE_HCG_WS_URL=ws://localhost:8765
VITE_HCG_TIMEOUT=30000

# Sophia API
VITE_SOPHIA_API_URL=http://localhost:47000
VITE_SOPHIA_API_KEY=
VITE_SOPHIA_TIMEOUT=30000

# Hermes API
VITE_HERMES_API_URL=http://localhost:17000
VITE_HERMES_API_KEY=
VITE_HERMES_TIMEOUT=30000
VITE_HERMES_LLM_PROVIDER=
VITE_HERMES_LLM_MODEL=
VITE_HERMES_LLM_TEMPERATURE=
VITE_HERMES_LLM_MAX_TOKENS=
VITE_HERMES_SYSTEM_PROMPT=

# Features
VITE_ENABLE_CHAT=true
VITE_ENABLE_DIAGNOSTICS=true

# App metadata
VITE_APP_VERSION=dev
```

## Development

### Dependency Management

Apollo uses two dependency management systems:

#### Python Dependencies (CLI)
- **Manager**: Poetry with pyproject.toml
- **Lock file**: `poetry.lock` (committed to repository)
- **Install**: `poetry install --with dev`
- **Configuration**: `pyproject.toml`

#### JavaScript/TypeScript Dependencies (Web Dashboard)
- **Manager**: npm
- **Lock file**: `package-lock.json` (committed to repository)
- **Install**: `cd webapp && npm install`
- **Configuration**: `webapp/package.json`

### Running Tests

Apollo has comprehensive test coverage with both unit and integration tests.

#### Backend Tests (Python)

Standard developer scripts (consistent across all LOGOS repos):

```bash
# Quick test run (standard entry point)
./scripts/test.sh

# Lint check (ruff + black)
./scripts/lint.sh

# Start dev services
./scripts/dev.sh
```

For more control, use `run_tests.sh` directly:

```bash
# Unit tests (default)
./scripts/run_tests.sh

# Unit tests with coverage
./scripts/run_tests.sh coverage

# Integration tests (starts stack automatically)
./scripts/run_tests.sh integration

# Full test run (unit + integration + cleanup)
./scripts/test_all.sh
```

**Test Categories:**
- **Backend API Tests** (`test_backend_api.py`): HCG endpoints, Persona diary, Media upload proxy, Chat streaming
- **WebSocket Tests** (`test_websocket.py`): Connection lifecycle, broadcast, client messaging, error handling
- **CLI SDK Tests** (`test_cli_sdk.py`): Verifies CLI uses SDK clients, error handling, config loading
- **Client Tests** (`test_client.py`, `test_hermes_client.py`, `test_persona_client.py`): SDK client functionality
- **Configuration Tests** (`test_config.py`): Config loading, defaults, validation

#### Integration Tests (Python)

Integration tests require real service dependencies (Sophia, Hermes, Neo4j) to be running. The scripts manage this for you (`./scripts/run_tests.sh integration` or `./scripts/test_all.sh`).

**Integration Test Workflows:**
- Apollo→Sophia health check chain
- HCG entity/snapshot retrieval from Neo4j
- Media upload→Sophia→Neo4j linkage
- Persona diary create→retrieve workflow
- GraphViewer data endpoint chains
- Full end-to-end workflows

**Service Requirements:**
- Sophia running on configured host/port
- Neo4j database accessible
- Required environment variables:
  - `SOPHIA_API_TOKEN` (for media upload tests)
  - `HERMES_API_KEY` (for chat/LLM tests)

#### Frontend Tests (TypeScript)

```bash
cd webapp

# Run all frontend tests
npm test -- --run

# Run tests in watch mode
npm test

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run coverage
```

**Frontend Test Categories:**
- **Component Tests**: MediaUploadPanel, Chat, GraphViewer, DiagnosticsPanel
- **Client Tests**: Sophia client, Hermes client configuration
- **Hook Tests**: useDiagnosticsStream WebSocket hook
- **Fixture Tests**: Mock CWM data structures

#### Test Coverage

Current test coverage (backend):
- **Overall**: 56% statement coverage
- **API Server**: 77% (main endpoints well-tested)
- **WebSocket Server**: 75% (connection/broadcast tested)
- **Config**: 93%
- **Data Models**: 100%
- **SDK**: 82%

Frontend: 88 tests passing covering all major components.

See [E2E Test Documentation](tests/e2e/README.md) for detailed information on end-to-end testing.

#### Test Infrastructure

Apollo uses standardized test stacks generated from the shared LOGOS template to avoid port conflicts with other services.

**Port Assignments (Apollo-specific 27xxx range):**
- Apollo API: `27000`
- Neo4j HTTP: `27474`
- Neo4j Bolt: `27687`
- Milvus gRPC: `27530`
- Milvus Metrics: `27091`
- MinIO: `27900-27901`
- Sophia API (overlay): `47000`
- Sophia Mock (optional): `28080`
- Credentials: `neo4j/neo4jtest`

**Regenerating Test Stack:**
```bash
cd ../logos
poetry run render-test-stacks --repo apollo
# Copy generated files from logos/tests/e2e/stack/apollo/ to apollo/containers/
```

**Test Stack Location:** `containers/`
- `docker-compose.test.yml` - Generated infrastructure (Neo4j, Milvus)
- `.env.test` - Connection settings
- `STACK_VERSION` - Template version hash

Apollo-specific services (like the Sophia mock) are defined in `containers/docker-compose.test.apollo.yml` and can be edited locally.

### Code Quality

#### Python (CLI)
```bash
# Format Python code
black src tests

# Lint Python code
ruff check src tests

# Type checking
mypy src
```

#### JavaScript/TypeScript (Web Dashboard)
```bash
cd webapp

# Lint code
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting
npm run format:check

# Type checking
npm run type-check
```

### Building

```bash
# Build web dashboard for production
cd webapp
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
apollo/
├── src/apollo/          # Python CLI package
│   ├── cli/            # Command-line interface
│   ├── client/         # Sophia & Hermes API clients (Python)
│   └── config/         # Configuration management
├── webapp/             # React web dashboard
│   ├── src/
│   │   ├── lib/       # API clients (TypeScript)
│   │   │   ├── sophia-client.ts    # Sophia API client
│   │   │   ├── hermes-client.ts    # Hermes API client
│   │   │   ├── config.ts           # Configuration loader
│   │   │   └── index.ts            # Client exports
│   │   ├── fixtures/  # Mock data fixtures
│   │   │   ├── cwm-types.ts        # CWM type definitions
│   │   │   ├── cwm-fixtures.ts     # Sample fixture data
│   │   │   ├── mock-service.ts     # Mock data service
│   │   │   ├── index.ts            # Fixture exports
│   │   │   └── README.md           # Fixtures documentation
│   │   ├── components/ # React UI components
│   │   ├── pages/      # Application pages
│   │   └── __tests__/  # Test suite
│   └── public/        # Static assets
├── api-specs/         # OpenAPI specifications
│   ├── sophia-openapi.yaml
│   └── hermes-openapi.yaml
├── tests/             # Test suite
│   ├── e2e/          # End-to-end functional tests
│   ├── test_*.py     # Unit tests for CLI
│   └── ...
├── docs/              # Documentation
│   ├── API_CLIENTS.md # API client usage guide
│   └── ...
└── examples/          # Example usage and scripts
```

## Verification & E2E Testing

Apollo includes end-to-end tests in `tests/e2e/` that verify the complete goal→plan→execute→state loop, demonstrating proper architecture (CLI → API → Sophia → Neo4j).

## Development Status

### Core Commands & Infrastructure ✅

- ✅ Repository structure and configuration
- ✅ Python CLI package setup
- ✅ Development environment configuration
- ✅ Testing framework setup
- ✅ Basic command interface (CLI + API integration)
- ✅ Goal creation and state fetching commands
- ✅ Planner and executor CLI commands
- ✅ Complete goal→plan→execute→state loop
- ✅ E2E verification scripts (M4 test)

### Dual Surfaces ✅

- ✅ OpenAPI specifications for Sophia and Hermes
- ✅ Hermes client for text embedding
- ✅ CLI commands: `simulate` and `embed`
- ✅ React web dashboard with Vite
- ✅ Chat panel (LLM-backed interface)
- ✅ Graph viewer (Cytoscape visualization)
- ✅ Diagnostics panel (logs, timeline, telemetry)
- ✅ Persona diary (agent reasoning trace)
- ✅ Environment configuration (.env support)
- ✅ CI workflow for web app

### Planned Work

- ⏳ Real-time WebSocket connections
- ⏳ SDK generation from OpenAPI specs
- ⏳ Enhanced authentication and security
- ⏳ Production deployment configurations

## Integration with LOGOS Components

Apollo integrates with:

- **Sophia**: Sends commands and receives state updates via REST API
- **Neo4j**: Queries HCG for visualization (read-only)
- **Milvus**: Not directly accessed (through Sophia)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and contribution process.

## License

MIT - See [LICENSE](LICENSE) file for details

## Related Repositories

- [c-daly/logos](https://github.com/c-daly/logos) — Meta repository with specs and contracts
- [c-daly/sophia](https://github.com/c-daly/sophia) — Non-linguistic cognitive core
- [c-daly/hermes](https://github.com/c-daly/hermes) — Language and embedding utilities
- [c-daly/talos](https://github.com/c-daly/talos) — Hardware abstraction layer
