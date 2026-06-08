/**
 * Cytoscape 2D Renderer for HCG Explorer
 *
 * Uses Cytoscape.js for 2D graph visualization with multiple layout options.
 */

import { useEffect, useRef, useState } from 'react'
import cytoscape, { Core, NodeSingular, EventObject } from 'cytoscape'
import dagre from 'cytoscape-dagre'
import type { RendererProps, LayoutType } from '../types'
import {
  DEFAULT_DENSITY,
  densityToFcose,
  densitySpacingFactor,
  type DensityParams,
} from '../utils/layout-density'
import { NODE_COLORS, STATUS_COLORS } from '../types'

// Register dagre layout
cytoscape.use(dagre)

/** Realm-root type names; the hierarchical layout roots the IS_A tree on the
 *  type-definition nodes for these realms. */
const REALM_ROOTS = new Set(['entity', 'concept', 'process'])

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
    // NDT realm types emitted by sophia's realm-triage on ingested nodes
    {
      selector: 'node[type="entity"]',
      style: {
        'background-color': NODE_COLORS.entity,
        shape: 'ellipse',
        color: '#ffffff',
        'text-outline-color': NODE_COLORS.entity,
      },
    },
    {
      selector: 'node[type="concept"]',
      style: {
        'background-color': NODE_COLORS.concept,
        shape: 'round-rectangle',
        color: '#ffffff',
        'text-outline-color': NODE_COLORS.concept,
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
    // Highlight-subgraph dimming: nodes/edges outside the focused subgraph
    // fade back so a selection is emphasised without removing context.
    {
      selector: 'node.dimmed',
      style: {
        opacity: 0.12,
        'text-opacity': 0.08,
      },
    },
    {
      selector: 'edge.dimmed',
      style: {
        opacity: 0.05,
        'text-opacity': 0,
      },
    },
  ] as cytoscape.StylesheetJson
}

/** Layout configurations */
function getLayoutConfig(
  layout: LayoutType,
  cy?: Core,
  densityParams: DensityParams = DEFAULT_DENSITY
): cytoscape.LayoutOptions {
  // Density controls: fcose force layout uses the full mapping; non-force
  // layouts (hierarchical / tree / circle / concentric / dagre) honour only the
  // spacing (link-distance) slider.
  const spacing = densitySpacingFactor(densityParams)
  const spacingScale = spacing / 1.4
  const fcose = densityToFcose(densityParams)
  switch (layout) {
    case 'dagre':
      return {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: Math.round(60 * spacingScale),
        rankSep: Math.round(80 * spacingScale),
        animate: true,
        animationDuration: 500,
      } as cytoscape.LayoutOptions

    case 'fcose':
      return {
        name: 'fcose',
        animate: true,
        animationDuration: 500,
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: fcose.idealEdgeLength,
        nodeRepulsion: fcose.nodeRepulsion,
        gravity: fcose.gravity,
      } as cytoscape.LayoutOptions

    case 'circle':
      return {
        name: 'circle',
        animate: true,
        animationDuration: 500,
        avoidOverlap: true,
        spacingFactor: spacing,
      }

    case 'concentric':
      return {
        name: 'concentric',
        animate: true,
        animationDuration: 500,
        avoidOverlap: true,
        minNodeSpacing: Math.round(50 * spacingScale),
        concentric: (node: NodeSingular) => {
          // Order by type: goal > plan > agent > step > {process, entity, concept} > state
          const typeOrder: Record<string, number> = {
            goal: 5,
            plan: 4,
            agent: 3,
            step: 2,
            // NDT realm types (entity/concept/process) are peers and share a ring level
            process: 1,
            entity: 1,
            concept: 1,
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
        spacingFactor: spacing,
        avoidOverlap: true,
      }

    case 'hierarchical': {
      // Top-down IS_A tree rooted at the realm-root type definitions
      // (entity / concept / process). Uses cytoscape's built-in breadthfirst
      // so no new dependency is needed; falls back to auto-picked roots when
      // the realm roots are absent (e.g. a non-skeleton view).
      const roots = cy ? cy.nodes('[?isRealmRoot]') : undefined
      return {
        name: 'breadthfirst',
        directed: true,
        roots: roots && roots.length > 0 ? roots : undefined,
        spacingFactor: spacing,
        avoidOverlap: true,
        animate: true,
        animationDuration: 500,
      } as cytoscape.LayoutOptions
    }

    default:
      return {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: Math.round(60 * spacingScale),
        rankSep: Math.round(80 * spacingScale),
        animate: true,
      } as cytoscape.LayoutOptions
  }
}

/** Main Cytoscape renderer component */
export function CytoscapeRenderer({
  graph,
  selectedNodeId,
  // hoveredNodeId not currently used in Cytoscape renderer
  onNodeSelect,
  onNodeHover,
  layout,
  highlightedNodeIds,
  densityParams = DEFAULT_DENSITY,
}: RendererProps) {
  // hoveredNodeId handled via CSS classes, not direct state
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Track layout debounce timer
  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track the last applied layout / density so the element-sync effect can
  // re-run the layout when those controls change, not only on structural change.
  const prevLayoutRef = useRef<LayoutType | null>(null)
  const prevDensityRef = useRef<DensityParams | null>(null)

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
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current)
      cy.destroy()
    }
  }, [onNodeSelect, onNodeHover])

  // Update graph data
  useEffect(() => {
    if (!cyRef.current || !isInitialized) return
    const cy = cyRef.current

    const nodes = graph.nodes.map(node => ({
      data: {
        id: node.id,
        label: node.label.length > 20 ? node.label.slice(0, 20) + '...' : node.label,
        type: node.type,
        status: node.status,
        // Realm-root flag drives the hierarchical layout roots.
        isRealmRoot:
          node.type === 'type_definition' &&
          REALM_ROOTS.has(node.label.trim().toLowerCase()),
      },
    }))

    const edges = graph.edges.map(edge => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.type,
        type: edge.type,
      },
    }))

    let structuralChange = false

    cy.batch(() => {
      const newNodeIds = new Set(nodes.map(n => n.data.id))
      const newEdgeIds = new Set(edges.map(e => e.data.id))

      // Remove elements not in new data
      cy.nodes().forEach(node => {
        if (!newNodeIds.has(node.id())) {
          node.remove()
          structuralChange = true
        }
      })

      cy.edges().forEach(edge => {
        if (!newEdgeIds.has(edge.id())) {
          edge.remove()
          structuralChange = true
        }
      })

      // Add or update nodes
      for (const node of nodes) {
        const existing = cy.getElementById(node.data.id)
        if (existing.length === 0) {
          cy.add({ group: 'nodes', ...node })
          structuralChange = true
        } else {
          existing.data(node.data)
        }
      }

      // Add or update edges
      for (const edge of edges) {
        const existing = cy.getElementById(edge.data.id)
        if (existing.length === 0) {
          cy.add({ group: 'edges', ...edge })
          structuralChange = true
        } else {
          existing.data(edge.data)
        }
      }
    })

    // Re-layout on structural changes OR when the layout / density controls
    // change, so switching layout or moving a density slider takes effect
    // immediately instead of waiting for the next snapshot poll (which is what
    // made the layout button feel like a no-op). Debounced to coalesce drags.
    const layoutChanged = prevLayoutRef.current !== layout
    const densityChanged = prevDensityRef.current !== densityParams
    prevLayoutRef.current = layout
    prevDensityRef.current = densityParams
    if (structuralChange || layoutChanged || densityChanged) {
      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current)
      layoutTimerRef.current = setTimeout(() => {
        const layoutConfig = getLayoutConfig(layout, cy, densityParams)
        cy.layout(
          layoutConfig.name === 'null'
            ? layoutConfig
            : ({ ...layoutConfig, fit: false } as cytoscape.LayoutOptions)
        ).run()
      }, 200)
    }
  }, [graph, layout, densityParams, isInitialized])

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

  // Highlight-subgraph dimming: when a highlight set is active, keep those
  // nodes (and edges with both endpoints in the set) bright and dim the rest,
  // preserving context. A null/empty set clears all dimming (full opacity).
  useEffect(() => {
    if (!cyRef.current || !isInitialized) return
    const cy = cyRef.current
    const hi = highlightedNodeIds
    if (!hi || hi.size === 0) {
      cy.nodes().removeClass('dimmed')
      cy.edges().removeClass('dimmed')
      return
    }
    cy.nodes().forEach(n => {
      if (hi.has(n.id())) n.removeClass('dimmed')
      else n.addClass('dimmed')
    })
    cy.edges().forEach(e => {
      if (hi.has(e.source().id()) && hi.has(e.target().id())) {
        e.removeClass('dimmed')
      } else {
        e.addClass('dimmed')
      }
    })
  }, [highlightedNodeIds, graph, isInitialized])

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
