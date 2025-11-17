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

- Node.js 18+ (for web dashboard)
- Python 3.9+ (for CLI tool)
- Docker (for connecting to LOGOS infrastructure)

### Install CLI Tool

```bash
# Install from source
pip install -e .

# Or install with development dependencies
pip install -e ".[dev]"
```

### Install Web Dashboard

```bash
cd webapp
npm install
```

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

### Running Tests

```bash
# Python CLI tests
pytest

# Web dashboard tests
cd webapp
npm test
```

### Code Quality

```bash
# Format Python code
black src tests

# Lint Python code
ruff check src tests

# Type checking
mypy src

# Format JavaScript/React code
cd webapp
npm run format

# Lint JavaScript/React code
npm run lint
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
