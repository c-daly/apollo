/**
 * Sophisticated mock data generator for HCG Explorer
 *
 * Generates a realistic knowledge graph representing a cognitive agent's
 * planning and execution state with interconnected goals, plans, agents,
 * states, and processes.
 */

import type { GraphSnapshot, Entity, CausalEdge } from '../types'

/** Generate a unique ID with optional prefix */
function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`
}

/** Generate a random embedding vector (simulating VL-JEPA) */
function genEmbedding(dims: number = 64): number[] {
  return Array.from({ length: dims }, () => (Math.random() - 0.5) * 2)
}

/** Scenario templates for generating connected subgraphs */
interface Scenario {
  name: string
  description: string
  generate: () => { entities: Entity[]; edges: CausalEdge[] }
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Navigation Task',
    description: 'Agent navigating to a target location',
    generate: () => {
      const goalId = genId('goal')
      const planId = genId('plan')
      const agentId = genId('agent')
      const startStateId = genId('state')
      const targetStateId = genId('state')

      const steps = ['Calculate route', 'Avoid obstacles', 'Move forward', 'Turn left', 'Arrive at destination']
        .map((name, i) => ({
          id: genId('step'),
          name,
          order: i + 1,
          status: i < 3 ? 'completed' : i === 3 ? 'running' : 'pending',
        }))

      const entities: Entity[] = [
        {
          id: goalId,
          type: 'goal',
          labels: ['Goal', 'Navigation'],
          properties: {
            name: 'Navigate to Kitchen',
            priority: 'high',
            status: 'active',
            description: 'Move the agent from current position to kitchen area',
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 300000).toISOString(),
        },
        {
          id: planId,
          type: 'plan',
          labels: ['Plan', 'Navigation'],
          properties: {
            name: 'Kitchen Navigation Plan',
            status: 'executing',
            progress: 0.6,
            estimated_steps: steps.length,
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 280000).toISOString(),
        },
        {
          id: agentId,
          type: 'agent',
          labels: ['Agent', 'Robot'],
          properties: {
            name: 'Hermes Bot',
            status: 'moving',
            x: 15.5,
            y: 8.2,
            heading: 45,
            battery: 78,
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: startStateId,
          type: 'state',
          labels: ['State', 'Position'],
          properties: {
            name: 'Starting Position',
            x: 0,
            y: 0,
            room: 'living_room',
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 290000).toISOString(),
        },
        {
          id: targetStateId,
          type: 'state',
          labels: ['State', 'Position'],
          properties: {
            name: 'Target Position',
            x: 25,
            y: 12,
            room: 'kitchen',
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 290000).toISOString(),
        },
        ...steps.map(step => ({
          id: step.id,
          type: 'step',
          labels: ['Step', 'Action'],
          properties: {
            name: step.name,
            order: step.order,
            status: step.status,
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 270000 + step.order * 10000).toISOString(),
        })),
      ]

      const edges: CausalEdge[] = [
        // Goal generates Plan
        {
          id: genId('edge'),
          source_id: goalId,
          target_id: planId,
          edge_type: 'generates',
          properties: {},
          weight: 1.0,
          created_at: new Date(Date.now() - 280000).toISOString(),
        },
        // Plan contains Steps
        ...steps.map(step => ({
          id: genId('edge'),
          source_id: planId,
          target_id: step.id,
          edge_type: 'contains',
          properties: { order: step.order },
          weight: 1.0,
          created_at: new Date(Date.now() - 270000).toISOString(),
        })),
        // Agent executes Plan
        {
          id: genId('edge'),
          source_id: agentId,
          target_id: planId,
          edge_type: 'executes',
          properties: {},
          weight: 1.0,
          created_at: new Date(Date.now() - 275000).toISOString(),
        },
        // Agent occupies State
        {
          id: genId('edge'),
          source_id: agentId,
          target_id: startStateId,
          edge_type: 'occupies',
          properties: {},
          weight: 1.0,
          created_at: new Date(Date.now() - 260000).toISOString(),
        },
        // Goal targets State
        {
          id: genId('edge'),
          source_id: goalId,
          target_id: targetStateId,
          edge_type: 'targets',
          properties: {},
          weight: 1.0,
          created_at: new Date(Date.now() - 280000).toISOString(),
        },
      ]

      return { entities, edges }
    },
  },
  {
    name: 'Object Manipulation',
    description: 'Agent picking up and placing objects',
    generate: () => {
      const goalId = genId('goal')
      const planId = genId('plan')
      const processId = genId('process')
      const objectStateId = genId('state')

      const steps = ['Locate object', 'Approach object', 'Grasp object', 'Lift object', 'Transport', 'Place object']
        .map((name, i) => ({
          id: genId('step'),
          name,
          order: i + 1,
          status: i < 2 ? 'completed' : i === 2 ? 'running' : 'pending',
        }))

      const entities: Entity[] = [
        {
          id: goalId,
          type: 'goal',
          labels: ['Goal', 'Manipulation'],
          properties: {
            name: 'Move Cup to Table',
            priority: 'medium',
            status: 'active',
            object_type: 'cup',
            destination: 'dining_table',
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 180000).toISOString(),
        },
        {
          id: planId,
          type: 'plan',
          labels: ['Plan', 'Manipulation'],
          properties: {
            name: 'Cup Transport Plan',
            status: 'executing',
            progress: 0.33,
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 170000).toISOString(),
        },
        {
          id: processId,
          type: 'process',
          labels: ['Process', 'Grasp'],
          properties: {
            name: 'Grasp Execution',
            status: 'running',
            grip_force: 0.5,
            contact_points: 3,
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 60000).toISOString(),
        },
        {
          id: objectStateId,
          type: 'state',
          labels: ['State', 'Object'],
          properties: {
            name: 'Cup State',
            x: 10,
            y: 5,
            z: 2,
            held: true,
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 150000).toISOString(),
        },
        ...steps.map(step => ({
          id: step.id,
          type: 'step',
          labels: ['Step', 'Action'],
          properties: {
            name: step.name,
            order: step.order,
            status: step.status,
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 160000 + step.order * 5000).toISOString(),
        })),
      ]

      const edges: CausalEdge[] = [
        {
          id: genId('edge'),
          source_id: goalId,
          target_id: planId,
          edge_type: 'generates',
          properties: {},
          weight: 1.0,
          created_at: new Date(Date.now() - 170000).toISOString(),
        },
        ...steps.map(step => ({
          id: genId('edge'),
          source_id: planId,
          target_id: step.id,
          edge_type: 'contains',
          properties: {},
          weight: 1.0,
          created_at: new Date(Date.now() - 160000).toISOString(),
        })),
        {
          id: genId('edge'),
          source_id: steps[2].id,
          target_id: processId,
          edge_type: 'spawns',
          properties: {},
          weight: 1.0,
          created_at: new Date(Date.now() - 60000).toISOString(),
        },
        {
          id: genId('edge'),
          source_id: processId,
          target_id: objectStateId,
          edge_type: 'updates',
          properties: {},
          weight: 1.0,
          created_at: new Date(Date.now() - 55000).toISOString(),
        },
      ]

      return { entities, edges }
    },
  },
  {
    name: 'Information Query',
    description: 'Agent processing a user query',
    generate: () => {
      const goalId = genId('goal')
      const planId = genId('plan')
      const processId = genId('process')

      const steps = ['Parse query', 'Retrieve context', 'Generate response', 'Validate output']
        .map((name, i) => ({
          id: genId('step'),
          name,
          order: i + 1,
          status: i < 3 ? 'completed' : 'running',
        }))

      const entities: Entity[] = [
        {
          id: goalId,
          type: 'goal',
          labels: ['Goal', 'Query'],
          properties: {
            name: 'Answer User Question',
            priority: 'high',
            status: 'active',
            query: 'What is the weather like today?',
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 30000).toISOString(),
        },
        {
          id: planId,
          type: 'plan',
          labels: ['Plan', 'Query'],
          properties: {
            name: 'Query Response Plan',
            status: 'executing',
            progress: 0.75,
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 28000).toISOString(),
        },
        {
          id: processId,
          type: 'process',
          labels: ['Process', 'LLM'],
          properties: {
            name: 'LLM Inference',
            status: 'completed',
            model: 'hermes-v2',
            tokens_used: 156,
            latency_ms: 450,
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 20000).toISOString(),
        },
        ...steps.map(step => ({
          id: step.id,
          type: 'step',
          labels: ['Step', 'Action'],
          properties: {
            name: step.name,
            order: step.order,
            status: step.status,
            embedding: genEmbedding(),
          },
          created_at: new Date(Date.now() - 25000 + step.order * 3000).toISOString(),
        })),
      ]

      const edges: CausalEdge[] = [
        {
          id: genId('edge'),
          source_id: goalId,
          target_id: planId,
          edge_type: 'generates',
          properties: {},
          weight: 1.0,
          created_at: new Date(Date.now() - 28000).toISOString(),
        },
        ...steps.map(step => ({
          id: genId('edge'),
          source_id: planId,
          target_id: step.id,
          edge_type: 'contains',
          properties: {},
          weight: 1.0,
          created_at: new Date(Date.now() - 26000).toISOString(),
        })),
        {
          id: genId('edge'),
          source_id: steps[2].id,
          target_id: processId,
          edge_type: 'invokes',
          properties: {},
          weight: 1.0,
          created_at: new Date(Date.now() - 20000).toISOString(),
        },
      ]

      return { entities, edges }
    },
  },
]

/** Add cross-scenario connections */
function addCrossConnections(
  entities: Entity[],
  _edges: CausalEdge[]
): CausalEdge[] {
  const newEdges: CausalEdge[] = []
  const goals = entities.filter(e => e.type === 'goal')
  const agents = entities.filter(e => e.type === 'agent')
  const states = entities.filter(e => e.type === 'state')

  // Connect agents to goals
  for (const agent of agents) {
    for (const goal of goals) {
      if (Math.random() > 0.5) {
        newEdges.push({
          id: genId('edge'),
          source_id: agent.id,
          target_id: goal.id,
          edge_type: 'pursues',
          properties: {},
          weight: 0.8,
          created_at: new Date().toISOString(),
        })
      }
    }
  }

  // Connect some states
  if (states.length >= 2) {
    for (let i = 0; i < states.length - 1; i++) {
      if (Math.random() > 0.6) {
        newEdges.push({
          id: genId('edge'),
          source_id: states[i].id,
          target_id: states[i + 1].id,
          edge_type: 'leads_to',
          properties: {},
          weight: 0.5,
          created_at: new Date().toISOString(),
        })
      }
    }
  }

  return newEdges
}

/**
 * Generate a sophisticated mock HCG snapshot
 */
export function generateMockSnapshot(): GraphSnapshot {
  const allEntities: Entity[] = []
  const allEdges: CausalEdge[] = []

  // Add a shared agent that connects scenarios
  const sharedAgent: Entity = {
    id: 'agent_hermes_main',
    type: 'agent',
    labels: ['Agent', 'Primary'],
    properties: {
      name: 'Hermes Prime',
      status: 'active',
      battery: 92,
      uptime_hours: 48,
      tasks_completed: 127,
      embedding: genEmbedding(),
    },
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  }
  allEntities.push(sharedAgent)

  // Generate entities from each scenario
  for (const scenario of SCENARIOS) {
    const { entities, edges } = scenario.generate()
    allEntities.push(...entities)
    allEdges.push(...edges)

    // Connect shared agent to scenario goals
    const scenarioGoals = entities.filter(e => e.type === 'goal')
    for (const goal of scenarioGoals) {
      allEdges.push({
        id: genId('edge'),
        source_id: sharedAgent.id,
        target_id: goal.id,
        edge_type: 'assigned',
        properties: {},
        weight: 1.0,
        created_at: goal.created_at || new Date().toISOString(),
      })
    }
  }

  // Add cross-connections
  const crossEdges = addCrossConnections(allEntities, allEdges)
  allEdges.push(...crossEdges)

  // Add some metadata nodes
  const systemState: Entity = {
    id: 'state_system',
    type: 'state',
    labels: ['State', 'System'],
    properties: {
      name: 'System State',
      timestamp: new Date().toISOString(),
      active_goals: allEntities.filter(e => e.type === 'goal').length,
      active_plans: allEntities.filter(e => e.type === 'plan').length,
      cpu_usage: 45,
      memory_usage: 62,
      embedding: genEmbedding(),
    },
    created_at: new Date().toISOString(),
  }
  allEntities.push(systemState)

  // Count types for metadata
  const typeCounts: Record<string, number> = {}
  for (const entity of allEntities) {
    typeCounts[entity.type] = (typeCounts[entity.type] || 0) + 1
  }

  return {
    entities: allEntities,
    edges: allEdges,
    timestamp: new Date().toISOString(),
    metadata: {
      entity_count: allEntities.length,
      edge_count: allEdges.length,
      entity_types: Object.keys(typeCounts),
      type_counts: typeCounts,
      is_mock: true,
    },
  }
}

/**
 * Generate a sequence of mock snapshots for temporal playback
 */
export function generateMockHistory(count: number = 10): GraphSnapshot[] {
  const snapshots: GraphSnapshot[] = []
  const baseSnapshot = generateMockSnapshot()

  for (let i = 0; i < count; i++) {
    // Clone and modify the snapshot
    const snapshot: GraphSnapshot = JSON.parse(JSON.stringify(baseSnapshot))

    // Update timestamp
    snapshot.timestamp = new Date(Date.now() - (count - i) * 15000).toISOString()

    // Simulate some progress changes
    for (const entity of snapshot.entities) {
      if (entity.type === 'step' && entity.properties.status === 'running') {
        // Maybe complete running steps
        if (Math.random() > 0.7) {
          entity.properties.status = 'completed'
        }
      } else if (entity.type === 'step' && entity.properties.status === 'pending') {
        // Maybe start pending steps
        if (Math.random() > 0.85) {
          entity.properties.status = 'running'
        }
      }

      // Update agent position
      if (entity.type === 'agent' && entity.properties.x !== undefined) {
        entity.properties.x = (entity.properties.x as number) + (Math.random() - 0.5) * 2
        entity.properties.y = (entity.properties.y as number) + (Math.random() - 0.5) * 2
      }

      // Update plan progress
      if (entity.type === 'plan') {
        entity.properties.progress = Math.min(
          1,
          (entity.properties.progress as number || 0) + Math.random() * 0.1
        )
      }
    }

    snapshots.push(snapshot)
  }

  return snapshots
}
