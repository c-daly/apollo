# LOGOS CI Inventory

> Tracks Apollo issue #33 (CI parity: inventory existing workflows) and feeds parent epic #32.

This document captures the CI footprint across the LOGOS repos as of 2025-11-21 so we know exactly what the forthcoming reusable workflow (issue #294 in the meta repo) needs to cover.

## Coverage Snapshot

| Repo | Key workflows | Lint/Format | Type check | Unit tests | Service / integration | E2E / system | Coverage | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| logos | `test`, `m1–m4`, `phase2-otel`, `phase2-perception`, `validate-artifacts` | ✅ Ruff | ⚠️ mypy dependency installed but not executed | ✅ Pytest matrix (3.10–3.12) | ✅ Multiple docker-compose gates (M1–M4, OTel, perception) | ✅ Prototype E2E script (optional) | ⚠️ Uploads XML artifact only | Type-checking missing; coverage only exported as artifact except perception tokened uploads. |
| apollo | `ci`, `phase2-apollo-web`, `e2e` | ✅ Ruff/Black + npm lint | ✅ mypy + TS type-check | ✅ Pytest across 3.9–3.11 & Vitest | ✅ CLI E2E harness via docker-compose (separate workflow) | ✅ Same harness (opt-out via `skip_e2e`) | ✅ Codecov for Python (no JS coverage) | Web workflow decoupled from base CI; E2E job can be skipped and lacks evidence artifacts. |
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
- `ci.yml`: Python matrix (3.9–3.11) running Ruff, Black, mypy, pytest + Codecov.
- `phase2-apollo-web.yml`: Node 18 job for lint/type/test/build when `webapp/**` changes; no coverage/reporting artifact beyond build.
- `e2e.yml`: docker-compose harness that brings up Sophia/Talos shim; can be skipped via workflow dispatch input.
- **Gaps:** base CI has no awareness of the web workflow; E2E run produces no artifacts (logs/screenshots) and is easy to skip, so regressions may slip.

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

## Standard Workflow Adoption (Nov 21 Update)

| Repo | Template adoption | Notes |
| --- | --- | --- |
| logos | ✅ Template lives in `.github/workflows/reusable-standard-ci.yml`; existing `test.yml` remains bespoke for ontology gates. |
| apollo | ✅ `ci.yml` consumes the template (pip) + Node overrides. |
| sophia | ✅ Switched to the template with Poetry + the `-m "not integration"` pytest filter. |
| hermes | ✅ Base lint/type/test job uses the template; package build + optional Milvus integration job remain custom. |
| talos | ✅ Template drives Ruff/Black/mypy + the 95% coverage gate via Poetry. |

## Next Steps
1. Keep this inventory in sync with template changes (issues #32/#33). Move the LOGOS doc to “PR awaiting merge” once accepted.
2. Track reusable workflow updates in issue #294 and mirror them with per-repo subtasks (issue #295 et al.).
3. Use the template inputs to ratchet up gates (coverage thresholds, optional integration jobs) once each repo stabilizes.

## Follow-up backlog

- **Hermes:** Integration tests still depend on a manual label; file/track a follow-up to require them once Milvus/minio provisioning is faster.
- **Talos:** Add a simulator/hardware smoke workflow when deterministic fixtures exist.
- **Logos:** Run mypy inside `test.yml` (it's already installed) and publish Codecov summaries instead of raw XML artifacts.
