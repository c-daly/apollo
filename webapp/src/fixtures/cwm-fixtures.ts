/**
 * Sample CWMState fixture data for development and testing
 *
 * This file contains deterministic mock data representing:
 * - Mixed CWM-A/G/E records in unified envelope format
 * - CWM-G frames with visual metadata
 * - JEPA model outputs
 */

import type {
  CWMStateStream,
  CWMEnvelope,
  CWMActionPayload,
  CWMGoalPayload,
  CWMEventPayload,
  JEPAOutput,
} from './cwm-types'

// Base timestamp for deterministic fixture data
const BASE_TIME = '2024-01-15T10:00:00.000Z'

// Helper to create timestamps relative to base time
const timestamp = (offsetSeconds: number): string => {
  const date = new Date(BASE_TIME)
  date.setSeconds(date.getSeconds() + offsetSeconds)
  return date.toISOString()
}

/**
 * Sample CWM-A records (Actions)
 */
const actionRecords: Array<CWMEnvelope<CWMActionPayload>> = [
  {
    record_type: 'CWM-A',
    record_id: 'cwm-a-001',
    timestamp: timestamp(0),
    sequence_number: 1,
    payload: {
      action_id: 'action_navigate_001',
      action_type: 'navigate',
      description: 'Navigate to kitchen',
      status: 'completed',
      parameters: {
        destination: 'kitchen',
        path_type: 'shortest',
        avoid_obstacles: true,
      },
      started_at: timestamp(0),
      completed_at: timestamp(45),
      result: {
        success: true,
        output: {
          distance_traveled: 12.5,
          time_elapsed: 45,
          final_position: { x: 10.2, y: 5.3, z: 0 },
        },
      },
      preconditions: ['location_known', 'path_clear'],
      effects: ['at_kitchen', 'path_traversed'],
    },
    metadata: {
      source: 'talos_executor',
      version: '1.0.0',
      confidence: 0.95,
    },
  },
  {
    record_type: 'CWM-A',
    record_id: 'cwm-a-002',
    timestamp: timestamp(50),
    sequence_number: 2,
    payload: {
      action_id: 'action_grasp_001',
      action_type: 'grasp',
      description: 'Pick up red block',
      status: 'executing',
      parameters: {
        object_id: 'block_red_01',
        grasp_type: 'top',
        force: 'medium',
      },
      started_at: timestamp(50),
      preconditions: ['object_visible', 'gripper_open', 'within_reach'],
      effects: ['holding_object', 'gripper_closed'],
    },
    metadata: {
      source: 'talos_executor',
      version: '1.0.0',
      confidence: 0.88,
    },
  },
  {
    record_type: 'CWM-A',
    record_id: 'cwm-a-003',
    timestamp: timestamp(120),
    sequence_number: 5,
    payload: {
      action_id: 'action_place_001',
      action_type: 'place',
      description: 'Place red block on table',
      status: 'failed',
      parameters: {
        object_id: 'block_red_01',
        target_location: 'table_01',
        placement_type: 'gentle',
      },
      started_at: timestamp(120),
      completed_at: timestamp(125),
      result: {
        success: false,
        error: 'Target location obstructed',
      },
      preconditions: ['holding_object', 'target_reachable'],
      effects: [],
    },
    metadata: {
      source: 'talos_executor',
      version: '1.0.0',
      confidence: 0.72,
    },
  },
]

/**
 * Sample CWM-G records (Goals with frames)
 */
const goalRecords: Array<CWMEnvelope<CWMGoalPayload>> = [
  {
    record_type: 'CWM-G',
    record_id: 'cwm-g-001',
    timestamp: timestamp(10),
    sequence_number: 3,
    payload: {
      goal_id: 'goal_organize_001',
      description: 'Organize objects on table',
      priority: 'high',
      status: 'active',
      progress: 35,
      created_at: timestamp(-300),
      updated_at: timestamp(10),
      frames: [
        {
          frame_id: 'frame_001',
          timestamp: timestamp(10),
          frame_type: 'observation',
          encoding: 'url',
          data: 'https://example.com/frames/scene_001.jpg',
          dimensions: {
            width: 640,
            height: 480,
            channels: 3,
          },
          metadata: {
            camera_id: 'cam_rgb_01',
            resolution: '640x480',
            format: 'jpeg',
            confidence: 0.92,
            annotations: [
              {
                label: 'red_block',
                bbox: [120, 200, 180, 260],
                confidence: 0.94,
              },
              {
                label: 'blue_block',
                bbox: [250, 180, 310, 240],
                confidence: 0.89,
              },
              {
                label: 'table',
                bbox: [50, 150, 590, 450],
                confidence: 0.97,
              },
            ],
          },
        },
        {
          frame_id: 'frame_002',
          timestamp: timestamp(11),
          frame_type: 'prediction',
          encoding: 'url',
          data: 'https://example.com/frames/predicted_001.jpg',
          dimensions: {
            width: 640,
            height: 480,
            channels: 3,
          },
          metadata: {
            camera_id: 'cam_rgb_01',
            resolution: '640x480',
            format: 'jpeg',
            confidence: 0.76,
            model: 'jepa_v2',
            prediction_horizon: 5,
          },
        },
      ],
      context: {
        location: 'kitchen',
        actors: ['agent_sophia'],
        related_goals: ['goal_cleanup_001'],
        scene_complexity: 'medium',
      },
    },
    metadata: {
      source: 'sophia_planner',
      version: '1.0.0',
      priority_score: 0.85,
    },
  },
  {
    record_type: 'CWM-G',
    record_id: 'cwm-g-002',
    timestamp: timestamp(60),
    sequence_number: 4,
    payload: {
      goal_id: 'goal_explore_001',
      description: 'Map unknown room layout',
      priority: 'medium',
      status: 'active',
      progress: 62,
      created_at: timestamp(-600),
      updated_at: timestamp(60),
      frames: [
        {
          frame_id: 'frame_003',
          timestamp: timestamp(60),
          frame_type: 'observation',
          encoding: 'url',
          data: 'https://example.com/frames/room_scan_001.jpg',
          dimensions: {
            width: 1280,
            height: 720,
            channels: 3,
          },
          metadata: {
            camera_id: 'cam_rgb_02',
            resolution: '1280x720',
            format: 'jpeg',
            confidence: 0.87,
            annotations: [
              {
                label: 'wall',
                bbox: [0, 0, 50, 720],
                confidence: 0.98,
              },
              {
                label: 'door',
                bbox: [520, 200, 680, 650],
                confidence: 0.91,
              },
            ],
            depth_available: true,
          },
        },
        {
          frame_id: 'frame_004',
          timestamp: timestamp(61),
          frame_type: 'simulation',
          encoding: 'url',
          data: 'https://example.com/frames/simulated_view_001.jpg',
          dimensions: {
            width: 1280,
            height: 720,
            channels: 3,
          },
          metadata: {
            camera_id: 'virtual_cam_01',
            resolution: '1280x720',
            format: 'jpeg',
            confidence: 0.71,
            simulation_type: 'future_view',
            time_offset: 10,
          },
        },
      ],
      context: {
        location: 'unknown_room_02',
        actors: ['agent_sophia'],
        exploration_coverage: 0.62,
      },
    },
    metadata: {
      source: 'sophia_planner',
      version: '1.0.0',
      priority_score: 0.68,
    },
  },
]

/**
 * Sample CWM-E records (Events)
 */
const eventRecords: Array<CWMEnvelope<CWMEventPayload>> = [
  {
    record_type: 'CWM-E',
    record_id: 'cwm-e-001',
    timestamp: timestamp(30),
    sequence_number: 6,
    payload: {
      event_id: 'event_obstacle_001',
      event_type: 'obstacle_detected',
      description: 'Unexpected obstacle in path',
      severity: 'warning',
      source: 'perception_system',
      detected_at: timestamp(30),
      properties: {
        obstacle_type: 'dynamic',
        distance: 2.3,
        velocity: 0.5,
        confidence: 0.89,
      },
      related_entities: [
        {
          entity_id: 'action_navigate_001',
          entity_type: 'action',
          relationship: 'interrupts',
        },
      ],
      context: {
        location: 'hallway',
        sensor_id: 'lidar_front',
      },
    },
    metadata: {
      source: 'talos_perception',
      version: '1.0.0',
      urgency: 0.75,
    },
  },
  {
    record_type: 'CWM-E',
    record_id: 'cwm-e-002',
    timestamp: timestamp(90),
    sequence_number: 7,
    payload: {
      event_id: 'event_state_change_001',
      event_type: 'state_transition',
      description: 'Object state changed',
      severity: 'info',
      source: 'world_model',
      detected_at: timestamp(90),
      properties: {
        object_id: 'door_kitchen',
        previous_state: 'closed',
        new_state: 'open',
        trigger: 'external_agent',
      },
      related_entities: [
        {
          entity_id: 'goal_organize_001',
          entity_type: 'goal',
          relationship: 'enables',
        },
      ],
      context: {
        location: 'kitchen_entrance',
      },
    },
    metadata: {
      source: 'sophia_reasoner',
      version: '1.0.0',
      impact_score: 0.65,
    },
  },
]

/**
 * Sample JEPA outputs
 */
const jepaOutputs: JEPAOutput[] = [
  {
    output_id: 'jepa_001',
    timestamp: timestamp(15),
    model_version: 'jepa_v2.1',
    input_context: {
      context_type: 'observation',
      context_id: 'frame_001',
      window_size: 5,
    },
    embeddings: {
      current_state: [0.23, -0.45, 0.67, 0.12, -0.89, 0.34, 0.56, -0.23],
      predicted_state: [0.28, -0.41, 0.71, 0.15, -0.85, 0.37, 0.59, -0.19],
      dimensions: 8,
    },
    predictions: [
      {
        horizon: 1,
        predicted_features: {
          object_positions: { red_block: [130, 210], blue_block: [250, 180] },
          gripper_state: 'open',
          scene_change_probability: 0.15,
        },
        confidence: 0.92,
        uncertainty: 0.08,
      },
      {
        horizon: 5,
        predicted_features: {
          object_positions: { red_block: [300, 220], blue_block: [250, 180] },
          gripper_state: 'closed',
          scene_change_probability: 0.67,
        },
        confidence: 0.74,
        uncertainty: 0.26,
      },
    ],
    metrics: {
      loss: 0.012,
      accuracy: 0.91,
      latency_ms: 23,
      inference_time: 18,
    },
  },
  {
    output_id: 'jepa_002',
    timestamp: timestamp(65),
    model_version: 'jepa_v2.1',
    input_context: {
      context_type: 'goal',
      context_id: 'goal_explore_001',
      window_size: 10,
    },
    embeddings: {
      current_state: [
        -0.12, 0.34, -0.56, 0.78, 0.23, -0.45, 0.67, 0.09, -0.34, 0.56,
      ],
      predicted_state: [
        -0.09, 0.37, -0.52, 0.81, 0.26, -0.42, 0.69, 0.11, -0.31, 0.58,
      ],
      dimensions: 10,
    },
    predictions: [
      {
        horizon: 3,
        predicted_features: {
          exploration_progress: 0.68,
          new_rooms_discovered: 1,
          map_completeness: 0.71,
        },
        confidence: 0.85,
        uncertainty: 0.15,
      },
      {
        horizon: 10,
        predicted_features: {
          exploration_progress: 0.89,
          new_rooms_discovered: 2,
          map_completeness: 0.92,
        },
        confidence: 0.67,
        uncertainty: 0.33,
      },
    ],
    metrics: {
      loss: 0.018,
      accuracy: 0.88,
      latency_ms: 31,
      inference_time: 25,
    },
  },
]

/**
 * Complete CWMState stream fixture
 */
export const mockCWMStateStream: CWMStateStream = {
  stream_id: 'stream_fixture_001',
  start_time: timestamp(-300),
  end_time: timestamp(125),
  records: [...actionRecords, ...goalRecords, ...eventRecords].sort(
    (a, b) => a.sequence_number - b.sequence_number
  ),
  jepa_outputs: jepaOutputs,
  metadata: {
    total_records: 7,
    record_counts: {
      actions: actionRecords.length,
      goals: goalRecords.length,
      events: eventRecords.length,
    },
    source: 'fixture_generator',
    description: 'Sample CWMState stream for development and testing',
    deterministic: true,
  },
}

/**
 * Additional fixture: Short stream for quick tests
 */
export const mockCWMStateStreamShort: CWMStateStream = {
  stream_id: 'stream_fixture_short',
  start_time: timestamp(0),
  end_time: timestamp(60),
  records: [actionRecords[0], goalRecords[0], eventRecords[0]],
  jepa_outputs: [jepaOutputs[0]],
  metadata: {
    total_records: 3,
    record_counts: {
      actions: 1,
      goals: 1,
      events: 1,
    },
    source: 'fixture_generator',
    description: 'Short CWMState stream for quick testing',
    deterministic: true,
  },
}

/**
 * Additional fixture: Failed actions stream
 */
export const mockCWMStateStreamFailures: CWMStateStream = {
  stream_id: 'stream_fixture_failures',
  start_time: timestamp(100),
  end_time: timestamp(200),
  records: [actionRecords[2]],
  jepa_outputs: [],
  metadata: {
    total_records: 1,
    record_counts: {
      actions: 1,
      goals: 0,
      events: 0,
    },
    source: 'fixture_generator',
    description: 'CWMState stream with failed actions for error testing',
    deterministic: true,
  },
}

/**
 * Export individual record collections for granular testing
 */
export const mockCWMActions = actionRecords
export const mockCWMGoals = goalRecords
export const mockCWMEvents = eventRecords
export const mockJEPAOutputs = jepaOutputs
