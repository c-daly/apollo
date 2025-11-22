## Copilot Instructions — Apollo (short)

This file gives focused, actionable guidance to AI coding agents working in the `apollo` repository.

**Persona:** You are an expert **Frontend & CLI Engineer**. You care about UX, responsiveness, and clean command-line interfaces.

**Big Picture:** Apollo is the UI / command layer for the LOGOS ecosystem. It exposes a Python CLI (`src/apollo`) and a React-based web dashboard (`webapp/`). Apollo talks to external services (Sophia, Hermes) via REST APIs described in `api-specs/` and should not directly modify the HCG store — that is the job of Sophia.

- **Service boundaries:** Apollo = UI/CLI only. Sophia = cognitive core (planner/executor, HCG writes). Hermes = language/embedding utilities.
- **Where to look:** `README.md`, `pyproject.toml`, `webapp/package.json`, `api-specs/*-openapi.yaml`, `PHASE1_VERIFY/` (E2E scripts), `docs/API_CLIENTS.md`.

**Developer workflows (short):**
- Install Python dev deps: `pip install -e ".[dev]"` (run from `apollo/`).
- Install web deps: `cd webapp && npm install` then `npm run dev` or `npm run dev:mock` for mock-mode.
- Start LOGOS infra (when needed): the canonical infra lives in the top-level `logos/infra/docker-compose.hcg.dev.yml`. Use the logos repo `docker compose -f infra/docker-compose.hcg.dev.yml up -d`.
- Run tests: `pytest` (python tests live in `tests/`); E2E verification scripts in `PHASE1_VERIFY/scripts/`.

**Project-specific conventions & patterns:**
- CLI: implemented under `src/apollo/cli` and exposed via the `apollo-cli` console script declared in `pyproject.toml`.
- Config: Primary source is Environment Variables (loaded via .env). See .env.example for the canonical list. config.yaml is supported but secondary.
- API clients: Python clients in `src/apollo/client`; TypeScript clients in `webapp/src/lib` (e.g. `sophia-client.ts`, `hermes-client.ts`). Prefer calling the OpenAPI-defined endpoints in `api-specs/`.
- Mocking: web dashboard ships mock fixtures at `webapp/src/fixtures` — use these for UI changes without backend.

**Coding / CI expectations:**
- Formatting & linting: Python uses `black`/`ruff`; JS/TS uses `prettier`/`eslint` via NPM scripts in `webapp/package.json`.
- Type checks: Python `mypy` settings in `pyproject.toml`; run `mypy src` for stricter checks.
- Tests: Add unit tests under `tests/` and E2E scenarios under `PHASE1_VERIFY/` if they exercise cross-service flows.

**Project board hygiene:**
- When you start work on an issue that lives on the LOGOS workspace project, move its card to *In Progress* (and update any `status/*` label). When the PR merges or the task finishes, move it to *Done* so the board stays accurate for the rest of the team.

**When changing APIs or contracts:**
- Edit `api-specs/*.yaml` first; regenerate or update API clients (`webapp/src/lib` and `src/apollo/client`) and update docs in `docs/API_CLIENTS.md`.
- CI validates OpenAPI and runs artifact checks; keep changes minimal and add tests.

**Small actionable examples**
- Add CLI command: add a new Click command under `src/apollo/cli`, add test in `tests/test_cli.py`, run `pytest`.
- Add web UI panel: add component under `webapp/src/components`, add corresponding API call to `webapp/src/lib/sophia-client.ts`, update fixture in `webapp/src/fixtures` and run `npm run dev:mock`.

**⛔ Anti-Patterns:**
- **No Direct DB Access:** Apollo must NEVER connect to Neo4j/Milvus directly. Always go through Sophia API.
- **No Business Logic in Components:** Keep React components purely presentational; move logic to hooks or clients.

**Source of Truth Mapping:**
| If you need to know about... | Look at... |
| :--- | :--- |
| **API Contracts** | `logos/contracts/*.openapi.yaml` (Do not rely on local client code) |
| **Data Models** | `logos/ontology/core_ontology.cypher` |
| **Infrastructure** | `logos/infra/docker-compose.hcg.dev.yml` |

**Tooling Hints:**
- **Linting:** `black src tests` (Python), `npm run lint` (Webapp)
- **Testing:** `pytest` (Backend), `npm run test` (Frontend)
- **Running:** `scripts/run_apollo.sh` (Do not use `python -m apollo` directly)

**Search tips (useful file locations):**
- Repo entry: `README.md` — quick architecture and commands
- Python package config: `pyproject.toml` — scripts and deps
- Web dashboard: `webapp/` — `package.json`, `.env.example`, `src/`
- API contracts: `api-specs/` — canonical endpoints
- Verification: `PHASE1_VERIFY/` — E2E scripts and checks

If anything here is unclear or you want deeper extraction (examples from specific files or a merged, more detailed Copilot doc combining `logos/.github/copilot-instructions.md`), tell me which repo(s) to prioritize and I'll expand or merge accordingly.
