# Agent Instructions

This guidance applies to the Apollo repository and governs how AI agents interact with the codebase.

## Repository context

### Ecosystem overview
Apollo is one of **five tightly coupled repositories** that compose the LOGOS cognitive architecture:

| Repo | Purpose |
|------|---------|
| **logos** | Foundry—canonical contracts, ontology, SDKs, shared tooling |
| **sophia** | Non-linguistic cognitive core (Orchestrator, CWM-A/G, Planner, Executor) |
| **hermes** | Stateless language & embedding utility (STT, TTS, NLP, embeddings) |
| **talos** | Hardware abstraction layer for sensors/actuators |
| **apollo** (this repo) | Thin client UI and command layer |

Changes here may depend on contracts and SDKs from logos. **Check upstream compatibility before making changes.**

### This repository
Apollo provides the user interface and command layer for LOGOS:
- **CLI Tool** (`apollo-cli`) – Command-line interface for interacting with Sophia
- **Web Dashboard** (`webapp/`) – React-based UI for visualization and monitoring
- **Python Backend** – FastAPI service bridging UI to Sophia

Key directories:
- `webapp/` – TypeScript/React frontend
- `src/apollo/` – Python backend and CLI
- `examples/` – Usage examples and demos

### Dependencies on logos
- Apollo consumes SDKs generated from `logos/contracts/`
- If contracts change upstream, regenerate and update the vendored SDK
- `logos_test_utils` may be used for integration tests

### Key documentation
- `README.md` – Installation, features, architecture overview
- `CONTRIBUTING.md` – PR process and coding standards
- `.github/copilot-instructions.md` – Detailed development guidance

---

## Communication and transparency

### Announce intent before acting
Do not take impactful actions—large refactors, dependency bumps, new features, API changes—without first describing your intent and waiting for acknowledgment. Explain *what* you plan to change and *why*.

### Surface uncertainty early
If a task is ambiguous, ask clarifying questions rather than guessing. When multiple reasonable interpretations exist, list them and ask which to pursue.

### No silent side effects
If your change will affect behavior, logging, error handling, or external APIs, call it out explicitly before proceeding.

---

## Workflow safety

### Never work directly on `main`
Always create a feature branch before making any changes. Branch naming convention:
```
{kind}/{issue-number}-{short-kebab}
# e.g., feature/1234-chat-panel-mobile-fix
```

### Never push without a pull request
All changes—no matter how small—must go through a PR. Direct pushes to any shared branch are forbidden.

### Respect cross-repo dependencies
Before shipping a change that modifies shared contracts, APIs, or data structures:
1. Identify if the change requires upstream updates in logos first.
2. If the change is breaking, **stop** and create a ticket describing the required change.
3. Coordinate migrations via issues so dependent repos can adapt.

---

## Code quality and professional practices

### Elevate code you touch
When modifying existing code, lift the surrounding area toward current best practices—improved typing, clearer error handling, better logging, more readable structure. Do not blindly copy nearby patterns that look stale or inconsistent.

### Small, composable functions
Prefer small, focused functions over monolithic blocks. Each function should do one thing well. Compose larger behaviors from smaller, testable units.

### Type hints and docstrings
Add or update type hints and docstrings whenever you introduce or modify public functions, classes, or methods. Prefer explicit types over `Any`.

### Frontend standards (webapp/)
- Use TypeScript strict mode
- Follow React best practices (hooks, functional components)
- Keep components small and focused
- Use proper prop typing

### Backward compatibility
Maintain backward compatibility unless the task explicitly calls for a breaking change. If you must break compatibility:
- Call it out clearly in your summary.
- Ensure tests cover the migration path.
- File tickets for dependent repos if cross-repo impact exists.

### Defensive coding
- Validate inputs; handle edge cases.
- Avoid silent failures—log or raise when something unexpected occurs.
- If skipping handling is intentional, document why with a comment.

### Purposeful comments
Explain *intent* or *non-obvious decisions*. Do not restate what the code already expresses. Keep comments current when you change logic.

### Security and privacy hygiene
- Never log secrets, tokens, or PII.
- Sanitize user inputs; assume external data is hostile.
- When touching auth or data-handling code, review for least-privilege and error hygiene.

---

## Reflection and course correction

### Pause when things aren't working
If you encounter:
- Repeated errors or test failures
- Persistent friction or unexpected behavior
- Uncertainty about the right approach

**Stop.** Do not push forward blindly.

### Reassess and gather context
- Reread relevant files, docs, or specs.
- Search for related patterns in the codebase.
- Check if assumptions you made earlier are still valid.
- Ask for clarification or additional context if needed.

### Adjust your approach
If the same strategy keeps failing, try a different angle. Consider whether:
- The problem is elsewhere (e.g., upstream data, configuration).
- You're missing context from another repo.
- The task needs to be broken into smaller steps.

Document what you tried and why it didn't work so you (or another agent) don't repeat the same mistakes.

---

## How to work

### Searching
Prefer `rg` (ripgrep) for fast text searches. Avoid slow recursive `grep` or `find` commands when ripgrep can do the job.

### Dependency management
- **Python**: Use Poetry. Commit both `pyproject.toml` and `poetry.lock` together.
- **Frontend**: Use npm. Commit both `package.json` and `package-lock.json` together.

### Keep diffs minimal
Stay focused on the task. Avoid drive-by refactors, unrelated formatting changes, or scope creep. If you notice something worth fixing outside the current task, note it and suggest a follow-up ticket instead of bundling it in.

---

## Testing and linting

### Linting and formatting

All Python code must pass ruff and mypy before merge.

**Ruff** (linting + formatting):
```bash
# Check for issues
poetry run ruff check .

# Auto-fix what's possible
poetry run ruff check --fix .

# Format code
poetry run ruff format .

# Check formatting without changing files
poetry run ruff format --check .
```

**Mypy** (type checking):
```bash
poetry run mypy src/
```

**Pre-commit workflow**:
```bash
# Before committing, run:
poetry run ruff check --fix .
poetry run ruff format .
poetry run mypy src/
poetry run pytest tests/unit/
```

**Common issues and fixes**:
- `F401 imported but unused` → Remove the import or add `# noqa: F401` if re-exported
- `E501 line too long` → Ruff format usually fixes this; if not, break the line manually
- `I001 import order` → `ruff check --fix` will reorder imports
- Mypy `missing-imports` → Add type stubs or `# type: ignore[import-untyped]`

### Local CI parity
For full CI parity, run:
```bash
./.github/workflows/run_ci.sh
```
This wraps linting and tests with the same arguments as the GitHub Actions workflow.

### Narrower checks
For scoped changes, run the smallest relevant subset:
```bash
# Python
poetry run pytest <path>
poetry run ruff check <path>
poetry run mypy src/

# Frontend
cd webapp && npm run lint
cd webapp && npm test
```

### Always note what you ran
In your summary, explicitly list which checks you executed. If none were run (e.g., documentation-only change), state that clearly.

---

## Pull request and summary expectations

### Issue format

**Title:** `[apollo] Short imperative description`
```
[apollo] Fix chat panel not rendering on mobile
[apollo] Add dark mode toggle to dashboard
```

**Body:**
```markdown
## Summary
One or two sentences describing the problem or feature.

## Context
Why this matters. Link to related issues, specs, or discussions if relevant.

## Acceptance criteria
- [ ] Testable criterion 1
- [ ] Testable criterion 2
- [ ] Tests pass, no regressions

## Notes (optional)
Implementation hints, open questions, or out-of-scope items.
```

**Labels:** At minimum: `component:apollo`, `type:*`, `priority:*`

---

### Labels, projects, and status

**Required labels for issues:**

| Category | Options | Notes |
|----------|---------|-------|
| **Component** | `component:logos`, `component:sophia`, `component:hermes`, `component:talos`, `component:apollo`, `component:infrastructure` | Which repo/area is affected |
| **Type** | `type:bug`, `type:feature`, `type:documentation`, `type:refactor`, `type:testing`, `type:research` | Nature of work |
| **Priority** | `priority:high`, `priority:medium`, `priority:low` | Urgency (`priority:critical` for blockers) |

**Optional but recommended:**

| Category | Options | Notes |
|----------|---------|-------|
| **Status** | `status:in-progress`, `status:review`, `status:blocked`, `status:on-hold` | Current state |
| **Phase** | `phase:1`, `phase:2` | Project phase scope |
| **Surface** | `surface:browser`, `surface:cli`, `surface:llm` | User-facing surface |
| **Domain** | `domain:hcg`, `domain:planner`, `domain:diagnostics` | Technical domain |

**Project board:**
- **Every issue and PR must be added to the `Project LOGOS` GitHub Project.** This is required, not optional.
- **Every issue and PR must have a status, and the status must be kept current.** This is also required.
- When creating an issue, immediately add it to `Project LOGOS` and set the appropriate status column.
- When opening a PR, add it to `Project LOGOS` as well.
- Move cards between columns as work progresses; keep `status:*` labels in sync with the column.
- When you start work on an issue, move it to *In Progress* and apply `status:in-progress`.
- When the PR is ready for review, apply `status:review`.
- When the PR merges, move the issue to *Done*.

**Cross-repo issues:**
- If an issue spans multiple repos, apply multiple `component:*` labels.
- Note affected repos explicitly in the issue body.
- Create linked issues in sibling repos when coordination is required.

---

### Pull request format

**Title:** `[apollo] Short imperative description (#issue)`
```
[apollo] Fix chat panel not rendering on mobile (#142)
```

**Body:**
```markdown
## Summary
Brief description of what this PR does.

Closes #142

## Changes
- Fixed responsive breakpoint in `ChatPanel.tsx`
- Added mobile-specific styles
- Added unit tests for responsive behavior

## Testing
- `cd webapp && npm test` – ✅
- `cd webapp && npm run lint` – ✅
- Manual testing on mobile viewport – ✅

## Notes (optional)
Anything reviewers should know—tradeoffs, follow-up work, etc.
```

---

### Concise bullet summaries
- Highlight key changes, scoped to the areas you touched.
- Note any behavioral changes, deprecations, or migration steps.
- If the change affects sibling repos, call that out.

### Testing section
Include a bullet list of tests/checks executed using the exact commands you ran:
```
- `poetry run pytest tests/` – ✅ passed
- `cd webapp && npm test` – ✅ passed
```
Or, for documentation-only work:
```
- ⚠️ Not run (documentation-only change)
```

### Link related issues
Use `Closes #<issue-number>` or `Refs #<issue-number>` to connect PRs to their tracking issues.

---

## GitHub MCP integration

### Using GitHub tools
This workspace has access to GitHub via the MCP (Model Context Protocol) server. Use the `mcp_io_github_git_*` tools to:
- Search issues and pull requests
- Create branches, commits, and PRs
- Read file contents from remote repos
- Manage labels and reviews

### Authentication troubleshooting
If GitHub MCP tools fail with authentication errors:
1. Run `~/mcp` in the terminal to refresh the `GITHUB_MCP_PAT` environment variable.
2. Retry the operation.

The script populates `GITHUB_MCP_PAT` with a fresh token. You may need to restart the MCP server or your session after running it.

### Best practices for GitHub operations
- Use `get_me` first to verify authentication and understand the current user context.
- Prefer `search_*` tools for targeted queries; use `list_*` for broad enumeration.
- When creating PRs, search for PR templates in `.github/PULL_REQUEST_TEMPLATE.md` first.
- Always link PRs to issues with `Closes #<number>` in the description.

---

## Quick reference

| Task | Command / Location |
|------|-------------------|
| Install Python deps | `poetry install` |
| Install frontend deps | `cd webapp && npm install` |
| Run Python tests | `poetry run pytest` |
| Run frontend tests | `cd webapp && npm test` |
| Full CI locally | `./.github/workflows/run_ci.sh` |
| Start dev server | `cd webapp && npm run dev` |
| Refresh GitHub token | `~/mcp` |
