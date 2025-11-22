/**
 * Sample CWMState fixture data for development and testing
 *
 * This file contains deterministic mock data representing:
 * - Mixed CWM-A/G/E records in unified envelope format
 * - CWM-G frames with visual metadata
 * - JEPA model outputs
 */

import { CWMState, CWMAPayload, CWMGPayload, CWMEPayload } from './cwm-types';

export const mockCWMStream: CWMState<CWMAPayload | CWMGPayload | CWMEPayload>[] = [
  {
    state_id: 'state-001',
    model_type: 'cwm-a',
    timestamp: '2023-10-27T10:00:00Z',
    status: 'validated',
    data: {
      entities: [
        { id: 'obj-1', type: 'Cup', properties: { color: 'red' } },
        { id: 'loc-1', type: 'Table', properties: {} }
      ],
      relations: [
        { source: 'obj-1', target: 'loc-1', type: 'on' }
      ]
    }
  },
  {
    state_id: 'state-002',
    model_type: 'cwm-g',
    timestamp: '2023-10-27T10:00:05Z',
    status: 'observed',
    data: {
      modality: 'visual',
      raw_data_ref: 'img-buffer-x99',
      interpretation: 'Red object detected on flat surface'
    } as CWMGPayload
  },
  {
    state_id: 'state-003',
    model_type: 'cwm-e',
    timestamp: '2023-10-27T10:00:10Z',
    status: 'hypothetical',
    data: {
      valence: 0.8,
      arousal: 0.2,
      reflection: 'The environment feels stable and predictable.'
    } as CWMEPayload
  }
];
