import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/pos')
    } catch (err) {
      setError(err.response?.data?.detail || '로그인 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={submit}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎸</div>
        <h1>오아시스 뮤직 매장관리 v01</h1>
        <p>매장 관리 시스템에 로그인하세요. 첫 로그인시 로드가 느릴 수 있습니다.</p>
        {error && (
          <div style={{ background: 'rgba(248,113,113,.15)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--red)', fontSize: 13 }}>
            {error}
          </div>
        )}
        <div className="field" style={{ marginBottom: 12, textAlign: 'left' }}>
          <label>아이디</label>
          <input className="input input-lg" value={username} onChange={e => setUsername(e.target.value)} placeholder="아이디 입력" autoFocus />
        </div>
        <div className="field" style={{ marginBottom: 20, textAlign: 'left' }}>
          <label>비밀번호</label>
          <input className="input input-lg" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호 입력" />
        </div>
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  )
}
