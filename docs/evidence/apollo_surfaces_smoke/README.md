# Apollo Surfaces Smoke (CLI + Webapp)

Artifacts supporting issue #31 (shared smoke) and linked tickets #17/#18.

## Environment
- Stack: local docker-compose from `tests/e2e` (Sophia API, Hermes stub, Talos shim, HCG Neo4j)
- Date: 2025-11-21
- CLI host: Ubuntu 24.04 (dev container)
- Webapp: Vite dev server hitting same stack via `.env.local`

## CLI verification
Command:
```bash
cd tests/e2e
python test_e2e_flow.py | tee ../../docs/evidence/apollo_surfaces_smoke/cli_smoke_2025-11-21.txt
```
Result: 14/14 assertions passed (goal → plan → execute loop, state sync, plan retrieval). See [`cli_smoke_2025-11-21.txt`](cli_smoke_2025-11-21.txt).

## Webapp verification
1. Boot the same stack (`python tests/e2e/test_e2e_flow.py --skip-tests` to leave services running).
2. In another terminal:
   ```bash
   cd webapp
   npm ci
   npm run dev -- --host 0.0.0.0 --port 4173
   ```
3. Load `http://localhost:4173` and point the `.env.local` URLs to the running Sophia/Hermes/HCG services (defaults from Phase 2 docs). 
4. Confirm:
   - Chat panel streams responses from Hermes (observe request/response JSON in browser dev tools).
   - Graph viewer updates after issuing the same pick-and-place command from the CLI.
   - Diagnostics panel shows live log/telemetry feed from the HCG WebSocket proxy.
   - Persona Diary entries populate automatically from the state history.
5. (Optional) Capture a quick screen recording with any OS tool and drop it beside the log if needed (`docs/evidence/apollo_surfaces_smoke/webapp_smoke.mp4`).

Automation proxy: `npm run test -- --run` now exercises the SDK-bound clients (see CI) but manual browser verification ensures UX parity.

## Follow-up
- Reference this folder from issues #17 and #18 when closing them.
- Future runs: refresh the log filename with the current date and include any updated screen capture.
