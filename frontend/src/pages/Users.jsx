import { useState, useEffect } from 'react'
import { authApi } from '../api/client'
import { useToast } from '../hooks/useToast.jsx'

export default function Users() {
  const [users, setUsers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const { toast, ToastContainer } = useToast()

  const load = async () => {
    try { const r = await authApi.getUsers(); setUsers(r.data) }
    catch { toast('불러오기 실패', 'error') }
  }

  useEffect(() => { load() }, [])

  const deleteUser = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    try { await authApi.deleteUser(id); toast('삭제 완료'); load() }
    catch { toast('삭제 실패', 'error') }
  }

  const toggleActive = async (user) => {
    try {
      await authApi.updateUser(user.id, { is_active: user.is_active ? 0 : 1 })
      toast(user.is_active ? '비활성화 완료' : '활성화 완료')
      load()
    } catch { toast('변경 실패', 'error') }
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>직원 관리</h1>
        <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowModal(true) }}>+ 직원 추가</button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>이름</th><th>아이디</th><th>권한</th><th>상태</th><th>액션</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td style={{ color: 'var(--muted)' }}>{u.username}</td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-purple' : 'badge-blue'}`}>
                      {u.role === 'admin' ? '관리자' : '직원'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>
                      {u.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditItem(u); setShowModal(true) }}>수정</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}>
                        {u.is_active ? '비활성화' : '활성화'}
                      </button>
                      {u.role !== 'admin' && (
                        <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u.id)}>삭제</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <UserModal
          item={editItem}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); load(); toast(editItem ? '수정 완료' : '직원 추가 완료') }}
          toast={toast}
        />
      )}
      <ToastContainer />
    </div>
  )
}

function UserModal({ item, onClose, onSave, toast }) {
  const [form, setForm] = useState({
    username: item?.username || '',
    name: item?.name || '',
    password: '',
    role: item?.role || 'staff',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!item && !form.password) { toast('비밀번호를 입력하세요', 'error'); return }
    try {
      if (item) {
        const patch = { name: form.name, role: form.role }
        if (form.password) patch.password = form.password
        await authApi.updateUser(item.id, patch)
      } else {
        await authApi.createUser(form)
      }
      onSave()
    } catch (err) { toast(err.response?.data?.detail || '저장 실패', 'error') }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{item ? '직원 수정' : '직원 추가'}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label>이름</label>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="홍길동" />
          </div>
          <div className="field">
            <label>아이디</label>
            <input className="input" value={form.username} onChange={e => set('username', e.target.value)} disabled={!!item} placeholder="로그인 아이디" />
          </div>
          <div className="field">
            <label>{item ? '새 비밀번호 (변경 시에만 입력)' : '비밀번호'}</label>
            <input className="input" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="비밀번호 입력" />
          </div>
          <div className="field">
            <label>권한</label>
            <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="staff">직원</option>
              <option value="admin">관리자</option>
            </select>
          </div>
        </div>
        <div className="flex gap-8 mt-24">
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>취소</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={save}>저장</button>
        </div>
      </div>
    </div>
  )
}
