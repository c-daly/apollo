import { useState } from 'react'
import ChatPanel from '../components/ChatPanel'
import GraphViewer from '../components/GraphViewer'
import DiagnosticsPanel from '../components/DiagnosticsPanel'
import PersonaDiary from '../components/PersonaDiary'
import MediaUploadPanel from '../components/MediaUploadPanel'
import MediaLibraryPanel from '../components/MediaLibraryPanel'
import './Dashboard.css'

function Dashboard() {
  const [activeTab, setActiveTab] = useState<
    'chat' | 'graph' | 'diagnostics' | 'diary' | 'upload' | 'library'
  >('chat')

  return (
    <div className="dashboard">
      <div className="dashboard-tabs">
        <button
          className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          Chat
        </button>
        <button
          className={`tab-button ${activeTab === 'graph' ? 'active' : ''}`}
          onClick={() => setActiveTab('graph')}
        >
          Graph Viewer
        </button>
        <button
          className={`tab-button ${activeTab === 'diagnostics' ? 'active' : ''}`}
          onClick={() => setActiveTab('diagnostics')}
        >
          Diagnostics
        </button>
        <button
          className={`tab-button ${activeTab === 'diary' ? 'active' : ''}`}
          onClick={() => setActiveTab('diary')}
        >
          Persona Diary
        </button>
        <button
          className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          Upload Media
        </button>
        <button
          className={`tab-button ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          Media Library
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'graph' && <GraphViewer />}
        {activeTab === 'diagnostics' && <DiagnosticsPanel />}
        {activeTab === 'diary' && <PersonaDiary />}
        {activeTab === 'upload' && <MediaUploadPanel />}
        {activeTab === 'library' && <MediaLibraryPanel />}
      </div>
    </div>
  )
}

export default Dashboard
