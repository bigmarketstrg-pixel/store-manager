import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../api/client'
import { useToast } from '../hooks/useToast.jsx'

const NAV = [
  { section: '판매' },
  { to: '/pos', icon: '🛒', label: '판매 (POS)' },
  { to: '/sales', icon: '📋', label: '판매 내역' },
  { section: '재고' },
  { to: '/stock', icon: '📦', label: '재고 관리' },
  { to: '/inout', icon: '🔄', label: '입출기록' },
  { section: '문서' },
  { to: '/quote', icon: '📄', label: '견적서 및 납품서 발행' },
  { section: '정산' },
  { to: '/shipping', icon: '🚚', label: '택배비 관리' },
  { to: '/revenue', icon: '📊', label: '매출 집계' },
  { section: '관리' },
  { to: '/users', icon: '👥', label: '직원 관리', adminOnly: true },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const { toast, ToastContainer } = useToast()

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
            onClick={() => setShowPasswordModal(true)}
            style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }}
          >
            비밀번호 변경
          </button>
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
      {showPasswordModal && (
        <PasswordModal
          onClose={() => setShowPasswordModal(false)}
          onSave={() => { setShowPasswordModal(false); toast('비밀번호가 변경되었습니다.') }}
          toast={toast}
        />
      )}
      <ToastContainer />
    </div>
  )
}

function PasswordModal({ onClose, onSave, toast }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.current_password || !form.new_password) { toast('비밀번호를 입력해주세요.', 'error'); return }
    if (form.new_password !== form.confirm_password) { toast('새 비밀번호가 서로 다릅니다.', 'error'); return }
    try {
      await authApi.changePassword({
        current_password: form.current_password,
        new_password: form.new_password,
      })
      onSave()
    } catch (err) {
      toast(err.response?.data?.detail || '비밀번호 변경 실패', 'error')
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <h2>비밀번호 변경</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label>현재 비밀번호</label>
            <input className="input" type="password" value={form.current_password} onChange={e => set('current_password', e.target.value)} />
          </div>
          <div className="field">
            <label>새 비밀번호</label>
            <input className="input" type="password" value={form.new_password} onChange={e => set('new_password', e.target.value)} />
          </div>
          <div className="field">
            <label>새 비밀번호 확인</label>
            <input className="input" type="password" value={form.confirm_password} onChange={e => set('confirm_password', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-8 mt-24">
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>취소</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={save}>변경</button>
        </div>
      </div>
    </div>
  )
}
