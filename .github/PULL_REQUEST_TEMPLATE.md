<!--
Pull Request template for apollo
Ensure the PR references its issue (use `Closes #<issue-number>` when ready to close).
-->

# PR Title
[area] Short summary (#<issue-number>)

## Summary
Brief description of the change and why it is needed. Keep it short and focused.

## Related Issue
Closes #<issue-number>
Or: See #<issue-number> (explain partial coverage)

## Changes
- Files / modules changed:
  - `path/to/file.py`
  - `webapp/src/components/MyPanel.tsx`

## How to run / test locally
Include exact commands and environment setup (copyable):

```bash
# From repo root
poetry install --with dev -E otel
cd webapp && npm install
# Start mock webapp
cd webapp && npm run dev:mock
# Run Python tests
poetry run pytest tests/unit
```

## Checklist (required)
- [ ] Linked the related issue (`Closes #<n>` or `See #<n>`)
- [ ] Tests added or updated
- [ ] Linting/formatting run (`ruff check --fix .` + `black .`; `npm run lint` for webapp)
- [ ] Type checks (Python `poetry run mypy src/` / TS `npm run type-check`) as applicable
- [ ] Documentation updated (README, `docs/`, or OpenAPI spec)
- [ ] CI is passing

## Reviewers / Code owners
Please request at least one reviewer from the relevant area (use `CODEOWNERS` if present).

## Notes
Any additional notes for reviewers, rationale, or things to watch for.
