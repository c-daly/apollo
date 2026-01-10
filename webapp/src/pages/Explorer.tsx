/**
 * Explorer Page - HCG Graph Visualization
 */

import { HCGExplorer } from '../components/hcg-explorer'

export default function Explorer() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <HCGExplorer
        defaultViewMode="3d"
        refreshInterval={15000}
      />
    </div>
  )
}
