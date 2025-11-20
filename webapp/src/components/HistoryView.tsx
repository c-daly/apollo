/**
 * History view component for plan and state history
 */

import React from 'react';
import type { PlanHistory, StateHistory } from '../types/hcg';

export interface HistoryViewProps {
  planHistory?: PlanHistory[];
  stateHistory?: StateHistory[];
  loading?: boolean;
  error?: Error | null;
}

/**
 * History View Component
 * 
 * Displays historical records of plans and state changes.
 * Shows timeline of agent activities and state transitions.
 */
export function HistoryView({
  planHistory = [],
  stateHistory = [],
  loading = false,
  error = null,
}: HistoryViewProps): React.JSX.Element {
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>Error: {error.message}</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Plan History Section */}
      <section style={styles.section}>
        <h2 style={styles.heading}>Plan History</h2>
        {planHistory.length === 0 ? (
          <p style={styles.empty}>No plan history available</p>
        ) : (
          <div style={styles.timeline}>
            {planHistory.map((plan) => (
              <div key={plan.id} style={styles.timelineItem}>
                <div style={styles.timelineMarker} />
                <div style={styles.timelineContent}>
                  <div style={styles.timelineHeader}>
                    <strong>{plan.id}</strong>
                    <span
                      style={{
                        ...styles.badge,
                        backgroundColor: getStatusColor(plan.status),
                      }}
                    >
                      {plan.status}
                    </span>
                  </div>
                  <div style={styles.timelineMeta}>
                    Goal: {plan.goal_id}
                  </div>
                  <div style={styles.timelineMeta}>
                    Created: {new Date(plan.created_at).toLocaleString()}
                  </div>
                  {plan.completed_at && (
                    <div style={styles.timelineMeta}>
                      Completed: {new Date(plan.completed_at).toLocaleString()}
                    </div>
                  )}
                  <div style={styles.timelineMeta}>
                    Steps: {plan.steps.length}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* State History Section */}
      <section style={styles.section}>
        <h2 style={styles.heading}>State History</h2>
        {stateHistory.length === 0 ? (
          <p style={styles.empty}>No state history available</p>
        ) : (
          <div style={styles.timeline}>
            {stateHistory.map((history) => (
              <div key={history.id} style={styles.timelineItem}>
                <div style={styles.timelineMarker} />
                <div style={styles.timelineContent}>
                  <div style={styles.timelineHeader}>
                    <strong>State: {history.state_id}</strong>
                  </div>
                  <div style={styles.timelineMeta}>
                    {new Date(history.timestamp).toLocaleString()}
                  </div>
                  {history.trigger && (
                    <div style={styles.timelineMeta}>
                      Trigger: {history.trigger}
                    </div>
                  )}
                  <div style={styles.changesBox}>
                    <strong>Changes:</strong>
                    <pre style={styles.changesContent}>
                      {JSON.stringify(history.changes, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return '#50C878';
    case 'executing':
      return '#4A90E2';
    case 'failed':
      return '#FF6B6B';
    case 'pending':
      return '#FFA500';
    default:
      return '#999';
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  error: {
    textAlign: 'center',
    padding: '40px',
    color: '#FF6B6B',
  },
  section: {
    marginBottom: '40px',
  },
  heading: {
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '16px',
    color: '#333',
  },
  empty: {
    color: '#999',
    fontStyle: 'italic',
  },
  timeline: {
    position: 'relative',
    paddingLeft: '30px',
  },
  timelineItem: {
    position: 'relative',
    paddingBottom: '30px',
  },
  timelineMarker: {
    position: 'absolute',
    left: '-30px',
    top: '5px',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: '#4A90E2',
    border: '2px solid #fff',
    boxShadow: '0 0 0 2px #4A90E2',
  },
  timelineContent: {
    backgroundColor: '#fff',
    padding: '16px',
    borderRadius: '4px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  timelineHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  timelineMeta: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '4px',
  },
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  changesBox: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
  },
  changesContent: {
    margin: '8px 0 0 0',
    fontSize: '12px',
    overflow: 'auto',
    maxHeight: '200px',
  },
};
