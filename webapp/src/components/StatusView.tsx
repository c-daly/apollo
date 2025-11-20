/**
 * Status view component for HCG state and process monitoring
 */

import React from 'react';
import type { State, Process } from '../types/hcg';

export interface StatusViewProps {
  states?: State[];
  processes?: Process[];
  loading?: boolean;
  error?: Error | null;
}

/**
 * Status View Component
 * 
 * Displays current states and processes in a tabular format.
 * Shows real-time status of agent state and running processes.
 */
export function StatusView({
  states = [],
  processes = [],
  loading = false,
  error = null,
}: StatusViewProps): React.JSX.Element {
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading status...</div>
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
      {/* States Section */}
      <section style={styles.section}>
        <h2 style={styles.heading}>Current States</h2>
        {states.length === 0 ? (
          <p style={styles.empty}>No states available</p>
        ) : (
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Description</th>
                  <th style={styles.th}>Timestamp</th>
                  <th style={styles.th}>Variables</th>
                </tr>
              </thead>
              <tbody>
                {states.map((state) => (
                  <tr key={state.id} style={styles.tr}>
                    <td style={styles.td}>{state.id}</td>
                    <td style={styles.td}>{state.description}</td>
                    <td style={styles.td}>
                      {new Date(state.timestamp).toLocaleString()}
                    </td>
                    <td style={styles.td}>
                      {Object.keys(state.variables).length} variables
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Processes Section */}
      <section style={styles.section}>
        <h2 style={styles.heading}>Active Processes</h2>
        {processes.length === 0 ? (
          <p style={styles.empty}>No processes available</p>
        ) : (
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Created</th>
                  <th style={styles.th}>I/O</th>
                </tr>
              </thead>
              <tbody>
                {processes.map((process) => (
                  <tr key={process.id} style={styles.tr}>
                    <td style={styles.td}>{process.id}</td>
                    <td style={styles.td}>{process.name}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.badge,
                          backgroundColor: getStatusColor(process.status),
                        }}
                      >
                        {process.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {new Date(process.created_at).toLocaleString()}
                    </td>
                    <td style={styles.td}>
                      {process.inputs.length} → {process.outputs.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    case 'running':
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
  tableContainer: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: '#fff',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  th: {
    padding: '12px',
    textAlign: 'left',
    backgroundColor: '#f5f5f5',
    fontWeight: 'bold',
    borderBottom: '2px solid #ddd',
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #eee',
  },
  tr: {
    transition: 'background-color 0.2s',
  },
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 'bold',
  },
};
