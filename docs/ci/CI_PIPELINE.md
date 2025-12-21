# Apollo CI/CD Pipeline Documentation

> **Last Updated**: 2025-11-24  
> **Related Issue**: [logos#315](https://github.com/c-daly/logos/issues/315) - CI/CD Enhancements

## Overview

Apollo's CI/CD pipeline ensures code quality, type safety, and functional correctness through automated testing, linting, type checking, and end-to-end testing. The pipeline runs on all pushes to `main` and `develop` branches, as well as on all pull requests targeting these branches.

## Workflows

### 1. Main CI Workflow (`ci.yml`)

The primary CI workflow orchestrates multiple jobs to validate both Python and JavaScript/TypeScript code.

#### Jobs

##### `standard`
Uses the reusable standard CI workflow from the logos repository to run:
- **Linting**: Ruff and Black for Python, ESLint for JavaScript/TypeScript
- **Type Checking**: mypy for Python (with `disallow_untyped_defs`), TypeScript compiler in strict mode
- **Unit Tests**: pytest for Python, Vitest for JavaScript
- **Build Validation**: Vite build for webapp

**Python Versions Tested**: 3.9, 3.10, 3.11

##### `python-coverage`
Runs Python tests with coverage and uploads results to Codecov with the `python` flag.
- **Coverage Format**: XML (cobertura)
- **Upload Flag**: `python`
- **Runs On**: Python 3.11

##### `webapp-coverage`
Runs JavaScript tests with coverage and uploads results to Codecov with the `javascript` flag.
- **Coverage Format**: Cobertura XML
- **Upload Flag**: `javascript`
- **Coverage Thresholds**: 60% for lines, functions, branches, and statements
- **Test Runner**: Vitest with v8 coverage provider

##### `playwright-e2e`
Runs browser-based end-to-end tests using Playwright.
- **Browsers**: Chromium (primary), Firefox, WebKit (configured)
- **CI Browser**: Chromium only for speed
- **Artifacts**: HTML reports, test results, screenshots, videos on failure
- **Retention**: 7 days

### 2. E2E Workflow (`e2e.yml`)

Runs integration tests that spin up the full Apollo stack using docker-compose.

#### Key Features
- **Required**: Cannot be skipped (removed workflow_dispatch skip option)
- **Services**: Spins up Sophia, Talos, and other required services
- **Timeout**: 10 minutes
- **Artifact Capture**: 
  - Test logs from `tests/e2e/logs/`
  - Screenshots from `tests/e2e/screenshots/`
  - Docker compose logs
- **Cleanup**: Always runs to ensure containers are stopped

#### Artifacts
All E2E artifacts are uploaded regardless of test outcome:
- **Name**: `e2e-artifacts-{run_number}`
- **Path**: `e2e-artifacts/` (logs and screenshots)
- **Retention**: 7 days

## Type Checking

### Python (mypy)
Configuration in `pyproject.toml`:
```toml
[tool.mypy]
python_version = "3.9"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
```

- **Strictness**: High - all functions must have type annotations
- **Target**: `src/` directory
- **Execution**: Via reusable CI workflow

### TypeScript
Configuration in `webapp/tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

- **Strictness**: Full strict mode enabled
- **Execution**: `npm run type-check` in CI

## Coverage Reporting

### Python Coverage
- **Tool**: pytest-cov
- **Format**: XML (cobertura) + terminal output
- **Upload**: Codecov with `python` flag
- **Command**: `pytest --cov=apollo --cov-report=xml --cov-report=term`

### JavaScript Coverage
- **Tool**: Vitest with v8 coverage provider
- **Format**: lcov, cobertura XML, HTML, JSON, text
- **Upload**: Codecov with `javascript` flag
- **Thresholds**: 60% for all metrics (lines, functions, branches, statements)
- **Command**: `npm run coverage`

### Codecov Integration
Coverage reports are uploaded to Codecov with distinct flags for better tracking:
- `python`: Python test coverage
- `javascript`: JavaScript/TypeScript test coverage

## Testing Strategy

### Unit Tests
- **Python**: pytest in `tests/` directory
- **JavaScript**: Vitest in `webapp/src/` directory (co-located with source)
- **Run on**: Every commit and PR

### Integration Tests
- **Location**: `tests/e2e/`
- **Tool**: Custom Python test harness with docker-compose
- **Services**: Full stack (Sophia, Talos, Apollo)
- **Run on**: Every commit and PR

### Browser E2E Tests
- **Location**: `webapp/e2e/`
- **Tool**: Playwright
- **Coverage**: Basic smoke tests and navigation
- **Browsers**: Chromium (CI), Firefox, WebKit (local)
- **Run on**: Every commit and PR

## Local Development

### Running Tests Locally

#### Python Tests
```bash
# Unit tests
pytest

# With coverage
pytest --cov=apollo --cov-report=term --cov-report=html

# E2E tests
cd tests/e2e
python test_e2e_flow.py
```

#### JavaScript Tests
```bash
cd webapp

# Unit tests
npm test

# With coverage
npm run coverage

# Playwright E2E
npm run test:e2e

# Playwright UI mode
npm run test:e2e:ui
```

### Type Checking

#### Python
```bash
mypy src
```

#### TypeScript
```bash
cd webapp
npm run type-check
```

### Linting

#### Python
```bash
# Check
ruff check src tests
black --check src tests

# Fix
ruff check --fix src tests
black src tests
```

#### JavaScript
```bash
cd webapp

# Check
npm run lint

# Fix
npm run lint:fix
```

## Artifact Management

### E2E Test Artifacts
- **Logs**: Captured from test output and docker compose
- **Screenshots**: Captured on test failure (when implemented in tests)
- **Storage**: GitHub Actions artifacts
- **Access**: Available in workflow run summary

### Playwright Artifacts
- **HTML Report**: Interactive test results viewer
- **Test Results**: Detailed JSON/XML test results
- **Screenshots**: Captured on failure
- **Videos**: Recorded for failed tests
- **Storage**: GitHub Actions artifacts
- **Access**: Available in workflow run summary

## Secrets and Configuration

### Required Secrets
- `CODECOV_TOKEN`: Required for coverage uploads (configured at repository level)

### Environment Variables
- `CI`: Set to `true` in GitHub Actions
- `BASE_URL`: Used by Playwright for webapp URL (defaults to `http://localhost:5173`)

## Troubleshooting

### E2E Tests Failing
1. Check docker-compose logs in the E2E artifacts
2. Review test logs in artifacts
3. Verify service startup order and timing
4. Check for port conflicts

### Playwright Tests Failing
1. Review HTML report in artifacts
2. Check screenshots for visual issues
3. Review browser console logs in test output
4. Verify webapp build succeeded

### Coverage Upload Failures
Coverage uploads are set to non-blocking (`fail_ci_if_error: false`). Check:
1. Codecov token is configured
2. Coverage XML files are generated
3. Network connectivity to Codecov

## Future Enhancements

Potential improvements identified for future phases:
- [ ] Parallel E2E test execution
- [ ] Visual regression testing
- [ ] Performance benchmarking in CI
- [ ] Dependency security scanning
- [ ] Docker image builds and registry pushes
- [ ] Automated deployment to staging environments

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Playwright Documentation](https://playwright.dev/)
- [Vitest Documentation](https://vitest.dev/)
- [Codecov Documentation](https://docs.codecov.com/)
- [Logos Reusable CI Workflow](https://github.com/c-daly/logos/blob/main/.github/workflows/reusable-standard-ci.yml)
