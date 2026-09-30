import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'

const Login = lazy(() => import('./pages/Login'))
const POS = lazy(() => import('./pages/POS'))
const Stock = lazy(() => import('./pages/Stock'))
const Inbound = lazy(() => import('./pages/Inbound'))
const Outbound = lazy(() => import('./pages/Outbound'))
const InOut = lazy(() => import('./pages/InOut'))
const SalesHistory = lazy(() => import('./pages/SalesHistory'))
const Wholesale = lazy(() => import('./pages/Wholesale'))
const Shipping = lazy(() => import('./pages/Shipping'))
const Revenue = lazy(() => import('./pages/Revenue'))
const Users = lazy(() => import('./pages/Users'))
const Documents = lazy(() => import('./pages/Documents'))
const Handover = lazy(() => import('./pages/Handover'))

const pageFallback = <div style={{ padding: 24, color: 'var(--muted)' }}>로딩 중...</div>

function PrivateRoute({ children, adminOnly }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)' }}>로딩 중...</div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/pos" replace />
  return <Layout><Suspense fallback={pageFallback}>{children}</Suspense></Layout>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRedirect />} />
          <Route path="/pos" element={<PrivateRoute><POS /></PrivateRoute>} />
          <Route path="/sales" element={<PrivateRoute><SalesHistory /></PrivateRoute>} />
          <Route path="/wholesale" element={<PrivateRoute><Wholesale /></PrivateRoute>} />
          <Route path="/stock" element={<PrivateRoute><Stock /></PrivateRoute>} />
          <Route path="/inbound" element={<PrivateRoute><Inbound /></PrivateRoute>} />
          <Route path="/outbound" element={<PrivateRoute><Outbound /></PrivateRoute>} />
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
  return <Suspense fallback={pageFallback}><Login /></Suspense>
}
