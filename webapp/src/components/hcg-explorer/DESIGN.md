# HCG Explorer - Design Document

> Multi-modal knowledge graph visualization for Sophia's Hierarchical Causal Graph

## Overview

HCG Explorer is a sophisticated visualization tool for exploring Sophia's knowledge graph at multiple scales - from inspecting individual node properties to discovering macro-level semantic patterns. It provides 2D and 3D rendering modes, semantic clustering via VL-JEPA embeddings, and temporal playback for understanding graph evolution.

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | 3D interactive graph view with trackball controls | Must |
| F2 | Multiple 2D layout modes (hierarchical, radial, force, circle) | Must |
| F3 | Semantic clustering using VL-JEPA embeddings | Must |
| F4 | Temporal playback with timeline slider | Must |
| F5 | Multi-scale navigation (zoom from micro to macro) | Must |
| F6 | Advanced filtering by node type, edge type, status, properties | Must |
| F7 | Node detail inspection panel | Must |
| F8 | Search across node labels, IDs, properties | Should |
| F9 | Cluster legend with semantic group labels | Should |
| F10 | Export current view as image/data | Could |

### Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NF1 | Render 1000+ nodes smoothly | 60 FPS |
| NF2 | Initial load time | < 2 seconds |
| NF3 | Memory usage | < 500MB for 5000 nodes |
| NF4 | Accessibility | Keyboard navigation support |

## Architecture

### System Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Apollo Webapp                                │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      HCGExplorer                               │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │                  Visualization Layer                     │  │  │
│  │  │   ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │  │  │
│  │  │   │ 3D View  │  │ 2D View  │  │ Semantic Clusters    │  │  │  │
│  │  │   │ Three.js │  │Cytoscape │  │ UMAP + HDBSCAN       │  │  │  │
│  │  │   └──────────┘  └──────────┘  └──────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │                    Data Layer                            │  │  │
│  │  │   useHCGSnapshot  │  useSnapshotHistory  │  Clustering   │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │      Sophia API          │
                    │  /api/hcg/snapshot       │
                    │  /api/hcg/history        │
                    └──────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │        Neo4j             │
                    │   (Knowledge Graph)      │
                    └──────────────────────────┘
```

### Component Architecture

```
webapp/src/components/hcg-explorer/
├── DESIGN.md                    # This document
├── HCGExplorer.tsx              # Main container component
├── HCGExplorer.css              # Component styles
├── index.ts                     # Public exports
│
├── components/
│   ├── Toolbar.tsx              # View mode, layout, search controls
│   ├── FilterPanel.tsx          # Advanced filtering UI
│   ├── TimelineSlider.tsx       # Temporal playback control
│   ├── NodeDetails.tsx          # Selected node inspection
│   ├── ClusterLegend.tsx        # Semantic cluster visualization
│   └── ViewModeSelector.tsx     # 2D/3D toggle
│
├── renderers/
│   ├── types.ts                 # Shared renderer interfaces
│   ├── ThreeRenderer.tsx        # 3D visualization (Three.js)
│   ├── CytoscapeRenderer.tsx    # 2D visualization (Cytoscape)
│   └── useRendererState.ts      # Shared renderer state hook
│
├── layouts/
│   ├── types.ts                 # Layout configuration types
│   ├── cytoscape-layouts.ts     # 2D layout configurations
│   ├── force-3d.ts              # 3D force-directed layout
│   └── semantic-layout.ts       # Embedding-based positioning
│
├── clustering/
│   ├── types.ts                 # Cluster data structures
│   ├── embedding-reducer.ts     # UMAP/t-SNE dimensionality reduction
│   ├── cluster-detector.ts      # HDBSCAN clustering
│   └── useSemanticClusters.ts   # React hook for clustering
│
└── hooks/
    ├── useSnapshotHistory.ts    # Temporal snapshot accumulation
    ├── useFilteredGraph.ts      # Apply filters to graph data
    └── useGraphTransforms.ts    # Layout transformations
```

## Component Specifications

### HCGExplorer (Main Container)

```typescript
interface HCGExplorerProps {
  /** Initial view mode */
  defaultViewMode?: '2d' | '3d'
  /** Initial layout for 2D mode */
  defaultLayout?: LayoutType
  /** Auto-refresh interval in ms (0 = disabled) */
  refreshInterval?: number
  /** Maximum snapshots to retain for temporal playback */
  historyLimit?: number
  /** Embedding field name(s) in entity properties */
  embeddingFields?: string | string[]
  /** Called when a node is selected */
  onNodeSelect?: (node: GraphNode | null) => void
  /** CSS class for container */
  className?: string
}

type LayoutType =
  | 'dagre'      // Hierarchical DAG
  | 'fcose'      // Force-directed (Cytoscape)
  | 'circle'     // Circular
  | 'concentric' // Concentric circles by type
  | 'force-3d'   // 3D force-directed
  | 'semantic'   // Embedding-based positioning
```

**State Management:**
- View mode (2D/3D)
- Current layout
- Filter configuration
- Selected node
- Timeline position
- Snapshot history buffer

### ThreeRenderer (3D View)

**Technology Stack:**
- `three` - Core 3D library
- `@react-three/fiber` - React renderer for Three.js
- `@react-three/drei` - Useful helpers (TrackballControls, Text, etc.)
- `d3-force-3d` - 3D force simulation

**Features:**
- Trackball camera controls (free rotation)
- Node spheres with type-based colors
- Edge lines with directional indicators
- Hover/click node selection
- Semantic cluster visualization (translucent convex hulls)
- Level-of-detail: labels visible on zoom

**Performance Optimizations:**
- Instanced meshes for nodes (single draw call)
- Line segments for edges (batched)
- Frustum culling
- Dynamic LOD based on camera distance

### CytoscapeRenderer (2D View)

**Extracted from existing GraphViewer.tsx with enhancements:**
- Multiple layout algorithms
- Smooth layout transitions
- Cluster background regions
- Enhanced styling

**Available Layouts:**
| Layout | Description | Best For |
|--------|-------------|----------|
| dagre | Hierarchical DAG | Goal → Plan → Step flows |
| fcose | Force-directed | General exploration |
| circle | Circular | Equal importance nodes |
| concentric | Rings by type | Type-based grouping |
| breadthfirst | BFS tree | Parent-child relations |

### Semantic Clustering

**Pipeline:**
```
Entity.properties.embedding (high-dim vector)
           │
           ▼
    ┌──────────────┐
    │    UMAP      │  Reduce to 2D/3D coordinates
    │  n_neighbors │
    │  min_dist    │
    └──────────────┘
           │
           ▼
    ┌──────────────┐
    │   HDBSCAN    │  Detect density-based clusters
    │  min_samples │
    │  min_cluster │
    └──────────────┘
           │
           ▼
    ClusterAssignment[]
    - clusterId
    - centroid
    - members[]
    - label (auto-generated or from dominant type)
```

**Embedding Configuration:**
```typescript
interface EmbeddingConfig {
  /** Property path(s) for embedding vectors */
  fields: string | string[]
  /** Expected dimensionality */
  dimensions?: number
  /** Reduction algorithm */
  reducer: 'umap' | 'tsne' | 'pca'
  /** UMAP parameters */
  umapParams?: {
    nNeighbors?: number  // default: 15
    minDist?: number     // default: 0.1
    metric?: string      // default: 'euclidean'
  }
}
```

**Fallback (no embeddings):**
When entities lack embedding properties, fall back to structural clustering:
1. Group by `type` field
2. Sub-group by connectivity patterns
3. Use graph centrality for positioning

### Temporal Playback

**Snapshot History Buffer:**
```typescript
interface SnapshotHistory {
  snapshots: TimestampedSnapshot[]
  currentIndex: number
  isPlaying: boolean
  playbackSpeed: number  // 1x, 2x, 0.5x
}

interface TimestampedSnapshot {
  timestamp: string
  data: GraphSnapshot
  deltas: WorldDelta[]  // Changes from previous
}
```

**Timeline Controls:**
- Slider: scrub through history
- Play/Pause: auto-advance through snapshots
- Step forward/backward: single snapshot navigation
- Speed control: playback rate
- Jump to: specific timestamp

**Visual Diff Indicators:**
- Green border: newly added nodes
- Yellow border: status changed
- Blue border: position changed
- Fade-out animation: removed nodes

### FilterPanel

**Filter Categories:**

```typescript
interface FilterConfig {
  /** Include only these entity types */
  entityTypes: string[]
  /** Include only these edge types */
  edgeTypes: string[]
  /** Status filter */
  status: string[]
  /** Text search across labels/IDs */
  searchQuery: string
  /** Property-based filters */
  propertyFilters: PropertyFilter[]
  /** Time range filter */
  timeRange?: {
    after?: string
    before?: string
  }
  /** Cluster filter (show only specific clusters) */
  clusters?: string[]
}

interface PropertyFilter {
  path: string        // e.g., 'properties.priority'
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'exists'
  value: unknown
}
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Data Flow                                 │
└─────────────────────────────────────────────────────────────────┘

1. FETCH
   useHCGSnapshot() ──────────────────────────────────────────────┐
                                                                   │
2. ACCUMULATE                                                      ▼
   useSnapshotHistory() ◄──────────────────────────── GraphSnapshot
        │
        ▼ snapshots[]
3. FILTER
   useFilteredGraph(snapshots[current], filterConfig)
        │
        ▼ filteredSnapshot
4. CLUSTER (if embeddings present)
   useSemanticClusters(filteredSnapshot, embeddingConfig)
        │
        ▼ { nodes, edges, clusters }
5. LAYOUT
   layoutEngine.compute(nodes, edges, clusters)
        │
        ▼ { nodes with positions, cluster hulls }
6. RENDER
   ThreeRenderer or CytoscapeRenderer
```

## State Management

**Using React Context for shared state:**

```typescript
interface HCGExplorerState {
  // View
  viewMode: '2d' | '3d'
  layout: LayoutType

  // Data
  currentSnapshot: GraphSnapshot | null
  snapshotHistory: TimestampedSnapshot[]
  timelineIndex: number

  // Filters
  filterConfig: FilterConfig

  // Clustering
  clusters: ClusterAssignment[]
  embeddingConfig: EmbeddingConfig

  // Selection
  selectedNodeId: string | null
  hoveredNodeId: string | null

  // Playback
  isPlaying: boolean
  playbackSpeed: number
}

// Actions
type HCGExplorerAction =
  | { type: 'SET_VIEW_MODE'; mode: '2d' | '3d' }
  | { type: 'SET_LAYOUT'; layout: LayoutType }
  | { type: 'SET_FILTER'; config: Partial<FilterConfig> }
  | { type: 'SELECT_NODE'; id: string | null }
  | { type: 'SET_TIMELINE_INDEX'; index: number }
  | { type: 'TOGGLE_PLAYBACK' }
  | { type: 'ADD_SNAPSHOT'; snapshot: GraphSnapshot }
  // ...
```

## Styling

**Design Tokens (CSS Variables):**

```css
:root {
  /* Node colors by type */
  --hcg-node-goal: #4ade80;
  --hcg-node-plan: #60a5fa;
  --hcg-node-step: #a78bfa;
  --hcg-node-state: #f59e0b;
  --hcg-node-process: #ef4444;
  --hcg-node-agent: #38bdf8;

  /* Status colors */
  --hcg-status-completed: #22c55e;
  --hcg-status-failed: #ef4444;
  --hcg-status-running: #3b82f6;
  --hcg-status-pending: #9ca3af;

  /* Change indicators */
  --hcg-change-added: #4ade80;
  --hcg-change-modified: #facc15;
  --hcg-change-removed: #ef4444;

  /* UI */
  --hcg-bg-primary: #1a1a2e;
  --hcg-bg-secondary: #16213e;
  --hcg-text-primary: #e8e8e8;
  --hcg-text-secondary: #9ca3af;
  --hcg-border: #374151;
}
```

## Dependencies

### New Dependencies Required

```json
{
  "dependencies": {
    "three": "^0.160.0",
    "@react-three/fiber": "^8.15.0",
    "@react-three/drei": "^9.88.0",
    "d3-force-3d": "^3.0.5"
  },
  "devDependencies": {
    "@types/three": "^0.160.0"
  }
}
```

### Clustering Libraries (Client-side)

For initial implementation, use pure JS implementations:
- **UMAP**: `umap-js` (~50KB)
- **Clustering**: Custom DBSCAN or `density-clustering` package

For production with large graphs, consider:
- Web Worker for clustering computation
- Server-side clustering endpoint

## Implementation Phases

### Phase 3a: Core Framework
- [ ] Create file structure
- [ ] Install dependencies
- [ ] Implement HCGExplorer shell
- [ ] Implement state management context
- [ ] Create renderer interface

### Phase 3b: 3D Renderer
- [ ] Basic Three.js scene setup
- [ ] Trackball controls
- [ ] Node rendering (instanced spheres)
- [ ] Edge rendering (line segments)
- [ ] Node selection/hover

### Phase 3c: 2D Renderer Migration
- [ ] Extract CytoscapeRenderer from GraphViewer
- [ ] Add layout switching
- [ ] Smooth layout transitions

### Phase 3d: Semantic Clustering
- [ ] Embedding extraction from entities
- [ ] UMAP dimensionality reduction
- [ ] Cluster detection
- [ ] Cluster visualization (hulls/backgrounds)

### Phase 3e: Temporal Playback
- [ ] Snapshot history buffer
- [ ] Timeline slider component
- [ ] Playback controls
- [ ] Delta visualization

### Phase 3f: Filtering System
- [ ] FilterPanel component
- [ ] Property-based filters
- [ ] Filter presets

## Testing Strategy

### Unit Tests
- Layout algorithms
- Filter logic
- Clustering algorithms
- State reducers

### Integration Tests
- Data fetching hooks
- Renderer initialization
- Filter + render pipeline

### Visual Regression Tests
- Snapshot comparisons for layouts
- Color scheme consistency

### Performance Tests
- Render 1000 nodes benchmark
- Memory profiling
- Layout computation time

## Open Questions

1. **Embedding availability**: When will VL-JEPA embeddings be populated in entities?
2. **History API**: Does `/api/hcg/history` return full snapshots or just deltas?
3. **Cluster labels**: Should clusters be auto-labeled, or will there be metadata?
4. **Export format**: What format for graph export (JSON, GraphML, image)?

## References

- [Three.js Documentation](https://threejs.org/docs/)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [Cytoscape.js](https://js.cytoscape.org/)
- [UMAP Algorithm](https://umap-learn.readthedocs.io/)
- [Existing GraphViewer](../GraphViewer.tsx)
