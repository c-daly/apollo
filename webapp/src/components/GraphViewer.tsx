import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import './GraphViewer.css';

cytoscape.use(dagre);

function GraphViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cy, setCy] = useState<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Sample graph data - in production, this would come from the Sophia API
    const graphData = {
      nodes: [
        { data: { id: 'goal1', label: 'Navigate to Kitchen', type: 'goal' } },
        { data: { id: 'plan1', label: 'Plan #1', type: 'plan' } },
        { data: { id: 'step1', label: 'Move forward', type: 'step' } },
        { data: { id: 'step2', label: 'Turn left', type: 'step' } },
        { data: { id: 'step3', label: 'Enter kitchen', type: 'step' } },
      ],
      edges: [
        { data: { source: 'goal1', target: 'plan1', type: 'generates' } },
        { data: { source: 'plan1', target: 'step1', type: 'contains' } },
        { data: { source: 'plan1', target: 'step2', type: 'contains' } },
        { data: { source: 'plan1', target: 'step3', type: 'contains' } },
        { data: { source: 'step1', target: 'step2', type: 'precedes' } },
        { data: { source: 'step2', target: 'step3', type: 'precedes' } },
      ],
    };

    const cyInstance = cytoscape({
      container: containerRef.current,
      elements: graphData,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#646cff',
            'label': 'data(label)',
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'width': '80px',
            'height': '80px',
            'font-size': '12px',
            'text-wrap': 'wrap',
            'text-max-width': '70px',
          },
        },
        {
          selector: 'node[type="goal"]',
          style: {
            'background-color': '#4ade80',
            'shape': 'round-rectangle',
          },
        },
        {
          selector: 'node[type="plan"]',
          style: {
            'background-color': '#60a5fa',
            'shape': 'round-rectangle',
          },
        },
        {
          selector: 'node[type="step"]',
          style: {
            'background-color': '#a78bfa',
            'shape': 'ellipse',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#888',
            'target-arrow-color': '#888',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
      ],
      layout: {
        name: 'dagre',
        // @ts-expect-error - dagre layout options are not fully typed
        rankDir: 'TB',
        nodeSep: 50,
        rankSep: 100,
      },
    });

    setCy(cyInstance);

    return () => {
      cyInstance.destroy();
    };
  }, []);

  const handleFitView = () => {
    cy?.fit(undefined, 50);
  };

  const handleZoomIn = () => {
    cy?.zoom((cy.zoom() ?? 1) * 1.2);
  };

  const handleZoomOut = () => {
    cy?.zoom((cy.zoom() ?? 1) * 0.8);
  };

  return (
    <div className="graph-viewer">
      <div className="graph-controls">
        <button onClick={handleFitView}>Fit View</button>
        <button onClick={handleZoomIn}>Zoom In</button>
        <button onClick={handleZoomOut}>Zoom Out</button>
      </div>
      <div className="graph-container" ref={containerRef}></div>
      <div className="graph-legend">
        <h3>Legend</h3>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#4ade80' }}></span>
          <span>Goal</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#60a5fa' }}></span>
          <span>Plan</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#a78bfa' }}></span>
          <span>Step</span>
        </div>
      </div>
    </div>
  );
}

export default GraphViewer;
