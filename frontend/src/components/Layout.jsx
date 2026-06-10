import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { section: '판매' },
  { to: '/pos', icon: '🛒', label: '판매 (POS)' },
  { to: '/sales', icon: '📋', label: '판매 내역' },
  { section: '재고' },
  { to: '/stock', icon: '📦', label: '재고 관리' },
  { to: '/inout', icon: '🔄', label: '입출기록' },
  { section: '문서' },
  { to: '/quote', icon: '📄', label: '문서 관리' },
  { section: '정산' },
  { to: '/shipping', icon: '🚚', label: '택배비 관리' },
  { to: '/revenue', icon: '📊', label: '매출 집계' },
  { section: '관리' },
  { to: '/users', icon: '👥', label: '직원 관리', adminOnly: true },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>🎸 악기점 관리</h1>
          <span>매장 관리 시스템</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            if (item.section) return (
              <div key={i} className="nav-section">{item.section}</div>
            )
            if (item.adminOnly && user?.role !== 'admin') return null
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <span className="icon">{item.icon}</span>
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="sidebar-footer">
          <strong>{user?.name}</strong>
          {user?.role === 'admin' ? '관리자' : '직원'}
          <br />
          <button
            onClick={handleLogout}
            style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}
          >
            로그아웃
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
