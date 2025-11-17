# Contributing to Apollo

Thank you for your interest in contributing to Apollo, the UI and command layer for Project LOGOS!

## Development Setup

### Prerequisites

- Python 3.9 or higher
- Node.js 18 or higher
- Git
- Docker and Docker Compose (for testing with LOGOS infrastructure)

### Setting Up Your Environment

1. Clone the repository:
```bash
git clone https://github.com/c-daly/apollo.git
cd apollo
```

2. Set up Python environment for CLI:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -e ".[dev]"
```

3. Set up Node.js environment for web dashboard:
```bash
cd webapp
npm install
cd ..
```

## Development Workflow

### Running Tests

Before submitting a pull request, ensure all tests pass:

```bash
# Python CLI tests
pytest

# Python tests with coverage
pytest --cov=apollo --cov-report=html

# Web dashboard tests
cd webapp
npm test
```

### Code Quality

We use automated tools to maintain code quality:

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

### Running Locally

#### CLI Tool
```bash
# Install in development mode
pip install -e .

# Run the CLI
apollo-cli --help
```

#### Web Dashboard
```bash
cd webapp
npm run dev
```

## Making Contributions

### Branching Strategy

- `main` — Stable release branch
- `develop` — Development branch (default for PRs)
- `feature/*` — Feature branches
- `bugfix/*` — Bug fix branches

### Pull Request Process

1. Create a feature branch from `develop`:
```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

2. Make your changes and commit:
```bash
git add .
git commit -m "Brief description of your changes"
```

3. Push to your fork and create a pull request:
```bash
git push origin feature/your-feature-name
```

4. Ensure your PR:
   - Has a clear title and description
   - References any related issues
   - Includes tests for new functionality
   - Passes all CI checks
   - Has been formatted with `black` and `ruff` (Python) or `prettier` (JavaScript)

### Commit Message Guidelines

- Use clear, descriptive commit messages
- Start with a verb in present tense (e.g., "Add", "Fix", "Update")
- Keep the first line under 50 characters
- Provide additional context in the body if needed

Example:
```
Add state visualization component

- Implement React component for HCG graph display
- Add real-time updates via WebSocket
- Include unit tests for component
```

## Code Style

### Python

- Follow PEP 8 style guide
- Use type hints for all function signatures
- Document functions and classes with docstrings
- Maximum line length: 88 characters (Black default)

### JavaScript/React

- Use modern ES6+ syntax
- Follow Airbnb JavaScript style guide
- Use functional components with hooks
- Write JSDoc comments for complex functions

## Testing Guidelines

- Write unit tests for all new functionality
- Aim for >80% code coverage
- Include integration tests for API endpoints
- Test edge cases and error conditions

## Documentation

- Update README.md if adding new features
- Document API changes in relevant files
- Add examples for new functionality
- Keep inline comments clear and concise

## Getting Help

- Check existing issues and pull requests
- Review the [Project LOGOS documentation](https://github.com/c-daly/logos)
- Open an issue for questions or discussions

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what's best for the project
- Show empathy towards other contributors

## License

By contributing to Apollo, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be acknowledged in the project documentation and release notes.

Thank you for contributing to Project LOGOS! 🚀
