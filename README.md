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

# Invoke planner to generate a plan (Phase 1)
apollo-cli plan "goal_12345"

# Execute a plan step (Phase 1)
apollo-cli execute "plan_456" --step 0

# View current agent state
apollo-cli state

# Show recent plans
apollo-cli plans --recent 5

# Send a command to Sophia
apollo-cli send "pick up the red block"

# Display command history
apollo-cli history
```

**Phase 1 Goal→Plan→Execute→State Loop**:
```bash
# 1. Create a goal
apollo-cli goal "Navigate to kitchen" --priority high

# 2. Generate a plan for the goal
apollo-cli plan <goal_id>

# 3. Execute the first step
apollo-cli execute <plan_id> --step 0

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
apollo-cli embed "Pick up the red block" --model sentence-transformers
```

### Running the Web Dashboard

```bash
cd webapp

# Copy environment template
cp .env.example .env

# Edit .env with your API configuration
# VITE_SOPHIA_API_URL=http://localhost:8080
# VITE_HERMES_API_URL=http://localhost:8081

# Start development server
npm run dev
```

The dashboard will be available at `http://localhost:5173`

**Web Dashboard Features:**
- **Chat Panel**: Conversational interface for natural language commands
- **Graph Viewer**: Interactive visualization of HCG (goals, plans, steps)
- **Diagnostics**: System logs, execution timeline, and telemetry metrics
- **Persona Diary**: Agent's internal reasoning and decision-making trace

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

hermes:
  host: localhost
  port: 8081
  timeout: 30
  
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

### Web Dashboard Configuration

Copy `.env.example` to `.env` in the `webapp` directory:

```bash
cd webapp
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Sophia API
VITE_SOPHIA_API_URL=http://localhost:8080
VITE_SOPHIA_API_KEY=

# Hermes API
VITE_HERMES_API_URL=http://localhost:8081
VITE_HERMES_API_KEY=

# Features
VITE_ENABLE_CHAT=true
VITE_ENABLE_DIAGNOSTICS=true
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
│   ├── client/         # Sophia API client
│   └── config/         # Configuration management
├── webapp/             # React web dashboard
│   ├── src/           # React components and pages
│   └── public/        # Static assets
├── tests/             # Test suite
│   ├── e2e/          # End-to-end functional tests
│   ├── test_*.py     # Unit tests for CLI
│   └── ...
├── examples/          # Example usage and scripts
├── docs/              # Documentation
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
