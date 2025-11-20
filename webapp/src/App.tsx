import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Dashboard from './pages/Dashboard'
import './App.css'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="app">
          <nav className="app-nav">
            <div className="nav-brand">
              <h1>Apollo</h1>
              <span className="nav-subtitle">LOGOS Command Interface</span>
            </div>
            <div className="nav-links">
              <Link to="/" className="nav-link">
                Dashboard
              </Link>
            </div>
          </nav>
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Dashboard />} />
            </Routes>
          </main>
        </div>
      </Router>
    </QueryClientProvider>
  )
}

export default App
