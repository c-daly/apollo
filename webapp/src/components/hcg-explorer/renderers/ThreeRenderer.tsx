/**
 * Three.js 3D Renderer for HCG Explorer
 *
 * Uses @react-three/fiber for React integration and
 * d3-force-3d for force-directed layout simulation.
 */

import { useRef, useState, useEffect, useCallback, memo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text, Line } from '@react-three/drei'
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

/* ── Shared geometry & material singletons (allocated once) ── */
const SHARED_SPHERE_GEO = new THREE.SphereGeometry(5, 16, 16)
const SHARED_TORUS_GEO = new THREE.TorusGeometry(6, 0.8, 8, 32)
const SHARED_SELECTION_TORUS_GEO = new THREE.TorusGeometry(8, 0.5, 8, 32)
const SHARED_MIDPOINT_GEO = new THREE.SphereGeometry(1, 8, 8)
const SHARED_MIDPOINT_MAT = new THREE.MeshBasicMaterial({ color: '#888888' })
const SHARED_SELECTION_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff' })
const TORUS_ROTATION: [number, number, number] = [Math.PI / 2, 0, 0]

/** Node sphere component */
interface NodeSphereProps {
  node: GraphNode
  position: [number, number, number]
  isSelected: boolean
  isHovered: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}

const NodeSphere = memo(function NodeSphere({
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
        geometry={SHARED_SPHERE_GEO}
      >
        <meshStandardMaterial
          color={baseColor}
          emissive={isSelected ? baseColor : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : 0}
        />
      </mesh>

      {/* Status ring (if applicable) */}
      {statusColor && (
        <mesh rotation={TORUS_ROTATION} geometry={SHARED_TORUS_GEO}>
          <meshStandardMaterial color={statusColor} />
        </mesh>
      )}

      {/* Selection ring */}
      {isSelected && (
        <mesh rotation={TORUS_ROTATION} geometry={SHARED_SELECTION_TORUS_GEO} material={SHARED_SELECTION_MAT} />
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
})

/** Edge line component */
interface EdgeLineProps {
  sourcePos: [number, number, number]
  targetPos: [number, number, number]
}

const EdgeLine = memo(function EdgeLine({ sourcePos, targetPos }: EdgeLineProps) {
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
      <mesh position={midpoint} geometry={SHARED_MIDPOINT_GEO} material={SHARED_MIDPOINT_MAT} />
    </group>
  )
})

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simNodesRef = useRef<Map<string, any>>(new Map())

  // Incrementally update simulation when graph changes
  useEffect(() => {
    if (nodes.length === 0) {
      if (simulationRef.current) {
        simulationRef.current.stop()
        simulationRef.current = null
        simNodesRef.current.clear()
      }
      setPositions(new Map())
      return
    }

    const currentNodeMap = simNodesRef.current
    const newNodeIds = new Set(nodes.map(n => n.id))

    // Remove nodes no longer in graph
    for (const [id] of currentNodeMap) {
      if (!newNodeIds.has(id)) {
        currentNodeMap.delete(id)
      }
    }

    // Add new nodes near the centroid of connected neighbors (or random if none)
    for (const node of nodes) {
      if (!currentNodeMap.has(node.id)) {
        // Find ALL connected neighbors already in the layout
        const connectedNeighbors = edges
          .filter(
            e => (e.source === node.id && currentNodeMap.has(e.target)) ||
                 (e.target === node.id && currentNodeMap.has(e.source))
          )
          .map(e => currentNodeMap.get(e.source === node.id ? e.target : e.source)!)

        if (connectedNeighbors.length > 0) {
          // Place near the centroid of all connected neighbors
          const cx = connectedNeighbors.reduce((s, n) => s + (n.x || 0), 0) / connectedNeighbors.length
          const cy = connectedNeighbors.reduce((s, n) => s + (n.y || 0), 0) / connectedNeighbors.length
          const cz = connectedNeighbors.reduce((s, n) => s + (n.z || 0), 0) / connectedNeighbors.length
          currentNodeMap.set(node.id, {
            id: node.id,
            x: cx + (Math.random() - 0.5) * 40,
            y: cy + (Math.random() - 0.5) * 40,
            z: cz + (Math.random() - 0.5) * 40,
          })
        } else {
          currentNodeMap.set(node.id, {
            id: node.id,
            x: (Math.random() - 0.5) * 200,
            y: (Math.random() - 0.5) * 200,
            z: (Math.random() - 0.5) * 200,
          })
        }
      }
    }

    const simNodes = Array.from(currentNodeMap.values())

    // Build links
    const nodeIdSet = new Set(simNodes.map(n => n.id))
    const simLinks = edges
      .filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
      .map(e => ({ source: e.source, target: e.target }))

    // Stop previous simulation
    if (simulationRef.current) {
      simulationRef.current.stop()
    }

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

    simulation.on('tick', () => {
      const newPositions = new Map<string, [number, number, number]>()
      for (const node of simNodes) {
        newPositions.set(node.id, [node.x || 0, node.y || 0, node.z || 0])
      }
      setPositions(newPositions)
    })

    // Gentle reheat — not full restart
    simulation.alpha(0.3).restart()

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

  // Derive focus position from selected node
  const focusPosition = selectedNodeId ? (positions.get(selectedNodeId) || null) : null

  return (
    <>
      {/* Camera controls with focus-on-select */}
      <CameraControls focusPosition={focusPosition} />

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

/** Camera controls wrapper — persists position/target across re-renders */
function CameraControls({ focusPosition }: { focusPosition: [number, number, number] | null }) {
  const { camera, gl } = useThree()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null)

  // Store camera state so it survives React re-renders
  const savedState = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null)

  useEffect(() => {
    const controls = controlsRef.current
    if (controls && savedState.current) {
      camera.position.copy(savedState.current.position)
      controls.target.copy(savedState.current.target)
      controls.update()
    }

    return () => {
      if (controls) {
        savedState.current = {
          position: camera.position.clone(),
          target: controls.target.clone(),
        }
      }
    }
  }, [camera])

  // Smoothly animate toward selected node
  const targetVec = useRef(new THREE.Vector3())

  useFrame(() => {
    if (!controlsRef.current || !focusPosition) return
    targetVec.current.set(...focusPosition)
    if (controlsRef.current.target.distanceTo(targetVec.current) > 0.1) {
      controlsRef.current.target.lerp(targetVec.current, 0.05)
      controlsRef.current.update()
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      args={[camera, gl.domElement]}
      enableDamping
      dampingFactor={0.15}
      rotateSpeed={1}
      zoomSpeed={1.2}
      panSpeed={0.8}
      minDistance={20}
      maxDistance={800}
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

      {/* Scene content (includes controls so it can pass focus position) */}
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
