"""DEPRECATED: Legacy integration tests.

These tests have been superseded by the new integration test suite in:
    tests/integration/

The new test structure:
    tests/integration/test_hcg_integration.py      - Neo4j/HCG graph tests
    tests/integration/test_persona_integration.py  - Persona diary tests
    tests/integration/test_hermes_integration.py   - Hermes/Chat tests
    tests/integration/conftest.py                  - Shared fixtures & tier docs

To run the new integration tests:
    RUN_INTEGRATION_TESTS=1 pytest tests/integration/ -v

This file is kept for reference only and will be removed in a future release.
"""

import pytest

# Skip entire module - these are legacy tests
pytestmark = pytest.mark.skip(
    reason="Legacy tests replaced by tests/integration/ - see module docstring"
)
