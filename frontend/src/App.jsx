import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import POS from './pages/POS'
import Stock from './pages/Stock'
import InOut from './pages/InOut'
import SalesHistory from './pages/SalesHistory'
import Shipping from './pages/Shipping'
import Revenue from './pages/Revenue'
import Users from './pages/Users'
import Documents from './pages/Documents'
import Handover from './pages/Handover'

function PrivateRoute({ children, adminOnly }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)' }}>로딩 중...</div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/pos" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRedirect />} />
          <Route path="/pos" element={<PrivateRoute><POS /></PrivateRoute>} />
          <Route path="/sales" element={<PrivateRoute><SalesHistory /></PrivateRoute>} />
          <Route path="/stock" element={<PrivateRoute><Stock /></PrivateRoute>} />
          <Route path="/inout" element={<PrivateRoute><InOut /></PrivateRoute>} />
          <Route path="/quote" element={<PrivateRoute><Documents /></PrivateRoute>} />
          <Route path="/delivery-note" element={<Navigate to="/quote" replace />} />
          <Route path="/shipping" element={<PrivateRoute><Shipping /></PrivateRoute>} />
          <Route path="/revenue" element={<PrivateRoute><Revenue /></PrivateRoute>} />
          <Route path="/handover" element={<PrivateRoute><Handover /></PrivateRoute>} />
          <Route path="/users" element={<PrivateRoute adminOnly><Users /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

function LoginRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/pos" replace />
  return <Login />
}
