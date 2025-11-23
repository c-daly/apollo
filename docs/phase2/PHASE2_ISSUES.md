# Phase 2 Issues and Tasks

This document tracks the issues and tasks required for Apollo Phase 2 implementation, including updates resulting from the revised persona diary specification.

## New Issues

### Issue 1: Add `trigger` Field to PersonaEntry with Database Migration

**Component**: Apollo
**Priority**: Medium
**Workstream**: C - Hermes and Support Services
**Labels**: `component:apollo`, `type:feature`, `priority:medium`

**Description**:
Add the optional `trigger` field to the `PersonaEntry` model to capture what caused each diary entry to be created. This field supports better analysis and filtering of persona diary entries.

**Specification Changes**:
- Add `trigger: Optional[str]` field to `PersonaEntry` model in `apollo/data/models.py`
- Update Neo4j schema to include `trigger` property on `PersonaEntry` nodes
- Add `trigger` to `CreatePersonaEntryRequest` API model in `apollo/api/server.py`
- Update persona repository to handle trigger in queries and data mapping
- Update persona store to handle trigger field

**Database Migration**:
Since Phase 1 is already deployed with persona entries in Neo4j, this task requires:
1. **Schema Migration Script**: Create a migration script that adds the `trigger` field to existing `PersonaEntry` nodes with a default value of `NULL`
2. **Backward Compatibility**: Ensure all read operations handle missing `trigger` field gracefully
3. **Migration Testing**: Test migration on a copy of production data before deploying
4. **Rollback Plan**: Document how to revert the schema change if needed

**Acceptance Criteria**:
- [ ] `PersonaEntry` model includes optional `trigger` field
- [ ] Neo4j migration script created and tested
- [ ] Migration script can be run idempotently (safe to run multiple times)
- [ ] Existing persona entries can be queried without errors
- [ ] New persona entries can include trigger field
- [ ] API documentation updated to include trigger field
- [ ] Migration rollback procedure documented
- [ ] All type checks pass (mypy)
- [ ] All tests pass
- [ ] Migration tested on staging environment

**Dependencies**:
- None (can be implemented independently)

**Effort Estimate**: 1-2 days

**Files to Modify**:
- `src/apollo/data/models.py`
- `src/apollo/data/persona_repository.py`
- `src/apollo/data/persona_store.py`
- `src/apollo/api/server.py`
- New file: `scripts/migrations/add_persona_trigger_field.py`
- `docs/PERSONA_DIARY.md` (verify documentation is current)

---

### Issue 2: Implement Persona Diary Browser UI Panel

**Component**: Apollo
**Priority**: High
**Workstream**: C - Hermes and Support Services
**Labels**: `component:apollo`, `type:feature`, `priority:high`, `phase:2`

**Description**:
Implement the browser-based Persona Diary viewer as specified in Phase 2. This panel displays the agent's internal state narrative, belief updates, decision explanations, and temporal reasoning trace.

**Requirements**:
- Display persona entries in reverse chronological order (newest first)
- Support filtering by:
  - Entry type (belief, decision, observation, reflection)
  - Trigger (when Issue #1 is complete)
  - Sentiment (positive, negative, neutral, mixed)
  - Date range
- Display entry metadata (timestamp, confidence, related goals/processes)
- Support search across entry content and summaries
- Real-time updates via WebSocket when new entries are created
- Export functionality (JSON, CSV)

**UI Components**:
- `PersonaDiaryPanel.tsx` - Main panel component
- `PersonaEntryCard.tsx` - Individual entry display
- `PersonaEntryFilters.tsx` - Filter controls
- `PersonaEntryTimeline.tsx` - Timeline visualization

**API Integration**:
- Use Apollo SDK to fetch entries from `/api/persona/entries`
- Implement pagination for large entry sets
- Subscribe to WebSocket updates for real-time entries

**Acceptance Criteria**:
- [ ] Persona diary panel renders in browser UI
- [ ] Entries display with all metadata
- [ ] Filtering works for all supported fields
- [ ] Search functionality works
- [ ] Real-time updates appear without refresh
- [ ] Export functionality works
- [ ] Responsive design works on desktop and tablet
- [ ] Loading states and error handling implemented
- [ ] Unit tests for components
- [ ] E2E test for diary panel interaction

**Dependencies**:
- Shared SDK generation (Issue #3)
- WebSocket infrastructure (if not already in place)

**Effort Estimate**: 3-5 days

---

### Issue 3: Generate TypeScript and Python SDKs from OpenAPI Specs

**Component**: Apollo, Sophia, Hermes
**Priority**: High
**Workstream**: C - Hermes and Support Services
**Labels**: `component:apollo`, `component:sophia`, `component:hermes`, `type:infrastructure`, `priority:high`, `phase:2`

**Description**:
Generate type-safe client libraries for both TypeScript (browser UI) and Python (CLI) from the OpenAPI specifications of Sophia and Hermes.

**Requirements**:
- Use `openapi-generator` for code generation
- Generate TypeScript client from `api-specs/sophia-openapi.yaml` and `api-specs/hermes-openapi.yaml`
- Generate Python client from same specs
- Include type definitions for all models including `CWMState` envelope
- Configure authentication/API key handling
- Add build scripts to regenerate on spec changes

**Generated SDK Features**:
- Type-safe request/response models
- Async/await support
- Error handling and retries
- Request/response interceptors
- Authentication helpers

**Build Integration**:
- Add `npm run generate:sdk` script for TypeScript
- Add Python SDK generation to build process
- Document regeneration workflow
- Consider automating regeneration on spec changes via CI

**Acceptance Criteria**:
- [ ] TypeScript SDK generated and builds successfully
- [ ] Python SDK generated and installs successfully
- [ ] All API endpoints have corresponding client methods
- [ ] Type definitions match OpenAPI schemas
- [ ] SDKs include authentication support
- [ ] Generation scripts documented
- [ ] SDKs published to appropriate registries (npm, PyPI or internal)
- [ ] Example usage documented

**Dependencies**:
- OpenAPI specifications must be complete and valid

**Effort Estimate**: 2-3 days

---

### Issue 4: Update CLI to Use Generated Python SDK

**Component**: Apollo
**Priority**: High
**Workstream**: C - Hermes and Support Services
**Labels**: `component:apollo`, `type:refactor`, `priority:high`, `phase:2`

**Description**:
Refactor the Apollo CLI to use the generated Python SDK instead of hand-written API clients. This ensures consistency between CLI and browser UI.

**Requirements**:
- Replace `SophiaClient` with generated SDK client
- Replace `HermesClient` with generated SDK client
- Maintain backward compatibility with Phase 1 commands
- Add new commands for Phase 2 endpoints:
  - `apollo plan` - Plan generation
  - `apollo simulate` - Plan simulation
  - `apollo embed` - Text embedding
- Implement structured JSON logging for all commands

**Structured Logging Format**:
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "info",
  "command": "plan",
  "request": {...},
  "response": {...},
  "duration_ms": 1234
}
```

**Acceptance Criteria**:
- [ ] All existing CLI commands work with new SDK
- [ ] New Phase 2 commands implemented
- [ ] Structured logging implemented for all commands
- [ ] Error handling improved with SDK error types
- [ ] CLI tests updated and passing
- [ ] Documentation updated with new commands
- [ ] Performance is comparable or better than Phase 1

**Dependencies**:
- Generated Python SDK (Issue #3)

**Effort Estimate**: 3-4 days

---

### Issue 5: Implement Chat Panel with Persona Context Injection

**Component**: Apollo
**Priority**: High
**Workstream**: C - Hermes and Support Services
**Labels**: `component:apollo`, `type:feature`, `priority:high`, `phase:2`

**Description**:
Implement the browser-based chat panel with LLM-backed conversational interface. The chat panel should inject recent persona diary entries as context for grounded, contextual responses.

**Requirements**:
- Real-time chat interface with message history
- Stream responses from Hermes LLM endpoint
- Inject latest N persona diary entries as context (configurable, default 10)
- Support natural language commands
- Display typing indicators and loading states
- Markdown rendering for responses
- Code syntax highlighting
- Export chat history

**Persona Context Injection**:
- Fetch latest N entries before each chat request
- Format entries as context for LLM prompt:
  ```
  Recent agent experiences:
  - [timestamp] [type]: summary
  - [timestamp] [type]: summary
  ...
  
  User: {user message}
  ```
- Make N configurable via UI settings

**UI Components**:
- `ChatPanel.tsx` - Main panel component
- `ChatMessage.tsx` - Individual message display
- `ChatInput.tsx` - Message input with commands
- `ChatHistory.tsx` - Message history list
- `PersonaContextView.tsx` - Show injected context

**Acceptance Criteria**:
- [ ] Chat panel renders and accepts input
- [ ] Messages sent to Hermes API successfully
- [ ] Responses stream in real-time
- [ ] Persona context injected correctly
- [ ] Context injection can be toggled on/off
- [ ] Markdown and code rendering works
- [ ] Chat history persisted in browser storage
- [ ] Export functionality works
- [ ] Error handling for API failures
- [ ] Unit and E2E tests

**Dependencies**:
- Generated TypeScript SDK (Issue #3)
- Hermes LLM endpoint operational

**Effort Estimate**: 4-5 days

---

### Issue 6: Implement HCG Graph Viewer with Cytoscape

**Component**: Apollo
**Priority**: Medium
**Workstream**: C - Hermes and Support Services
**Labels**: `component:apollo`, `type:feature`, `priority:medium`, `phase:2`

**Description**:
Implement interactive HCG (Hybrid Causal Graph) visualization using Cytoscape.js. Display nodes (states, goals, processes) and edges (causal relationships) with interactive exploration.

**Requirements**:
- Render HCG structure from `/state` API response
- Interactive node selection and inspection
- Edge highlighting on hover
- Node detail panel showing properties
- Layout algorithms (hierarchical, force-directed)
- Zoom, pan, fit-to-screen controls
- Filter nodes by type, tags, confidence
- Export graph as image or JSON

**Graph Features**:
- Color-code nodes by type (state, goal, process)
- Edge thickness represents causal weight
- Highlight critical paths
- Show plan timeline overlay
- Real-time updates when graph changes

**UI Components**:
- `GraphViewer.tsx` - Main graph component
- `GraphControls.tsx` - Layout and filter controls
- `NodeInspector.tsx` - Node detail panel
- `GraphLegend.tsx` - Type/color legend

**Acceptance Criteria**:
- [ ] Graph renders HCG structure correctly
- [ ] Interactive selection and inspection works
- [ ] Multiple layout algorithms available
- [ ] Filtering works for all node types
- [ ] Export functionality works
- [ ] Performance acceptable for graphs with 100+ nodes
- [ ] Responsive design works
- [ ] Unit and E2E tests

**Dependencies**:
- Generated TypeScript SDK (Issue #3)
- Sophia `/state` endpoint returning graph data

**Effort Estimate**: 5-6 days

---

### Issue 7: Implement Diagnostics Tabs (Logs, Timeline, Telemetry)

**Component**: Apollo
**Priority**: Medium
**Workstream**: C - Hermes and Support Services
**Labels**: `component:apollo`, `type:feature`, `priority:medium`, `phase:2`

**Description**:
Implement three diagnostics tabs for monitoring system health and performance: Logs, Plan Timeline, and Telemetry.

**Logs Tab Requirements**:
- Real-time log streaming via WebSocket
- Log level filtering (debug, info, warn, error)
- Search across log messages
- Export logs (JSON, CSV, text)
- Auto-scroll toggle
- Log colorization by level

**Plan Timeline Tab Requirements**:
- Temporal view of plan execution steps
- Progress indicators for each step
- Performance metrics per step
- Filter by plan ID
- Zoom to time range

**Telemetry Tab Requirements**:
- System metrics display (CPU, memory, disk)
- API latency charts (Sophia, Hermes)
- Request rate graphs
- Hermes chat metrics (token counts, latency)
- Persona sentiment feed over time
- Resource usage trends

**UI Components**:
- `DiagnosticsPanel.tsx` - Tab container
- `LogsTab.tsx` - Logs viewer
- `TimelineTab.tsx` - Plan timeline
- `TelemetryTab.tsx` - Metrics dashboard
- `MetricChart.tsx` - Reusable chart component

**Acceptance Criteria**:
- [ ] All three tabs render correctly
- [ ] Real-time log updates work
- [ ] Log filtering and search work
- [ ] Timeline shows plan execution correctly
- [ ] Telemetry charts display metrics
- [ ] Export functionality works for logs
- [ ] Performance acceptable with high log volume
- [ ] Unit and E2E tests

**Dependencies**:
- WebSocket infrastructure for real-time updates
- Telemetry collection system (may need backend work)

**Effort Estimate**: 5-7 days

---

### Issue 8: Update Persona Diary Documentation

**Component**: Documentation
**Priority**: Low
**Workstream**: C - Hermes and Support Services
**Labels**: `type:documentation`, `priority:low`, `phase:2`

**Description**:
Update the persona diary documentation to reflect all Phase 2 changes, particularly the addition of the `trigger` field and browser UI functionality.

**Documentation Updates Required**:

1. **PERSONA_DIARY.md**:
   - ✅ Already updated with trigger field specification
   - Add migration notes for existing deployments
   - Add browser UI usage examples
   - Update API examples to include trigger

2. **PERSONA_LLM_INTEGRATION.md**:
   - Update context injection examples
   - Document how persona entries are formatted for LLM context
   - Add configuration options for context window size

3. **PHASE2_SPEC.md**:
   - ✅ Persona diary section already present
   - Add detailed persona diary implementation notes
   - Link to PERSONA_DIARY.md for full specification

4. **New Documentation**:
   - Create `docs/phase2/PERSONA_DIARY_MIGRATION.md` with migration guide
   - Add troubleshooting section for common issues

**Acceptance Criteria**:
- [ ] All documentation reviewed and updated
- [ ] Migration guide created
- [ ] Code examples tested and working
- [ ] Screenshots of browser UI added
- [ ] Documentation cross-references verified
- [ ] Markdown linting passes

**Dependencies**:
- Trigger field implementation (Issue #1)
- Browser UI implementation (Issue #2)

**Effort Estimate**: 1-2 days

---

### Issue 9: Add Persona Diary E2E Tests

**Component**: Apollo
**Priority**: Medium
**Workstream**: C - Hermes and Support Services
**Labels**: `component:apollo`, `type:testing`, `priority:medium`, `phase:2`

**Description**:
Add comprehensive end-to-end tests for persona diary functionality in both CLI and browser UI.

**Test Coverage**:

1. **CLI Tests**:
   - Create entry with all fields including trigger
   - List entries with various filters
   - Query entries by ID
   - Structured logging output validation

2. **Browser UI Tests**:
   - Render persona diary panel
   - Filter entries by type, trigger, sentiment, date
   - Search across entries
   - Real-time entry updates
   - Export functionality
   - Entry detail view

3. **Integration Tests**:
   - Create entry in CLI, verify in browser
   - Create entry via API, verify in CLI and browser
   - WebSocket updates to browser

4. **Migration Tests**:
   - Test migration script on sample data
   - Verify backward compatibility with entries without trigger
   - Test rollback procedure

**Test Infrastructure**:
- Use Playwright for browser E2E tests
- Use pytest for CLI tests
- Mock Sophia/Hermes APIs for controlled testing
- Create test fixtures with various persona entry scenarios

**Acceptance Criteria**:
- [ ] CLI tests cover all persona diary commands
- [ ] Browser E2E tests cover all UI interactions
- [ ] Integration tests verify cross-component functionality
- [ ] Migration tests verify safe schema updates
- [ ] All tests passing in CI
- [ ] Test coverage > 80% for persona diary code
- [ ] Test documentation added

**Dependencies**:
- All persona diary features implemented (Issues #1, #2)

**Effort Estimate**: 3-4 days

---

### Issue 10: Configure Environment Variables for Phase 2

**Component**: Apollo, Infrastructure
**Priority**: Medium
**Workstream**: C - Hermes and Support Services
**Labels**: `component:apollo`, `type:infrastructure`, `priority:medium`, `phase:2`

**Description**:
Set up and document all environment variables required for Phase 2 deployment, including configuration for browser UI, CLI, and backend services.

**Environment Configuration**:

1. **Browser UI (`.env`)**:
   ```env
   VITE_HCG_API_URL=http://localhost:8082
   VITE_HCG_WS_URL=ws://localhost:8082/ws/hcg
   VITE_SOPHIA_API_URL=http://localhost:8080
   VITE_HERMES_API_URL=http://localhost:8080
   VITE_ENABLE_CHAT=true
   VITE_ENABLE_DIAGNOSTICS=true
   VITE_PERSONA_CONTEXT_SIZE=10
   ```

2. **CLI (`.env` or `config.yaml`)**:
   ```yaml
   sophia:
     api_url: http://localhost:8080
     api_key: ${SOPHIA_API_KEY}
   hermes:
     api_url: http://localhost:8080
     api_key: ${HERMES_API_KEY}
   persona:
     context_size: 10
   ```

3. **Backend Services**:
   - Neo4j connection settings
   - API authentication keys
   - Feature flags

**Documentation**:
- Create `.env.example` files
- Document all variables in `docs/phase2/CONFIGURATION.md`
- Add configuration validation at startup
- Document deployment configurations (dev, staging, prod)

**Acceptance Criteria**:
- [ ] All required environment variables identified
- [ ] `.env.example` files created for all components
- [ ] Configuration documentation complete
- [ ] Validation code added for required variables
- [ ] Deployment configurations documented
- [ ] Secrets management strategy documented

**Dependencies**:
- None (can be started early)

**Effort Estimate**: 1-2 days

---

### Issue 11: Fix Failing Hermes Client Test

**Component**: Apollo
**Priority**: Low
**Workstream**: C - Hermes and Support Services
**Labels**: `component:apollo`, `type:bug`, `priority:low`

**Description**:
Investigate and fix the failing `test_hermes_client_llm_generate_failure` test in `tests/test_client.py`. This test is expected to verify that the Hermes client properly handles failure cases, but it's currently failing because the test is receiving a successful response when it expects a failure.

**Current Issue**:
```
FAILED tests/test_client.py::test_hermes_client_llm_generate_failure - AssertionError: assert True is False
```

The test is asserting that `response.success is False`, but the actual response has `success=True` with a valid OpenAI API response.

**Investigation Required**:
- Review the test to understand what failure scenario it's trying to test
- Determine if the test setup is correctly configured to trigger a failure
- Check if mocking is needed to simulate API failures
- Verify if the test expectations are correct

**Acceptance Criteria**:
- [ ] Root cause of test failure identified
- [ ] Test either fixed to pass or updated with correct expectations
- [ ] Test documentation clarifies what failure scenario is being tested
- [ ] All tests pass in CI

**Dependencies**:
- None (can be investigated independently)

**Effort Estimate**: 0.5-1 day

---

## Issue Priority Summary

### High Priority (Week 1-2)
1. Issue #3: Generate SDKs (foundational for everything)
2. Issue #4: Update CLI to use SDK
3. Issue #2: Persona Diary Browser UI
4. Issue #5: Chat Panel with Context Injection

### Medium Priority (Week 3-4)
1. Issue #1: Add trigger field with migration
2. Issue #6: HCG Graph Viewer
3. Issue #7: Diagnostics Tabs
4. Issue #9: E2E Tests
5. Issue #10: Environment Configuration

### Low Priority (Ongoing)
1. Issue #8: Documentation updates
2. Issue #11: Fix Hermes client test failure

---

## Notes

### Migration Strategy for Issue #1

The trigger field migration must be handled carefully since Phase 1 is already deployed. Recommended approach:

1. **Schema Update**: Add `trigger` field as optional to all database queries
2. **Default Handling**: Treat missing `trigger` as `None` in all code paths
3. **Migration Script**: Create idempotent script to add field to existing nodes
4. **Testing**: Test migration on staging before production
5. **Rollback**: Document how to remove field if needed

### Dependencies Between Issues

```
Issue #3 (Generate SDKs)
    ├─→ Issue #4 (CLI updates)
    ├─→ Issue #2 (Persona Diary UI)
    ├─→ Issue #5 (Chat Panel)
    ├─→ Issue #6 (Graph Viewer)
    └─→ Issue #7 (Diagnostics)

Issue #1 (Trigger field)
    ├─→ Issue #2 (Filter by trigger in UI)
    └─→ Issue #8 (Documentation)

Issue #2, #5, #6, #7 (All UI features)
    └─→ Issue #9 (E2E Tests)
```

### Estimated Timeline

- **Total Estimated Effort**: 26-38 days (developer days)
- **With 2 developers**: ~3-4 weeks
- **Recommended Schedule**: 4 weeks to allow for testing and iteration

