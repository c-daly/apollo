/**
 * HCG Explorer - Public exports
 */

// Main component
export { HCGExplorer, default } from './HCGExplorer'
export type { HCGExplorerProps } from './HCGExplorer'

// Context and hooks
export { HCGExplorerProvider, useHCGExplorer } from './context'

// Types
export type {
  ViewMode,
  LayoutType,
  GraphNode,
  GraphEdge,
  ProcessedGraph,
  ClusterAssignment,
  FilterConfig,
  HCGExplorerState,
  RendererProps,
} from './types'
export { NODE_COLORS, STATUS_COLORS } from './types'

// Utilities
export { processGraph } from './utils/graph-processor'
export { generateMockSnapshot, generateMockHistory } from './utils/mock-data'

// Clustering & Embeddings
export {
  generateNodeEmbeddings,
  projectTo3D,
  clusterByEmbedding,
  cosineSimilarity,
} from './clustering/embedding-service'
export { useSemanticLayout } from './hooks/useSemanticLayout'

// Renderers (for advanced usage)
export { ThreeRenderer } from './renderers/ThreeRenderer'
export { CytoscapeRenderer } from './renderers/CytoscapeRenderer'
