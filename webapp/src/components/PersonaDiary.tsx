import './PersonaDiary.css';

interface DiaryEntry {
  id: string;
  timestamp: Date;
  type: 'belief' | 'decision' | 'observation';
  content: string;
}

function PersonaDiary() {
  // Sample diary entries
  const entries: DiaryEntry[] = [
    {
      id: '1',
      timestamp: new Date(),
      type: 'observation',
      content: 'Detected user request to navigate to kitchen. Current location: living room.',
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 60000),
      type: 'decision',
      content: 'Generated plan with 3 steps: move forward, turn left, enter kitchen. Estimated confidence: 95%.',
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 120000),
      type: 'belief',
      content: 'Updated spatial model: kitchen is located to the left of current position, approximately 5 meters away.',
    },
    {
      id: '4',
      timestamp: new Date(Date.now() - 180000),
      type: 'observation',
      content: 'Door sensor indicates kitchen door is open. Safe to proceed with navigation.',
    },
    {
      id: '5',
      timestamp: new Date(Date.now() - 240000),
      type: 'decision',
      content: 'Executed step 1: moved forward 3 meters. Updated position in spatial graph.',
    },
  ];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'belief':
        return '💭';
      case 'decision':
        return '⚡';
      case 'observation':
        return '👁️';
      default:
        return '📝';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'belief':
        return '#60a5fa';
      case 'decision':
        return '#4ade80';
      case 'observation':
        return '#fbbf24';
      default:
        return '#888';
    }
  };

  return (
    <div className="persona-diary">
      <div className="diary-header">
        <h2>Persona Diary</h2>
        <p className="diary-subtitle">
          Agent's internal reasoning and decision-making process
        </p>
      </div>

      <div className="diary-timeline">
        {entries.map(entry => (
          <div key={entry.id} className="diary-entry">
            <div className="entry-marker" style={{ backgroundColor: getTypeColor(entry.type) }}>
              <span className="entry-icon">{getTypeIcon(entry.type)}</span>
            </div>
            <div className="entry-content">
              <div className="entry-header">
                <span className="entry-type" style={{ color: getTypeColor(entry.type) }}>
                  {entry.type.charAt(0).toUpperCase() + entry.type.slice(1)}
                </span>
                <span className="entry-timestamp">
                  {entry.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="entry-text">{entry.content}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="diary-legend">
        <h3>Entry Types</h3>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-icon" style={{ backgroundColor: '#60a5fa' }}>💭</span>
            <span>Belief Update</span>
          </div>
          <div className="legend-item">
            <span className="legend-icon" style={{ backgroundColor: '#4ade80' }}>⚡</span>
            <span>Decision</span>
          </div>
          <div className="legend-item">
            <span className="legend-icon" style={{ backgroundColor: '#fbbf24' }}>👁️</span>
            <span>Observation</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PersonaDiary;
