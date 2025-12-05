# Documentation Audit Summary — Apollo

## Doc Audit
- `README.md` remains the primary onboarding guide with detailed CLI and webapp walkthroughs, demo scripts, and dependency checklists.
- `docs/HERMES_SETUP.md` provides a thorough integration story between Apollo and Hermes, including credential management and verification steps.
- `docs/API_CLIENTS.md` captures SDK usage scenarios and helps contributors understand client expectations across CLI and web surfaces.

## Gaps & Issues
- The main README still references `tests/phase*` directories and the legacy E2E orchestration instead of the generated `tests/e2e/stack/apollo/` assets.
- Environment variable guidance is inconsistent: some sections rely on `NEO4J_USER` while newer stack assets expect `NEO4J_USERNAME`; similarly, references to `MILVUS_*` ports differ between sections.
- Demo scripts such as `scripts/start_demo.sh` and `PHASE1_VERIFY/scripts/` are positioned as current tooling but represent legacy Phase 1 workflows that diverge from the shared stack flow.
- Several documents (e.g. `PHASE2_CI_IMPLEMENTATION.md`, `PHASE1_VERIFY/scripts/README.md`) declare milestones complete with expectations that the codebase no longer meets (e.g. full diagnostics surface, browser parity).
- CI instructions point to retired workflows and assume path-based dependency resolution rather than the upcoming package distribution plan.
- Webapp docs (`webapp/README.md`, `docs/API_CLIENTS.md`) describe bespoke Hermes integration instead of referencing the generated client/configuration pattern.

## Redundant or Low-Value Artifacts
- `PHASE1_VERIFY/scripts/README.md` and associated scripts duplicate setup instructions that now live in the main README and no longer reflect the preferred flow.
- `PHASE2_CI_IMPLEMENTATION.md` rehashes CI expectations already captured in the repo root README and the shared LOGOS docs.
- Historical implementation summaries (`C4A_IMPLEMENTATION_SUMMARY.md`) repeat milestone descriptions without adding actionable guidance for current contributors.

## Spec / Phase Realignment
- Phase-specific docs should be reframed as historical context or archived; the active work hinges on stack standardization, package distribution (#373), and updated testing workflows.
- Update `README.md` and related docs to highlight current objectives (generated stack adoption, SDK usage, CI dependencies) rather than Phase 1/2 milestones.
- Provide a concise “current vs. legacy” table so contributors know which scripts and instructions remain valid.

## Recommendations
1. Refresh `README.md`, `tests/e2e/README.md`, and `docs/API_CLIENTS.md` to reference the generated stack (`tests/e2e/stack/apollo/`), shared `.env` schema, and the render workflow; remove or clearly label the legacy Phase directories.
2. Consolidate environment and stack startup instructions into a single up-to-date guide, then link to it from CLI/Web docs; eliminate duplicates in `PHASE1_VERIFY/`.
3. Archive or relocate Phase-specific implementation summaries and CI write-ups to a historical section, replacing them with a changelog snippet or timeline.
4. Ensure Hermes integration docs explain how to use the generated SDK clients and configuration values rather than bespoke scripts.
5. Update CI guidance to reflect the forthcoming package distribution strategy (GitHub Packages) and remove instructions that assume path-based development setups.
