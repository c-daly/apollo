/**
 * Example React Component: Goal Creator
 * 
 * Demonstrates how to use the Sophia API client in a React component
 * to create goals and display their status.
 */

import React, { useState } from 'react'
import { sophiaClient } from '../lib'
import type { GoalResponse } from '../lib'

export function GoalCreator() {
  const [goalText, setGoalText] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdGoal, setCreatedGoal] = useState<GoalResponse | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!goalText.trim()) {
      setError('Please enter a goal description')
      return
    }

    setLoading(true)
    setError(null)
    setCreatedGoal(null)

    try {
      // Check if Sophia is available
      const isHealthy = await sophiaClient.healthCheck()
      if (!isHealthy) {
        setError('Sophia service is not available. Please check your connection.')
        setLoading(false)
        return
      }

      // Create the goal
      const response = await sophiaClient.createGoal({
        goal: goalText,
        priority,
      })

      if (response.success && response.data) {
        setCreatedGoal(response.data)
        setGoalText('')
      } else {
        setError(response.error || 'Failed to create goal')
      }
    } catch (err) {
      setError('An unexpected error occurred')
      console.error('Error creating goal:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="goal-creator">
      <h2>Create New Goal</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="goal-input">Goal Description</label>
          <input
            id="goal-input"
            type="text"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            placeholder="e.g., Navigate to the kitchen"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="priority-select">Priority</label>
          <select
            id="priority-select"
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
            disabled={loading}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Goal'}
        </button>
      </form>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {createdGoal && (
        <div className="success-message">
          <h3>Goal Created Successfully!</h3>
          <dl>
            <dt>Goal ID:</dt>
            <dd>{createdGoal.goal_id}</dd>
            
            <dt>Description:</dt>
            <dd>{createdGoal.description}</dd>
            
            <dt>Priority:</dt>
            <dd>{createdGoal.priority || 'not specified'}</dd>
            
            <dt>Status:</dt>
            <dd>{createdGoal.status}</dd>
            
            <dt>Created At:</dt>
            <dd>{new Date(createdGoal.created_at).toLocaleString()}</dd>
          </dl>
        </div>
      )}
    </div>
  )
}

/**
 * Example React Component: Text Embedding Generator
 * 
 * Demonstrates how to use the Hermes API client to generate embeddings
 */

import { hermesClient } from '../lib'

export function EmbeddingGenerator() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [embedding, setEmbedding] = useState<number[] | null>(null)
  const [dimensions, setDimensions] = useState<number>(0)

  const handleGenerate = async () => {
    if (!text.trim()) {
      setError('Please enter some text')
      return
    }

    setLoading(true)
    setError(null)
    setEmbedding(null)

    try {
      const response = await hermesClient.embedText({ text })

      if (response.success && response.data) {
        setEmbedding(response.data.embedding)
        setDimensions(response.data.dimensions)
      } else {
        setError(response.error || 'Failed to generate embedding')
      }
    } catch (err) {
      setError('An unexpected error occurred')
      console.error('Error generating embedding:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="embedding-generator">
      <h2>Generate Text Embedding</h2>
      
      <div className="form-group">
        <label htmlFor="text-input">Text</label>
        <textarea
          id="text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text to embed..."
          rows={4}
          disabled={loading}
        />
      </div>

      <button onClick={handleGenerate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate Embedding'}
      </button>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {embedding && (
        <div className="success-message">
          <h3>Embedding Generated</h3>
          <p><strong>Dimensions:</strong> {dimensions}</p>
          <details>
            <summary>View Embedding Vector</summary>
            <pre>{JSON.stringify(embedding, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  )
}

/**
 * Example: Using API clients with React Query
 * 
 * Demonstrates integration with @tanstack/react-query for
 * better state management and caching
 * 
 * Note: In a real application, move these hooks to separate files
 * to comply with React Fast Refresh requirements.
 */

/* eslint-disable react-refresh/only-export-components */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Query hook for agent state
export function useAgentState() {
  return useQuery({
    queryKey: ['agentState'],
    queryFn: async () => {
      const response = await sophiaClient.getState()
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    refetchInterval: 5000, // Refetch every 5 seconds
  })
}

// Mutation hook for creating goals
export function useCreateGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (goalData: { goal: string; priority?: string }) => {
      const response = await sophiaClient.createGoal(goalData)
      if (!response.success) {
        throw new Error(response.error)
      }
      return response.data
    },
    onSuccess: () => {
      // Invalidate and refetch agent state after creating a goal
      queryClient.invalidateQueries({ queryKey: ['agentState'] })
    },
  })
}

// Example component using the hooks
export function AgentDashboard() {
  const { data: state, isLoading, error } = useAgentState()
  const createGoal = useCreateGoal()

  if (isLoading) return <div>Loading agent state...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div className="agent-dashboard">
      <h2>Agent State</h2>
      
      <section>
        <h3>Active Goals ({state?.state.goals.length || 0})</h3>
        <ul>
          {state?.state.goals.map((goal) => (
            <li key={goal.id}>
              {goal.description} - <em>{goal.status}</em>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Plans ({state?.state.plans.length || 0})</h3>
        <ul>
          {state?.state.plans.map((plan) => (
            <li key={plan.id}>
              Plan {plan.id} - {plan.steps.length} steps
            </li>
          ))}
        </ul>
      </section>

      <button
        onClick={() =>
          createGoal.mutate({
            goal: 'Navigate to kitchen',
            priority: 'high',
          })
        }
        disabled={createGoal.isPending}
      >
        {createGoal.isPending ? 'Creating...' : 'Create Test Goal'}
      </button>

      {createGoal.isError && (
        <div className="error">Error: {createGoal.error.message}</div>
      )}
    </div>
  )
}
