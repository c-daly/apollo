# Apollo-Hermes-Sophia Integration Validation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate the feedback loop infrastructure works end-to-end: Apollo → Hermes → Sophia → Neo4j → Apollo graph viewer.

**Architecture:** Spin up the full stack, send a test message through Apollo, trace it at each integration point, and confirm data appears in the graph viewer. Document gaps and fix issues as discovered.

**Tech Stack:** Python/FastAPI (Apollo, Hermes, Sophia), Neo4j (HCG), React/TypeScript (Apollo webapp), Docker Compose

---

## Task 1: Verify Service Health

**Files:**
- Reference: `apollo/docker-compose.yml` or equivalent startup scripts
- Reference: `hermes/docker-compose.yml`
- Reference: `sophia/docker-compose.yml`

**Step 1: Start Neo4j**

```bash
cd /home/fearsidhe/projects/LOGOS/sophia
docker compose up -d neo4j
```

Wait for healthy status.

**Step 2: Verify Neo4j connection**

```bash
curl -u neo4j:password http://localhost:47474/db/neo4j/tx
```

Expected: HTTP 200 response (or check credentials in sophia config)

**Step 3: Start Sophia**

```bash
cd /home/fearsidhe/projects/LOGOS/sophia
poetry run python -m sophia.api.app
```

Or via docker compose if configured.

**Step 4: Verify Sophia health**

```bash
curl http://localhost:48000/health
```

Expected: `{"status": "healthy", ...}` with neo4j connected

**Step 5: Start Hermes**

```bash
cd /home/fearsidhe/projects/LOGOS/hermes
poetry run python -m hermes.main
```

**Step 6: Verify Hermes health**

```bash
curl http://localhost:18000/health
```

Expected: `{"status": "healthy", ...}`

**Step 7: Start Apollo API**

```bash
cd /home/fearsidhe/projects/LOGOS/apollo
poetry run python -m apollo.api.server
```

**Step 8: Verify Apollo health**

```bash
curl http://localhost:28000/health
```

Expected: `{"status": "healthy", ...}`

**Step 9: Document startup results**

Note which services started, which failed, and any configuration issues discovered.

---

## Task 2: Verify Apollo → Hermes Connection

**Files:**
- Reference: `apollo/src/apollo/client/hermes_client.py`
- Reference: `apollo/src/apollo/api/server.py`

**Step 1: Check Apollo's Hermes client configuration**

```bash
grep -r "HERMES" /home/fearsidhe/projects/LOGOS/apollo/src/
```

Note the expected host/port environment variables.

**Step 2: Test direct Hermes call from Apollo's perspective**

```bash
curl -X POST http://localhost:18000/llm \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, this is a test message", "provider": "echo"}'
```

Expected: Response with echoed content (using echo provider to avoid LLM costs)

**Step 3: Test Apollo's chat endpoint**

```bash
curl -X POST http://localhost:28000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, this is a test from Apollo"}'
```

Expected: Response indicating message was processed through Hermes

**Step 4: Document Apollo → Hermes results**

Note: Does the connection work? Any auth issues? Environment variable mismatches?

---

## Task 3: Verify Hermes → Sophia Forwarding

**Files:**
- Reference: `hermes/src/hermes/main.py` (look for `_forward_llm_to_sophia`)
- Reference: `sophia/src/sophia/api/app.py` (look for `/ingest/hermes_proposal`)

**Step 1: Check Hermes sophia forwarding configuration**

```bash
grep -r "SOPHIA" /home/fearsidhe/projects/LOGOS/hermes/src/
```

Note: `SOPHIA_HOST`, `SOPHIA_PORT`, `SOPHIA_API_TOKEN` environment variables.

**Step 2: Watch Sophia logs while calling Hermes**

Terminal 1 (Sophia with visible logs):
```bash
cd /home/fearsidhe/projects/LOGOS/sophia
poetry run python -m sophia.api.app
```

Terminal 2 (call Hermes):
```bash
curl -X POST http://localhost:18000/llm \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Test message for sophia forwarding", "provider": "echo"}'
```

**Step 3: Check Sophia logs for ingestion**

Expected in Sophia logs: Indication that `/ingest/hermes_proposal` was called with the payload.

**Step 4: Query Neo4j for new data**

```bash
curl -X POST http://localhost:47474/db/neo4j/tx/commit \
  -H "Content-Type: application/json" \
  -u neo4j:password \
  -d '{"statements": [{"statement": "MATCH (n) RETURN n LIMIT 10"}]}'
```

Or use Neo4j browser at http://localhost:47474

**Step 5: Document Hermes → Sophia results**

Note: Did the forwarding happen? What got stored in Neo4j? Any errors?

---

## Task 4: Verify Sophia → Apollo Graph Snapshot

**Files:**
- Reference: `sophia/src/sophia/api/app.py` (look for `/hcg/snapshot`)
- Reference: `apollo/webapp/src/lib/sophia-client.ts`

**Step 1: Call Sophia snapshot endpoint directly**

```bash
curl http://localhost:48000/hcg/snapshot
```

Expected: JSON with `entities` and `edges` arrays

**Step 2: Call Apollo's proxy to Sophia**

```bash
curl http://localhost:28000/api/hcg/snapshot
```

Expected: Same data as direct Sophia call (Apollo proxies to Sophia)

**Step 3: Document snapshot results**

Note: Does data come back? Is it the data we just inserted? Any format issues?

---

## Task 5: Verify Apollo Graph Viewer

**Files:**
- Reference: `apollo/webapp/src/components/GraphViewer.tsx`
- Reference: `apollo/webapp/src/hooks/useHCG.ts`

**Step 1: Start Apollo webapp**

```bash
cd /home/fearsidhe/projects/LOGOS/apollo/webapp
npm run dev
```

Or if using different package manager:
```bash
pnpm dev
```

**Step 2: Open browser to graph viewer**

Navigate to: http://localhost:3000 (or wherever the graph viewer is routed)

**Step 3: Verify graph renders**

Expected: See nodes/edges from the data we pushed through earlier.

**Step 4: Document viewer results**

Note: Does it render? Are the nodes visible? Any console errors?

---

## Task 6: Document Findings and Gaps

**Files:**
- Create: `apollo/docs/plans/2026-01-22-integration-validation-results.md`

**Step 1: Create results document**

Document for each integration point:
- Status: Working / Broken / Partially working
- Issues discovered
- Configuration needed
- Cleanup opportunities noted

**Step 2: Prioritize gaps**

List issues by priority:
1. Blockers (breaks the loop)
2. Degraded (works but poorly)
3. Housekeeping (cleanup opportunities)

**Step 3: Commit findings**

```bash
cd /home/fearsidhe/projects/LOGOS/apollo
git add docs/plans/
git commit -m "docs: integration validation results and gap analysis"
```

---

## Task 7: Address Critical Gaps (if any)

This task is dynamic based on what Task 6 discovers. For each blocker:

**Step 1: Identify root cause**

Read the relevant code, check logs, trace the failure.

**Step 2: Write failing test (if testable)**

**Step 3: Fix the issue**

**Step 4: Verify the fix**

**Step 5: Commit**

```bash
git commit -m "fix: [describe what was fixed]"
```

---

## Success Criteria

- [ ] All services start and report healthy
- [ ] Message sent through Apollo reaches Hermes
- [ ] Hermes forwards to Sophia `/ingest/hermes_proposal`
- [ ] Data appears in Neo4j
- [ ] Sophia `/hcg/snapshot` returns the data
- [ ] Apollo graph viewer displays the data
- [ ] Gaps documented with priorities
