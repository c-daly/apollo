/**
 * Three.js 3D Renderer for HCG Explorer
 *
 * Uses @react-three/fiber for React integration and
 * d3-force-3d for force-directed layout simulation.
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { TrackballControls, Text, Line } from '@react-three/drei'
import * as THREE from 'three'
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
} from 'd3-force-3d'
import type { RendererProps, GraphNode, GraphEdge } from '../types'
import { NODE_COLORS, STATUS_COLORS } from '../types'

/** Node sphere component */
interface NodeSphereProps {
  node: GraphNode
  position: [number, number, number]
  isSelected: boolean
  isHovered: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}

function NodeSphere({
  node,
  position,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}: NodeSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  // Get color based on type and status
  const baseColor = NODE_COLORS[node.type] || NODE_COLORS.default
  const statusColor = node.status
    ? STATUS_COLORS[node.status] || STATUS_COLORS.default
    : null

  // Animate scale on hover/select
  useFrame(() => {
    if (!meshRef.current) return
    const targetScale = isSelected ? 1.4 : isHovered ? 1.2 : 1.0
    meshRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      0.1
    )
  })

  return (
    <group position={position}>
      {/* Main sphere */}
      <mesh
        ref={meshRef}
        onClick={e => {
          e.stopPropagation()
          onSelect(node.id)
        }}
        onPointerOver={e => {
          e.stopPropagation()
          onHover(node.id)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          onHover(null)
          document.body.style.cursor = 'auto'
        }}
      >
        <sphereGeometry args={[5, 16, 16]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={isSelected ? baseColor : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : 0}
        />
      </mesh>

      {/* Status ring (if applicable) */}
      {statusColor && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[6, 0.8, 8, 32]} />
          <meshStandardMaterial color={statusColor} />
        </mesh>
      )}

      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[8, 0.5, 8, 32]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}

      {/* Label */}
      <Text
        position={[0, 8, 0]}
        fontSize={3}
        color="#ffffff"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.2}
        outlineColor="#000000"
      >
        {node.label.length > 15 ? node.label.slice(0, 15) + '...' : node.label}
      </Text>
    </group>
  )
}

/** Edge line component */
interface EdgeLineProps {
  edge: GraphEdge
  sourcePos: [number, number, number]
  targetPos: [number, number, number]
}

function EdgeLine({ sourcePos, targetPos }: EdgeLineProps) {
  // Calculate midpoint for potential label
  const midpoint: [number, number, number] = [
    (sourcePos[0] + targetPos[0]) / 2,
    (sourcePos[1] + targetPos[1]) / 2,
    (sourcePos[2] + targetPos[2]) / 2,
  ]

  return (
    <group>
      <Line
        points={[sourcePos, targetPos]}
        color="#666666"
        lineWidth={1}
        opacity={0.6}
        transparent
      />
      {/* Arrow indicator near target */}
      <mesh position={midpoint}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color="#888888" />
      </mesh>
    </group>
  )
}

/** Scene content with nodes and edges */
interface SceneContentProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId: string | null
  hoveredNodeId: string | null
  onNodeSelect: (id: string | null) => void
  onNodeHover: (id: string | null) => void
}

function SceneContent({
  nodes,
  edges,
  selectedNodeId,
  hoveredNodeId,
  onNodeSelect,
  onNodeHover,
}: SceneContentProps) {
  const [positions, setPositions] = useState<Map<string, [number, number, number]>>(
    new Map()
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simulationRef = useRef<any>(null)

  // Initialize force simulation
  useEffect(() => {
    if (nodes.length === 0) return

    // Create simulation nodes with initial positions
    const simNodes = nodes.map(node => ({
      id: node.id,
      x: node.position?.x ?? (Math.random() - 0.5) * 200,
      y: node.position?.y ?? (Math.random() - 0.5) * 200,
      z: node.position?.z ?? (Math.random() - 0.5) * 200,
    }))

    // Create simulation links
    const nodeIdSet = new Set(nodes.map(n => n.id))
    const simLinks = edges
      .filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
      .map(e => ({
        source: e.source,
        target: e.target,
      }))

    // Create force simulation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkForce = forceLink(simLinks).id((d: any) => d.id) as any
    if (linkForce.distance) linkForce.distance(50)

    const simulation = forceSimulation(simNodes, 3)
      .force('charge', forceManyBody().strength(-100))
      .force('link', linkForce)
      .force('center', forceCenter(0, 0, 0))
      .force('collide', forceCollide(10))
      .alphaDecay(0.02)

    simulationRef.current = simulation

    // Update positions on tick
    simulation.on('tick', () => {
      const newPositions = new Map<string, [number, number, number]>()
      for (const node of simNodes) {
        newPositions.set(node.id, [node.x || 0, node.y || 0, node.z || 0])
      }
      setPositions(newPositions)
    })

    // Run simulation
    simulation.alpha(1).restart()

    return () => {
      simulation.stop()
    }
  }, [nodes, edges])

  // Handle click on empty space to deselect
  const handleBackgroundClick = useCallback(() => {
    onNodeSelect(null)
  }, [onNodeSelect])

  // Build position lookup for edges
  const getPosition = useCallback(
    (id: string): [number, number, number] => {
      return positions.get(id) || [0, 0, 0]
    },
    [positions]
  )

  return (
    <>
      {/* Background click handler */}
      <mesh
        position={[0, 0, -500]}
        onClick={handleBackgroundClick}
        visible={false}
      >
        <planeGeometry args={[2000, 2000]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Edges */}
      {edges.map(edge => {
        const sourcePos = getPosition(edge.source)
        const targetPos = getPosition(edge.target)
        if (!sourcePos || !targetPos) return null

        return (
          <EdgeLine
            key={edge.id}
            edge={edge}
            sourcePos={sourcePos}
            targetPos={targetPos}
          />
        )
      })}

      {/* Nodes */}
      {nodes.map(node => {
        const position = positions.get(node.id)
        if (!position) return null

        return (
          <NodeSphere
            key={node.id}
            node={node}
            position={position}
            isSelected={selectedNodeId === node.id}
            isHovered={hoveredNodeId === node.id}
            onSelect={onNodeSelect}
            onHover={onNodeHover}
          />
        )
      })}
    </>
  )
}

/** Camera controls wrapper */
function CameraControls() {
  const { camera, gl } = useThree()

  return (
    <TrackballControls
      args={[camera, gl.domElement]}
      rotateSpeed={2}
      zoomSpeed={1.2}
      panSpeed={0.8}
      dynamicDampingFactor={0.2}
    />
  )
}

/** Main Three.js renderer component */
export function ThreeRenderer({
  graph,
  selectedNodeId,
  hoveredNodeId,
  onNodeSelect,
  onNodeHover,
}: RendererProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 300], fov: 60 }}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <pointLight position={[100, 100, 100]} intensity={1} />
      <pointLight position={[-100, -100, -100]} intensity={0.5} />

      {/* Controls */}
      <CameraControls />

      {/* Scene content */}
      <SceneContent
        nodes={graph.nodes}
        edges={graph.edges}
        selectedNodeId={selectedNodeId}
        hoveredNodeId={hoveredNodeId}
        onNodeSelect={onNodeSelect}
        onNodeHover={onNodeHover}
      />

      {/* Grid helper for orientation */}
      <gridHelper args={[400, 20, '#333333', '#222222']} rotation={[Math.PI / 2, 0, 0]} />
    </Canvas>
  )
}
