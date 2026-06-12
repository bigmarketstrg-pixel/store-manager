import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { handoverApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast.jsx'

const BUSINESSES = ['다담', '훌라', '오아시스', '이양서', '이 외']

export default function Handover() {
  const { user } = useAuth()
  const { toast, ToastContainer } = useToast()
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    note_date: dayjs().format('YYYY-MM-DD'),
    business: BUSINESSES[0],
    memo: '',
  })

  const isAdmin = user?.role === 'admin'

  const load = async () => {
    setLoading(true)
    try {
      const r = await handoverApi.list()
      setNotes(r.data)
    } catch (err) {
      toast(err.response?.data?.detail || '인수인계 목록을 불러오지 못했습니다.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const save = async () => {
    if (!form.memo.trim()) {
      toast('인수인계 내용을 입력해주세요.', 'error')
      return
    }
    try {
      const r = await handoverApi.create({ ...form, memo: form.memo.trim() })
      setForm(prev => ({ ...prev, memo: '' }))
      setNotes(prev => [r.data, ...prev])
      toast('등록 완료')
    } catch (err) {
      const message = err.response?.status === 404
        ? '인수인계 저장 주소를 찾지 못했습니다. 백엔드 배포를 다시 확인해주세요.'
        : err.response?.data?.detail || '등록 실패'
      toast(message, 'error')
    }
  }

  const toggleDone = async (note) => {
    try {
      await handoverApi.update(note.id, { is_done: note.is_done ? 0 : 1 })
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, is_done: note.is_done ? 0 : 1 } : n))
    } catch {
      toast('완료 처리 실패', 'error')
    }
  }

  const deleteNote = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    try {
      await handoverApi.delete(id)
      setNotes(prev => prev.filter(n => n.id !== id))
      toast('삭제 완료')
    } catch (err) {
      toast(err.response?.data?.detail || '삭제 실패', 'error')
    }
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>인수인계</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div
          className="flex gap-8"
          style={{ alignItems: 'stretch', flexWrap: 'wrap' }}
        >
          <input
            className="input"
            type="date"
            value={form.note_date}
            onChange={e => set('note_date', e.target.value)}
            style={{ width: 150 }}
          />
          <select
            className="input"
            value={form.business}
            onChange={e => set('business', e.target.value)}
            style={{ width: 120 }}
          >
            {BUSINESSES.map(b => <option key={b}>{b}</option>)}
          </select>
          <input
            className="input"
            value={form.memo}
            onChange={e => set('memo', e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            placeholder="인수인계 내용을 입력하세요"
            style={{ flex: '1 1 360px', minWidth: 240 }}
          />
          <button className="btn btn-primary" onClick={save}>등록</button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>완료</th>
                <th style={{ width: 120 }}>날짜</th>
                <th style={{ width: 120 }}>사업자</th>
                <th>한줄메모</th>
                <th style={{ width: 120 }}>직원</th>
                {isAdmin && <th style={{ width: 80 }}></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>불러오는 중...</td></tr>
              ) : notes.length === 0 ? (
                <tr><td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>등록된 인수인계가 없습니다</td></tr>
              ) : notes.map(note => (
                <tr key={note.id} style={{ opacity: note.is_done ? .55 : 1 }}>
                  <td className="center">
                    <input
                      type="checkbox"
                      checked={!!note.is_done}
                      onChange={() => toggleDone(note)}
                      style={{ width: 18, height: 18 }}
                    />
                  </td>
                  <td style={{ fontSize: 12 }}>{note.note_date}</td>
                  <td><span className="badge badge-blue">{note.business}</span></td>
                  <td style={{ textDecoration: note.is_done ? 'line-through' : 'none' }}>{note.memo}</td>
                  <td style={{ color: 'var(--muted)' }}>{note.staff_name || '-'}</td>
                  {isAdmin && (
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteNote(note.id)}>삭제</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ToastContainer />
    </div>
  )
}
