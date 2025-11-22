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
- **Python 3.9+** (for CLI tool)
- **Docker** (for connecting to LOGOS infrastructure)

Verify your installation:
```bash
node --version  # Should be v18.x or higher
npm --version   # Should be 9.x or higher
python --version  # Should be 3.9 or higher
```

### Install CLI Tool

```bash
# Install from source
pip install -e .

# Or install with development dependencies
pip install -e ".[dev]"
```

### Install Web Dashboard Dependencies

```bash
cd webapp
npm install
```

This will install all JavaScript/TypeScript dependencies defined in `webapp/package.json`. The lock file (`package-lock.json`) ensures reproducible builds across all environments.

## Quick Start

### Using the CLI

```bash
# Start the Apollo CLI
apollo-cli

# Create a goal
apollo-cli goal "Navigate to the kitchen"

# Create a goal with priority
apollo-cli goal "Pick up the red block" --priority high

# Invoke planner with a natural-language goal (Phase 2)
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

**Phase 2 Goal→Plan→Simulate→State Loop**:
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

### Using Phase 2 Commands

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

### Shared SDK Clients

Apollo CLI now depends exclusively on the generated Python SDKs that live in the [`logos`](https://github.com/c-daly/logos) repository:

- `logos-sophia-sdk` (commit `9549b08`): exposes `PlanRequest`, `StateResponse`, and JEPA simulation types that back every `apollo-cli` command.
- `logos-hermes-sdk` (commit `9549b08`): exposes embedding/NLP helpers used by the `embed` command.

The thin wrappers in `src/apollo/client/*` all subclass the shared `ServiceResponse` base from `src/apollo/sdk/__init__.py`, so every CLI and API surface gets the same `success / data / error` contract and consistent auth + timeout handling. `ApolloConfig` wires host/port/API-key values into the SDK `Configuration` objects at start up.

Running `pip install -e .` (or `pip install -e ".[dev]"`) will automatically pull both SDKs from GitHub. To regenerate them after OpenAPI changes:

1. `git clone https://github.com/c-daly/logos.git` (or reuse the existing checkout).
2. Run `./scripts/generate-sdks.sh` from the repo root to rebuild the Python and TypeScript clients from `contracts/*.openapi.yaml`.
3. Commit the regenerated SDKs inside `logos`, then bump the `git+https://...` commit hashes in `pyproject.toml` here so Poetry picks up the new artifacts.
4. `poetry lock --no-update && poetry install` (or `pip install -e .`) to refresh your virtualenv.

### Running the Web Dashboard

```bash
cd webapp

# Copy environment template
cp .env.example .env

# Edit .env with your API configuration
# VITE_HCG_API_URL=http://localhost:8082
# VITE_HCG_WS_URL=ws://localhost:8765
# VITE_SOPHIA_API_URL=http://localhost:8080
# VITE_HERMES_API_URL=http://localhost:8081
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

Apollo supports configuration through YAML files and environment variables.

### Python CLI Configuration

Create a `config.yaml` file or use environment variables:

```yaml
# config.yaml
sophia:
  host: localhost
  port: 8080
  timeout: 30
  api_key: ${SOPHIA_API_KEY}  # Optional bearer token

hermes:
  host: localhost
  port: 8081
  timeout: 30
  api_key: ${HERMES_API_KEY}
  provider: openai        # Optional provider override
  model: gpt-4o-mini      # Optional model override
  temperature: 0.7        # Optional temperature (0.0 - 2.0)
  max_tokens: 512         # Optional max completion tokens
  system_prompt: ""       # Optional custom system prompt for chat

persona_api:
  host: localhost
  port: 8082
  timeout: 15
  api_key: ${PERSONA_API_KEY}
  
hcg:
  neo4j:
    uri: bolt://localhost:7687
    user: neo4j
    password: password
  milvus:
    host: localhost
    port: 19530
```

**Environment Variables:**
```bash
# Optional API keys
export SOPHIA_API_KEY=your_sophia_key
export HERMES_API_KEY=your_hermes_key
```

The `persona_api` block configures how the CLI and `apollo-api` proxy reach Sophia's persona diary endpoints. Leave the defaults if `apollo-api` is running locally on port `8082`; otherwise adjust host/port/API key so the `apollo-cli diary`/`chat` commands and the webapp can submit entries.

### Web Dashboard Configuration

Copy `.env.example` to `.env` in the `webapp` directory:

```bash
cd webapp
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# HCG API
VITE_HCG_API_URL=http://localhost:8082
VITE_HCG_WS_URL=ws://localhost:8765
VITE_HCG_TIMEOUT=30000

# Sophia API
VITE_SOPHIA_API_URL=http://localhost:8080
VITE_SOPHIA_API_KEY=
VITE_SOPHIA_TIMEOUT=30000

# Hermes API
VITE_HERMES_API_URL=http://localhost:8081
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
- **Manager**: pip with pyproject.toml
- **Lock file**: Not used (standard Python practice)
- **Install**: `pip install -e ".[dev]"`
- **Configuration**: `pyproject.toml`

#### JavaScript/TypeScript Dependencies (Web Dashboard)
- **Manager**: npm
- **Lock file**: `package-lock.json` (committed to repository)
- **Install**: `cd webapp && npm install`
- **Configuration**: `webapp/package.json`

### Running Tests

```bash
# Python CLI tests
pytest

# Run M4 E2E test (verifies goal creation flow)
./PHASE1_VERIFY/scripts/m4_test.py

# Web dashboard tests (when implemented)
cd webapp
npm test

# Web dashboard tests with UI
npm run test:ui

# Generate test coverage
npm run coverage
```

See [E2E Test Documentation](tests/e2e/README.md) for detailed information on end-to-end testing.

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
├── examples/          # Example usage and scripts
└── PHASE1_VERIFY/     # Phase 1 verification scripts
    └── scripts/       # E2E test scripts and documentation
```

## Verification & E2E Testing

Apollo includes end-to-end verification scripts in `PHASE1_VERIFY/scripts/`:

- **M4 Test**: Verifies the complete Phase 1 goal→plan→execute→state loop
- Tests the full workflow: create goal → invoke planner → execute step → fetch state
- Demonstrates proper architecture (CLI → API → Sophia → Neo4j)
- Replaces direct database operations with proper API calls

See [PHASE1_VERIFY/scripts/README.md](PHASE1_VERIFY/scripts/README.md) for detailed documentation on verification scripts and commands.

## Development Status

### Phase 1: Infrastructure & Core Commands ✅

- ✅ Repository structure and configuration
- ✅ Python CLI package setup
- ✅ Development environment configuration
- ✅ Testing framework setup
- ✅ Basic command interface (CLI + API integration)
- ✅ Goal creation and state fetching commands
- ✅ Planner and executor CLI commands
- ✅ Complete goal→plan→execute→state loop
- ✅ E2E verification scripts (M4 test)

### Phase 2: Dual Surfaces ✅

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

### Future Phases

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
