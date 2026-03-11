import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/common/Layout'
import DashboardPage from './pages/DashboardPage'
import InstancesPage from './pages/InstancesPage'
import InstanceDetailPage from './pages/InstanceDetailPage'
import SystemPage from './pages/SystemPage'
import { useSocketStore } from './store/socketStore'

export default function App() {
  const connect = useSocketStore((s) => s.connect)

  useEffect(() => {
    connect()
  }, [connect])

  return (
    <Layout>
      <Routes>
        <Route path="/"            element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"   element={<DashboardPage />} />
        <Route path="/instances"   element={<InstancesPage />} />
        <Route path="/instances/:id" element={<InstanceDetailPage />} />
        <Route path="/system"      element={<SystemPage />} />
      </Routes>
    </Layout>
  )
}
