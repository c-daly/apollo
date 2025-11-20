/**
 * Graph visualization component for HCG using Cytoscape
 */

import React, { useEffect, useRef } from 'react'
import cytoscape, { Core, ElementDefinition } from 'cytoscape'
import dagre from 'cytoscape-dagre'
import type { GraphSnapshot } from '../types/hcg'

// Register dagre layout
cytoscape.use(dagre)

export interface HCGGraphProps {
  snapshot: GraphSnapshot
  width?: string
  height?: string
  onNodeClick?: (nodeId: string) => void
  onEdgeClick?: (edgeId: string) => void
}

/**
 * HCG Graph Visualization Component
 *
 * Renders the Hybrid Causal Graph using Cytoscape.js with a hierarchical layout.
 * Nodes represent entities (states, processes, goals) and edges represent causal relationships.
 */
export function HCGGraph({
  snapshot,
  width = '100%',
  height = '600px',
  onNodeClick,
  onEdgeClick,
}: HCGGraphProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Initialize Cytoscape
    const cy = cytoscape({
      container: containerRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#4A90E2',
            label: 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            color: '#333',
            'font-size': '12px',
            width: 60,
            height: 60,
          },
        },
        {
          selector: 'node[type="state"]',
          style: {
            'background-color': '#50C878',
            shape: 'ellipse',
          },
        },
        {
          selector: 'node[type="process"]',
          style: {
            'background-color': '#FF6B6B',
            shape: 'rectangle',
          },
        },
        {
          selector: 'node[type="goal"]',
          style: {
            'background-color': '#FFD700',
            shape: 'diamond',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#999',
            'target-arrow-color': '#999',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': '10px',
            color: '#666',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#333',
          },
        },
        {
          selector: 'edge:selected',
          style: {
            width: 3,
            'line-color': '#333',
          },
        },
      ],
      layout: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 50,
        rankSep: 100,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    cyRef.current = cy

    // Add click handlers
    cy.on('tap', 'node', event => {
      const node = event.target
      if (onNodeClick) {
        onNodeClick(node.id())
      }
    })

    cy.on('tap', 'edge', event => {
      const edge = event.target
      if (onEdgeClick) {
        onEdgeClick(edge.id())
      }
    })

    return () => {
      cy.destroy()
    }
  }, [onNodeClick, onEdgeClick])

  // Update graph data when snapshot changes
  useEffect(() => {
    if (!cyRef.current) return

    const cy = cyRef.current

    // Convert snapshot to Cytoscape elements
    const elements: ElementDefinition[] = [
      // Nodes
      ...snapshot.entities.map(entity => ({
        data: {
          id: entity.id,
          label:
            entity.properties.name ||
            entity.properties.description ||
            entity.id,
          type: entity.type,
          ...entity.properties,
        },
      })),
      // Edges
      ...snapshot.edges.map(edge => ({
        data: {
          id: edge.id,
          source: edge.source_id,
          target: edge.target_id,
          label: edge.edge_type,
          type: edge.edge_type,
          weight: edge.weight,
        },
      })),
    ]

    // Update graph
    cy.elements().remove()
    cy.add(elements)

    // Re-apply layout
    cy.layout({
      name: 'dagre',
      rankDir: 'TB',
      nodeSep: 50,
      rankSep: 100,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).run()

    // Fit to viewport
    cy.fit(undefined, 50)
  }, [snapshot])

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        border: '1px solid #ddd',
        borderRadius: '4px',
      }}
    />
  )
}
