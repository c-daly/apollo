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

# Send a command to Sophia
apollo-cli send "pick up the red block"

# View current agent state
apollo-cli state

# Show recent plans
apollo-cli plans --recent 5

# Display command history
apollo-cli history
```

### Running the Web Dashboard

```bash
cd webapp
npm run dev
```

The dashboard will be available at `http://localhost:3000`

## Configuration

Apollo requires connection details for the Sophia cognitive core and HCG infrastructure:

```yaml
# config.yaml
sophia:
  host: localhost
  port: 8080
  
hcg:
  neo4j:
    uri: bolt://localhost:7687
    user: neo4j
    password: password
  milvus:
    host: localhost
    port: 19530
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

# Web dashboard tests (when implemented)
cd webapp
npm test

# Web dashboard tests with UI
npm run test:ui

# Generate test coverage
npm run coverage
```

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
├── tests/             # Test suite for CLI
├── examples/          # Example usage and scripts
└── docs/              # Documentation
```

## Epoch 1: Infrastructure & Knowledge Foundation

This implementation provides the foundational infrastructure for Apollo:

- ✅ Repository structure and configuration
- ✅ Python CLI package setup
- ✅ React web dashboard scaffolding
- ✅ Development environment configuration
- ✅ Testing framework setup
- ⏳ Basic command interface (Epoch 3)
- ⏳ State visualization (Epoch 3)
- ⏳ Integration with Sophia (Epoch 3)

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
