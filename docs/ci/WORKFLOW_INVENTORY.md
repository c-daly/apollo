# LOGOS CI Inventory

> Tracks Apollo issue #33 (CI parity: inventory existing workflows) and feeds parent epic #32.

This document captures the CI footprint across the LOGOS repos as of 2025-11-21 so we know exactly what the forthcoming reusable workflow (issue #294 in the meta repo) needs to cover.

## Coverage Snapshot

| Repo | Key workflows | Lint/Format | Type check | Unit tests | Service / integration | E2E / system | Coverage | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| logos | `test`, `m1–m4`, `phase2-otel`, `phase2-perception`, `validate-artifacts` | ✅ Ruff | ⚠️ mypy dependency installed but not executed | ✅ Pytest matrix (3.10–3.12) | ✅ Multiple docker-compose gates (M1–M4, OTel, perception) | ✅ Prototype E2E script (optional) | ⚠️ Uploads XML artifact only | Type-checking missing; coverage only exported as artifact except perception tokened uploads. |
| apollo | `ci`, `e2e` | ✅ Ruff/Black + npm lint | ✅ mypy + TS type-check (strict) | ✅ Pytest across 3.9–3.11 & Vitest | ✅ CLI E2E harness via docker-compose (separate workflow) | ✅ Python E2E + Playwright browser tests | ✅ Codecov for Python & JS with flags | All tests required; E2E captures artifacts (logs/screenshots); JS coverage enabled with thresholds. |
| sophia | `ci` | ✅ Black/Ruff | ❌ | ✅ Pytest (unit-only) | ❌ | ❌ | ✅ Codecov (py3.12 only) | Integration suites are manual/local; no shared SDK verification yet. |
| hermes | `ci`, `phase2-hermes-service` | ✅ Ruff/Black | ✅ mypy | ✅ Pytest via Poetry | ⚠️ Milvus/Neo4j integration job only on push or labeled PRs | ❌ | ✅ Codecov w/ flags | Duplicate workflows diverge; integration tests are optional on PRs. |
| talos | `ci` | ✅ Ruff/Black | ✅ mypy | ✅ Pytest (3.11–3.12) | ❌ | ❌ | ✅ Codecov (py3.12) | CI triggers watch `main` only; no hardware/simulator smoke tests. |

Legend: ✅ = covered, ⚠️ = partially covered or manual, ❌ = missing.

## Repository Details

### logos (meta)
- `test.yml`: multi-version pytest + Ruff. Installs mypy but never runs it; uploads `coverage.xml` as artifact.
- `m1-neo4j-crud.yml`, `m2-shacl-validation.yml`, `m3-planning.yml`, `m4-end-to-end.yml`: docker-compose heavy gates that prove key milestones; not consistently required for PRs.
- `phase2-otel.yml`, `phase2-perception.yml`: perception/observability pipelines plus YAML validation.
- `validate-artifacts.yml`, `sdk-regen.yml`, etc.: automation but no coverage.
- **Gaps:** enforce mypy, standardize coverage uploads, reduce reliance on optional cron-based gates.

### apollo (this repo)
- `ci.yml`: Uses reusable standard CI workflow with Python matrix (3.9–3.11) running Ruff, Black, mypy, pytest. Separate jobs for Python coverage (with `python` flag), JavaScript coverage (with `javascript` flag), and Playwright E2E tests. All uploads use Codecov with appropriate flags.
- `e2e.yml`: docker-compose harness that brings up Sophia/Talos services; runs Python E2E tests. Captures artifacts on all runs: test logs, screenshots, and docker-compose logs. Tests are required (no skip option).
- **Enhancements (Phase 2):** E2E tests now mandatory with artifact capture; Playwright added for browser testing; JavaScript coverage with 60% thresholds; TypeScript strict mode enforced; coverage reporting standardized with flags.

### sophia
- `ci.yml`: Poetry-based setup, Ruff/Black lint, pytest excluding integration marks, Codecov upload on Python 3.12 only.
- **Gaps:** no mypy/pyright, no integration/perception smoke tests, no e2e coverage, manual docker-compose scripts for JEPA are outside CI.

### hermes
- `ci.yml`: Poetry install, Ruff/Black/mypy, pytest with Codecov; optional integration job triggered on push or PR label `integration-test` to launch etcd/minio/milvus/neo4j.
- `phase2-hermes-service.yml`: duplicates lint/type/test before running Milvus smoke tests.
- **Gaps:** integration tests not enforced on all PRs; workflows duplicate logic; no cross-service E2E coverage.

### talos
- `ci.yml`: Ruff/Black/mypy, pytest with 95% coverage gate, Codecov upload only for Python 3.12.
- **Gaps:** no integration/e2e tests, workflow triggers only on `main`, so branches lack automatic feedback.

## Next Steps
1. Finish review of this inventory with the team (issues #32/#33). Move the LOGOS doc to “PR awaiting merge” once accepted.
2. Implement the shared workflow template (issue #294) and reference it from each repo (issue #295 + per-repo subtasks).
3. Once the template lands, gradually enable stricter gates (mypy, coverage thresholds, integration toggles) per repo.
