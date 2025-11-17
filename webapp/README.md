# Apollo Web Dashboard

This directory will contain the React-based web dashboard for Apollo.

## Status

⏳ **To be implemented in Epoch 3 (Task C4)**

The web dashboard will provide:
- Real-time visualization of agent state
- HCG graph visualization
- Plan monitoring and execution tracking
- Interactive command interface
- WebSocket-based real-time updates

## Planned Technology Stack

- **React** 18+ with TypeScript
- **Vite** for build tooling
- **React Router** for navigation
- **TanStack Query** for data fetching
- **D3.js** or **Cytoscape.js** for graph visualization
- **Tailwind CSS** for styling
- **WebSocket** for real-time updates

## Development Setup (Future)

```bash
cd webapp
npm install
npm run dev
```

## Structure (Planned)

```
webapp/
├── src/
│   ├── components/     # React components
│   ├── pages/         # Page components
│   ├── hooks/         # Custom React hooks
│   ├── services/      # API services
│   ├── utils/         # Utility functions
│   └── App.tsx        # Main app component
├── public/            # Static assets
└── package.json       # Node.js configuration
```

## Integration Points

The web dashboard will integrate with:
- **Sophia API**: For sending commands and receiving state updates
- **Neo4j**: For querying and visualizing the HCG
- **WebSocket**: For real-time state updates
