/**
 * Cytoscape 2D Renderer for HCG Explorer
 *
 * Uses Cytoscape.js for 2D graph visualization with multiple layout options.
 */

import { useEffect, useRef, useState } from 'react'
import cytoscape, { Core, NodeSingular, EventObject } from 'cytoscape'
import dagre from 'cytoscape-dagre'
import type { RendererProps, LayoutType } from '../types'
import { NODE_COLORS, STATUS_COLORS } from '../types'

// Register dagre layout
cytoscape.use(dagre)

/** Cytoscape stylesheet */
function getStylesheet(): cytoscape.StylesheetJson {
  return [
    // Base node style
    {
      selector: 'node',
      style: {
        'background-color': NODE_COLORS.default,
        label: 'data(label)',
        color: '#ffffff',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '11px',
        'text-wrap': 'wrap',
        'text-max-width': '80px',
        width: '70px',
        height: '70px',
        'border-width': 2,
        'border-color': '#1a1a2e',
        'text-outline-color': '#1a1a2e',
        'text-outline-width': 2,
      },
    },
    // Type-specific styles
    {
      selector: 'node[type="goal"]',
      style: {
        'background-color': NODE_COLORS.goal,
        shape: 'round-rectangle',
        color: '#000000',
        'text-outline-color': NODE_COLORS.goal,
      },
    },
    {
      selector: 'node[type="plan"]',
      style: {
        'background-color': NODE_COLORS.plan,
        shape: 'round-rectangle',
        color: '#000000',
        'text-outline-color': NODE_COLORS.plan,
      },
    },
    {
      selector: 'node[type="step"]',
      style: {
        'background-color': NODE_COLORS.step,
        shape: 'round-rectangle',
        width: '60px',
        height: '60px',
        color: '#000000',
        'text-outline-color': NODE_COLORS.step,
      },
    },
    {
      selector: 'node[type="agent"]',
      style: {
        'background-color': NODE_COLORS.agent,
        shape: 'ellipse',
        width: '80px',
        height: '80px',
        color: '#000000',
        'text-outline-color': NODE_COLORS.agent,
      },
    },
    {
      selector: 'node[type="state"]',
      style: {
        'background-color': NODE_COLORS.state,
        shape: 'diamond',
        width: '75px',
        height: '75px',
        color: '#000000',
        'text-outline-color': NODE_COLORS.state,
      },
    },
    {
      selector: 'node[type="process"]',
      style: {
        'background-color': NODE_COLORS.process,
        shape: 'rectangle',
        color: '#ffffff',
        'text-outline-color': NODE_COLORS.process,
      },
    },
    // Status-based styles
    {
      selector: 'node[status="completed"]',
      style: {
        'border-color': STATUS_COLORS.completed,
        'border-width': 4,
      },
    },
    {
      selector: 'node[status="failed"]',
      style: {
        'border-color': STATUS_COLORS.failed,
        'border-width': 4,
      },
    },
    {
      selector: 'node[status="running"]',
      style: {
        'border-color': STATUS_COLORS.running,
        'border-width': 4,
      },
    },
    {
      selector: 'node[status="executing"]',
      style: {
        'border-color': STATUS_COLORS.running,
        'border-width': 4,
      },
    },
    {
      selector: 'node[status="pending"]',
      style: {
        'border-color': STATUS_COLORS.pending,
        'border-width': 3,
        'border-style': 'dashed',
      },
    },
    // Selected state
    {
      selector: 'node:selected',
      style: {
        'border-color': '#ffffff',
        'border-width': 4,
        'box-shadow': '0 0 10px #ffffff',
      },
    },
    // Hover state
    {
      selector: 'node.hover',
      style: {
        'border-color': '#a78bfa',
        'border-width': 3,
      },
    },
    // Base edge style
    {
      selector: 'edge',
      style: {
        width: 2,
        'line-color': '#666666',
        'target-arrow-color': '#666666',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': '9px',
        color: '#888888',
        'text-rotation': 'autorotate',
        'text-margin-y': -10,
      },
    },
    // Edge type styles
    {
      selector: 'edge[type="generates"]',
      style: {
        'line-color': NODE_COLORS.goal,
        'target-arrow-color': NODE_COLORS.goal,
        width: 3,
      },
    },
    {
      selector: 'edge[type="contains"]',
      style: {
        'line-color': NODE_COLORS.plan,
        'target-arrow-color': NODE_COLORS.plan,
      },
    },
    {
      selector: 'edge[type="executes"]',
      style: {
        'line-color': NODE_COLORS.agent,
        'target-arrow-color': NODE_COLORS.agent,
        width: 3,
      },
    },
    {
      selector: 'edge[type="updates"]',
      style: {
        'line-color': NODE_COLORS.state,
        'target-arrow-color': NODE_COLORS.state,
        'line-style': 'dashed',
      },
    },
    // Connected to selected node
    {
      selector: 'edge.connected',
      style: {
        'line-color': '#a78bfa',
        'target-arrow-color': '#a78bfa',
        width: 3,
      },
    },
  ] as cytoscape.StylesheetJson
}

/** Layout configurations */
function getLayoutConfig(layout: LayoutType): cytoscape.LayoutOptions {
  switch (layout) {
    case 'dagre':
      return {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 60,
        rankSep: 80,
        animate: true,
        animationDuration: 500,
      } as cytoscape.LayoutOptions

    case 'fcose':
      return {
        name: 'fcose',
        animate: true,
        animationDuration: 500,
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: 100,
        nodeRepulsion: 4500,
        gravity: 0.25,
      } as cytoscape.LayoutOptions

    case 'circle':
      return {
        name: 'circle',
        animate: true,
        animationDuration: 500,
        avoidOverlap: true,
        spacingFactor: 1.5,
      }

    case 'concentric':
      return {
        name: 'concentric',
        animate: true,
        animationDuration: 500,
        avoidOverlap: true,
        minNodeSpacing: 50,
        concentric: (node: NodeSingular) => {
          // Order by type: goal > plan > agent > step > process > state
          const typeOrder: Record<string, number> = {
            goal: 5,
            plan: 4,
            agent: 3,
            step: 2,
            process: 1,
            state: 0,
          }
          return typeOrder[node.data('type')] ?? 0
        },
        levelWidth: () => 2,
      } as cytoscape.LayoutOptions

    case 'breadthfirst':
      return {
        name: 'breadthfirst',
        animate: true,
        animationDuration: 500,
        directed: true,
        spacingFactor: 1.5,
        avoidOverlap: true,
      }

    default:
      return {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 60,
        rankSep: 80,
        animate: true,
      } as cytoscape.LayoutOptions
  }
}

/** Main Cytoscape renderer component */
export function CytoscapeRenderer({
  graph,
  selectedNodeId,
  hoveredNodeId: _hoveredNodeId,
  onNodeSelect,
  onNodeHover,
  layout,
}: RendererProps) {
  // hoveredNodeId handled via CSS classes, not direct state
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize Cytoscape instance
  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      style: getStylesheet(),
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    })

    cyRef.current = cy
    setIsInitialized(true)

    // Event handlers
    cy.on('tap', 'node', (evt: EventObject) => {
      onNodeSelect(evt.target.id())
    })

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        onNodeSelect(null)
      }
    })

    cy.on('mouseover', 'node', (evt: EventObject) => {
      evt.target.addClass('hover')
      onNodeHover(evt.target.id())
    })

    cy.on('mouseout', 'node', (evt: EventObject) => {
      evt.target.removeClass('hover')
      onNodeHover(null)
    })

    return () => {
      cy.destroy()
    }
  }, [onNodeSelect, onNodeHover])

  // Update graph data
  useEffect(() => {
    if (!cyRef.current || !isInitialized) return
    const cy = cyRef.current

    // Convert nodes to Cytoscape format
    const nodes = graph.nodes.map(node => ({
      data: {
        id: node.id,
        label: node.label.length > 20 ? node.label.slice(0, 20) + '...' : node.label,
        type: node.type,
        status: node.status,
      },
    }))

    // Convert edges to Cytoscape format
    const edges = graph.edges.map(edge => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.type,
        type: edge.type,
      },
    }))

    // Batch update elements
    cy.batch(() => {
      // Remove elements not in new data
      const newNodeIds = new Set(nodes.map(n => n.data.id))
      const newEdgeIds = new Set(edges.map(e => e.data.id))

      cy.nodes().forEach(node => {
        if (!newNodeIds.has(node.id())) {
          node.remove()
        }
      })

      cy.edges().forEach(edge => {
        if (!newEdgeIds.has(edge.id())) {
          edge.remove()
        }
      })

      // Add or update nodes
      for (const node of nodes) {
        const existing = cy.getElementById(node.data.id)
        if (existing.length === 0) {
          cy.add({ group: 'nodes', ...node })
        } else {
          existing.data(node.data)
        }
      }

      // Add or update edges
      for (const edge of edges) {
        const existing = cy.getElementById(edge.data.id)
        if (existing.length === 0) {
          cy.add({ group: 'edges', ...edge })
        } else {
          existing.data(edge.data)
        }
      }
    })

    // Run layout
    const layoutConfig = getLayoutConfig(layout)
    cy.layout(layoutConfig).run()
  }, [graph, layout, isInitialized])

  // Handle selection changes
  useEffect(() => {
    if (!cyRef.current || !isInitialized) return
    const cy = cyRef.current

    // Update selection
    cy.nodes().unselect()
    cy.edges().removeClass('connected')

    if (selectedNodeId) {
      const node = cy.getElementById(selectedNodeId)
      if (node.length > 0) {
        node.select()
        // Highlight connected edges
        node.connectedEdges().addClass('connected')
      }
    }
  }, [selectedNodeId, isInitialized])

  // Fit view on initial load
  useEffect(() => {
    if (!cyRef.current || !isInitialized || graph.nodes.length === 0) return

    // Delay to allow layout to complete
    const timer = setTimeout(() => {
      cyRef.current?.fit(undefined, 50)
    }, 600)

    return () => clearTimeout(timer)
  }, [graph.nodes.length, isInitialized])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#0f172a',
      }}
    />
  )
}
