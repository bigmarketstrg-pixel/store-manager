import { useState, useEffect } from 'react'
import { deliveryApi } from '../api/client'
import { useToast } from '../hooks/useToast.jsx'
import dayjs from 'dayjs'

const BUSINESSES = ['다담', '훌라', '오아시스', '이양서', '이 외']

export default function Shipping() {
  const [records, setRecords] = useState([])
  const [business, setBusiness] = useState('전체')
  const [startDate, setStartDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'))
  const [endDate, setEndDate] = useState(dayjs().endOf('month').format('YYYY-MM-DD'))
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const { toast, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const params = { start: startDate, end: endDate }
      if (business !== '전체') params.business = business
      const r = await deliveryApi.list(params)
      setRecords(r.data)
    } finally { setLoading(false) }
  }

  const loadWithRange = async (nextStart, nextEnd) => {
    setLoading(true)
    try {
      const params = { start: nextStart, end: nextEnd }
      if (business !== '전체') params.business = business
      const r = await deliveryApi.list(params)
      setRecords(r.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const deleteItem = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    try { await deliveryApi.delete(id); toast('삭제 완료'); load() }
    catch { toast('삭제 실패', 'error') }
  }

  const openEdit = (item = null) => { setEditItem(item); setShowModal(true) }

  const total = records.reduce((s, r) => s + r.shipping_fee, 0)
  const fmt = n => n?.toLocaleString() || '0'

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>택배비 관리</h1>
        <button className="btn btn-primary" onClick={() => openEdit(null)}>+ 등록</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: 150 }} />
          <span style={{ alignSelf: 'center', color: 'var(--muted)' }}>~</span>
          <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: 150 }} />
          <select className="input" value={business} onChange={e => setBusiness(e.target.value)} style={{ width: 120 }}>
            {['전체', ...BUSINESSES].map(b => <option key={b}>{b}</option>)}
          </select>
          <button className="btn btn-primary" onClick={load}>조회</button>
        </div>
      </div>

      {records.length > 0 && (
        <div style={{ marginBottom: 12, color: 'var(--muted)', fontSize: 13 }}>
          총 {records.length}건 · 합계 <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>₩{fmt(total)}</span>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>날짜</th><th>사업자</th><th>수취인</th><th className="num">배송료</th><th>메모</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>불러오는 중...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>택배비 기록이 없습니다</td></tr>
              ) : records.map(r => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12 }}>{r.delivery_date}</td>
                  <td><span className="badge badge-blue">{r.business}</span></td>
                  <td>{r.recipient}</td>
                  <td className="num fw-600">₩{fmt(r.shipping_fee)}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.memo}</td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>수정</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteItem(r.id)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <DeliveryModal
          item={editItem}
          onClose={() => setShowModal(false)}
          onSave={(savedDate) => {
            let nextStart = startDate
            let nextEnd = endDate
            if (savedDate) {
              if (savedDate < nextStart) nextStart = savedDate
              if (savedDate > nextEnd) nextEnd = savedDate
            }
            setStartDate(nextStart)
            setEndDate(nextEnd)
            setShowModal(false)
            loadWithRange(nextStart, nextEnd)
            toast(editItem ? '수정 완료' : '등록 완료')
          }}
          toast={toast}
        />
      )}
      <ToastContainer />
    </div>
  )
}

function DeliveryModal({ item, onClose, onSave, toast }) {
  const [form, setForm] = useState({
    delivery_date: item?.delivery_date || dayjs().format('YYYY-MM-DD'),
    business: item?.business || '다담',
    recipient: item?.recipient || '',
    shipping_fee: item?.shipping_fee || 0,
    memo: item?.memo || '',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    try {
      if (item) await deliveryApi.update(item.id, form)
      else await deliveryApi.create(form)
      onSave(form.delivery_date)
    } catch (err) { toast(err.response?.data?.detail || '저장 실패', 'error') }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{item ? '배송 수정' : '배송 등록'}</h2>
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field">
            <label>배송날짜</label>
            <input className="input" type="date" value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} />
          </div>
          <div className="field">
            <label>사업자</label>
            <select className="input" value={form.business} onChange={e => set('business', e.target.value)}>
              {BUSINESSES.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="field">
            <label>수취인</label>
            <input className="input" value={form.recipient} onChange={e => set('recipient', e.target.value)} />
          </div>
          <div className="field">
            <label>배송료</label>
            <input className="input" type="number" value={form.shipping_fee} onChange={e => set('shipping_fee', +e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>메모</label>
            <input className="input" value={form.memo} onChange={e => set('memo', e.target.value)} />
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
