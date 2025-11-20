import { useEffect, useRef, useState, useMemo } from 'react'
import cytoscape from 'cytoscape'
import dagre from 'cytoscape-dagre'
import { useGraphSnapshot } from '../hooks/useHCG'
import type { GraphSnapshot } from '../types/hcg'
import './GraphViewer.css'

cytoscape.use(dagre)

// Mock data for demo/fallback when API is unavailable
const createMockSnapshot = (): GraphSnapshot => ({
  entities: [
    {
      id: 'goal_1',
      type: 'goal',
      properties: { name: 'Navigate to Kitchen', priority: 'high', status: 'active' },
      labels: ['Goal'],
      created_at: new Date().toISOString(),
    },
    {
      id: 'plan_1',
      type: 'plan',
      properties: { name: 'Kitchen Navigation Plan', status: 'executing' },
      labels: ['Plan'],
      created_at: new Date().toISOString(),
    },
    {
      id: 'step_1',
      type: 'step',
      properties: { name: 'Move forward', order: 1, status: 'completed' },
      labels: ['Step'],
      created_at: new Date().toISOString(),
    },
    {
      id: 'step_2',
      type: 'step',
      properties: { name: 'Turn left', order: 2, status: 'in_progress' },
      labels: ['Step'],
      created_at: new Date().toISOString(),
    },
    {
      id: 'step_3',
      type: 'step',
      properties: { name: 'Enter kitchen', order: 3, status: 'pending' },
      labels: ['Step'],
      created_at: new Date().toISOString(),
    },
    {
      id: 'state_1',
      type: 'state',
      properties: { name: 'Current Position', x: 10, y: 5 },
      labels: ['State'],
      created_at: new Date().toISOString(),
    },
  ],
  edges: [
    {
      id: 'edge_1',
      source_id: 'goal_1',
      target_id: 'plan_1',
      edge_type: 'generates',
      properties: {},
      weight: 1.0,
      created_at: new Date().toISOString(),
    },
    {
      id: 'edge_2',
      source_id: 'plan_1',
      target_id: 'step_1',
      edge_type: 'contains',
      properties: {},
      weight: 1.0,
      created_at: new Date().toISOString(),
    },
    {
      id: 'edge_3',
      source_id: 'plan_1',
      target_id: 'step_2',
      edge_type: 'contains',
      properties: {},
      weight: 1.0,
      created_at: new Date().toISOString(),
    },
    {
      id: 'edge_4',
      source_id: 'plan_1',
      target_id: 'step_3',
      edge_type: 'contains',
      properties: {},
      weight: 1.0,
      created_at: new Date().toISOString(),
    },
    {
      id: 'edge_5',
      source_id: 'step_1',
      target_id: 'step_2',
      edge_type: 'precedes',
      properties: {},
      weight: 1.0,
      created_at: new Date().toISOString(),
    },
    {
      id: 'edge_6',
      source_id: 'step_2',
      target_id: 'step_3',
      edge_type: 'precedes',
      properties: {},
      weight: 1.0,
      created_at: new Date().toISOString(),
    },
    {
      id: 'edge_7',
      source_id: 'step_2',
      target_id: 'state_1',
      edge_type: 'updates',
      properties: {},
      weight: 1.0,
      created_at: new Date().toISOString(),
    },
  ],
  timestamp: new Date().toISOString(),
  metadata: {
    entity_count: 6,
    edge_count: 7,
    entity_types: ['goal', 'plan', 'step', 'state'],
  },
})

function GraphViewer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [cy, setCy] = useState<cytoscape.Core | null>(null)
  const [entityTypeFilter, setEntityTypeFilter] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  
  // Fetch graph snapshot from HCG API
  const { data: apiSnapshot, isLoading, error, refetch } = useGraphSnapshot(
    entityTypeFilter.length > 0 ? entityTypeFilter : undefined,
    200
  )

  // Use mock data if API fails or returns no data
  const snapshot = useMemo(() => {
    if (apiSnapshot) return apiSnapshot
    if (error) return createMockSnapshot()
    return null
  }, [apiSnapshot, error])

  useEffect(() => {
    if (!containerRef.current || !snapshot) return

    // Transform HCG data to Cytoscape format
    const nodes = snapshot.entities.map(entity => ({
      data: {
        id: entity.id,
        label: entity.properties.name || entity.properties.description || entity.id,
        type: entity.type,
        ...entity.properties,
      },
    }))

    const edges = snapshot.edges.map(edge => ({
      data: {
        id: edge.id,
        source: edge.source_id,
        target: edge.target_id,
        type: edge.edge_type,
        label: edge.edge_type,
        weight: edge.weight,
      },
    }))

    // Filter by search query
    let filteredNodes = nodes
    let filteredEdges = edges
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filteredNodes = nodes.filter(node => {
        const label = String(node.data.label || '')
        const type = String(node.data.type || '')
        const id = String(node.data.id || '')
        return (
          label.toLowerCase().includes(query) ||
          type.toLowerCase().includes(query) ||
          id.toLowerCase().includes(query)
        )
      })
      const nodeIds = new Set(filteredNodes.map(n => n.data.id))
      filteredEdges = edges.filter(edge =>
        nodeIds.has(edge.data.source) && nodeIds.has(edge.data.target)
      )
    }

    const cyInstance = cytoscape({
      container: containerRef.current,
      elements: [...filteredNodes, ...filteredEdges],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#646cff',
            label: 'data(label)',
            color: '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            width: '80px',
            height: '80px',
            'font-size': '12px',
            'text-wrap': 'wrap',
            'text-max-width': '70px',
          },
        },
        {
          selector: 'node[type="goal"]',
          style: {
            'background-color': '#4ade80',
            shape: 'round-rectangle',
          },
        },
        {
          selector: 'node[type="plan"]',
          style: {
            'background-color': '#60a5fa',
            shape: 'round-rectangle',
          },
        },
        {
          selector: 'node[type="step"]',
          style: {
            'background-color': '#a78bfa',
            shape: 'ellipse',
          },
        },
        {
          selector: 'node[type="state"]',
          style: {
            'background-color': '#f59e0b',
            shape: 'diamond',
          },
        },
        {
          selector: 'node[type="process"]',
          style: {
            'background-color': '#ef4444',
            shape: 'rectangle',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#fff',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#888',
            'target-arrow-color': '#888',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': '10px',
            'text-rotation': 'autorotate',
            color: '#999',
          },
        },
      ],
      layout: {
        name: 'dagre',
        // @ts-expect-error - dagre layout options are not fully typed
        rankDir: 'TB',
        nodeSep: 50,
        rankSep: 100,
      },
    })

    // Handle node selection
    cyInstance.on('tap', 'node', evt => {
      const node = evt.target
      setSelectedNode(node.id())
    })

    setCy(cyInstance)

    return () => {
      cyInstance.destroy()
    }
  }, [snapshot, searchQuery])

  const handleFitView = () => {
    cy?.fit(undefined, 50)
  }

  const handleZoomIn = () => {
    cy?.zoom((cy.zoom() ?? 1) * 1.2)
  }

  const handleZoomOut = () => {
    cy?.zoom((cy.zoom() ?? 1) * 0.8)
  }

  const handleRefresh = () => {
    refetch()
  }

  const toggleEntityType = (type: string) => {
    setEntityTypeFilter(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  const selectedNodeData = selectedNode
    ? snapshot?.entities.find(e => e.id === selectedNode)
    : null

  return (
    <div className="graph-viewer">
      <div className="graph-toolbar">
        <div className="graph-search">
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="graph-filters">
          <label>
            <input
              type="checkbox"
              checked={entityTypeFilter.includes('goal')}
              onChange={() => toggleEntityType('goal')}
            />
            Goals
          </label>
          <label>
            <input
              type="checkbox"
              checked={entityTypeFilter.includes('plan')}
              onChange={() => toggleEntityType('plan')}
            />
            Plans
          </label>
          <label>
            <input
              type="checkbox"
              checked={entityTypeFilter.includes('state')}
              onChange={() => toggleEntityType('state')}
            />
            States
          </label>
          <label>
            <input
              type="checkbox"
              checked={entityTypeFilter.includes('process')}
              onChange={() => toggleEntityType('process')}
            />
            Processes
          </label>
        </div>
        <div className="graph-controls">
          <button onClick={handleRefresh} disabled={isLoading}>
            Refresh
          </button>
          <button onClick={handleFitView}>Fit View</button>
          <button onClick={handleZoomIn}>Zoom In</button>
          <button onClick={handleZoomOut}>Zoom Out</button>
        </div>
      </div>

      {error && (
        <div className="graph-info">
          ℹ️ API unavailable - showing sample graph data. Start the HCG API server to view live data.
        </div>
      )}

      {isLoading && <div className="graph-loading">Loading graph data...</div>}

      <div className="graph-content">
        <div className="graph-container" ref={containerRef}></div>
        
        {selectedNodeData && (
          <div className="node-details">
            <h3>Node Details</h3>
            <button
              className="close-btn"
              onClick={() => setSelectedNode(null)}
            >
              ×
            </button>
            <div className="detail-item">
              <strong>ID:</strong> {selectedNodeData.id}
            </div>
            <div className="detail-item">
              <strong>Type:</strong> {selectedNodeData.type}
            </div>
            <div className="detail-item">
              <strong>Labels:</strong> {selectedNodeData.labels.join(', ')}
            </div>
            <div className="detail-item">
              <strong>Properties:</strong>
              <pre>{JSON.stringify(selectedNodeData.properties, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>

      <div className="graph-legend">
        <h3>Legend</h3>
        <div className="legend-item">
          <span
            className="legend-color"
            style={{ backgroundColor: '#4ade80' }}
          ></span>
          <span>Goal</span>
        </div>
        <div className="legend-item">
          <span
            className="legend-color"
            style={{ backgroundColor: '#60a5fa' }}
          ></span>
          <span>Plan</span>
        </div>
        <div className="legend-item">
          <span
            className="legend-color"
            style={{ backgroundColor: '#a78bfa' }}
          ></span>
          <span>Step</span>
        </div>
        <div className="legend-item">
          <span
            className="legend-color"
            style={{ backgroundColor: '#f59e0b' }}
          ></span>
          <span>State</span>
        </div>
        <div className="legend-item">
          <span
            className="legend-color"
            style={{ backgroundColor: '#ef4444' }}
          ></span>
          <span>Process</span>
        </div>
        <div className="legend-stats">
          {snapshot && (
            <>
              <div>Nodes: {snapshot.entities.length}</div>
              <div>Edges: {snapshot.edges.length}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default GraphViewer
