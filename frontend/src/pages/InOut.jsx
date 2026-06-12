import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { productApi } from '../api/client'
import { useToast } from '../hooks/useToast.jsx'

const BUSINESSES = ['전체', '다담', '훌라', '오아시스', '이 외']

export default function InOut() {
  const [records, setRecords] = useState([])
  const [business, setBusiness] = useState('전체')
  const [start, setStart] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [end, setEnd] = useState(dayjs().format('YYYY-MM-DD'))
  const [loading, setLoading] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const { toast, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const params = { start, end }
      if (business !== '전체') params.business = business
      const r = await productApi.history(params)
      setRecords(r.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>입출기록</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          <input type="date" className="input" value={start} onChange={e => setStart(e.target.value)} style={{ width: 150 }} />
          <span style={{ alignSelf: 'center', color: 'var(--muted)' }}>~</span>
          <input type="date" className="input" value={end} onChange={e => setEnd(e.target.value)} style={{ width: 150 }} />
          <select className="input" value={business} onChange={e => setBusiness(e.target.value)} style={{ width: 110 }}>
            {BUSINESSES.map(b => <option key={b}>{b}</option>)}
          </select>
          <button className="btn btn-primary" onClick={load}>조회</button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>날짜</th><th>거래번호</th><th>구분</th><th>상품명</th>
                <th>사업자</th><th>대분류</th><th>브랜드</th>
                <th className="num">수량</th><th className="num">단가</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>불러오는 중...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>입출기록이 없습니다</td></tr>
              ) : records.map(r => (
                <tr key={r.id} onDoubleClick={() => setSelectedRecord(r)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontSize: 12 }}>{r.record_date}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{r.transaction_no}</td>
                  <td>
                    <span className={`badge ${r.io_type === '입고' ? 'badge-green' : 'badge-red'}`}>{r.io_type}</span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{r.product_name}</td>
                  <td><span className="badge badge-blue">{r.business}</span></td>
                  <td style={{ fontSize: 12 }}>{r.category}</td>
                  <td style={{ fontSize: 12 }}>{r.brand}</td>
                  <td className="num">{r.quantity}</td>
                  <td className="num">₩{r.cost_price?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRecord && (
        <HistoryDetailModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onSave={(updated) => {
            setRecords(prev => prev.map(r => r.id === updated.id ? updated : r))
            setSelectedRecord(null)
            toast('입출기록 수정 완료')
          }}
          toast={toast}
        />
      )}
      <ToastContainer />
    </div>
  )
}

function HistoryDetailModal({ record, onClose, onSave, toast }) {
  const [form, setForm] = useState({
    record_date: record.record_date || '',
    transaction_no: record.transaction_no || '',
    io_type: record.io_type || '입고',
    product_name: record.product_name || '',
    business: record.business || '다담',
    category: record.category || '',
    subcategory: record.subcategory || '',
    brand: record.brand || '',
    quantity: record.quantity || 0,
    cost_price: record.cost_price || 0,
    memo: record.memo || '',
  })
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const save = async () => {
    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity) || 0,
        cost_price: Number(form.cost_price) || 0,
      }
      const r = await productApi.updateHistory(record.id, payload)
      onSave(r.data)
    } catch (err) {
      toast(err.response?.data?.detail || '입출기록 수정 실패', 'error')
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 760 }} onClick={e => e.stopPropagation()}>
        <h2>입출기록 상세</h2>
        <div className="grid-3" style={{ gap: 12 }}>
          <div className="field">
            <label>날짜</label>
            <input className="input" type="date" value={form.record_date} onChange={e => set('record_date', e.target.value)} />
          </div>
          <div className="field">
            <label>거래번호</label>
            <input className="input" value={form.transaction_no} onChange={e => set('transaction_no', e.target.value)} />
          </div>
          <div className="field">
            <label>구분</label>
            <select className="input" value={form.io_type} onChange={e => set('io_type', e.target.value)}>
              <option>입고</option>
              <option>출고</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>상품명</label>
            <input className="input" value={form.product_name} onChange={e => set('product_name', e.target.value)} />
          </div>
          <div className="field">
            <label>사업자</label>
            <select className="input" value={form.business} onChange={e => set('business', e.target.value)}>
              {BUSINESSES.filter(b => b !== '전체').map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="field">
            <label>대분류</label>
            <input className="input" value={form.category} onChange={e => set('category', e.target.value)} />
          </div>
          <div className="field">
            <label>중분류</label>
            <input className="input" value={form.subcategory} onChange={e => set('subcategory', e.target.value)} />
          </div>
          <div className="field">
            <label>브랜드</label>
            <input className="input" value={form.brand} onChange={e => set('brand', e.target.value)} />
          </div>
          <div className="field">
            <label>수량</label>
            <input className="input" type="number" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
          </div>
          <div className="field">
            <label>단가</label>
            <input className="input" type="number" value={form.cost_price} onChange={e => set('cost_price', e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>메모</label>
            <textarea className="input" value={form.memo} onChange={e => set('memo', e.target.value)} rows={4} />
          </div>
        </div>
        <div className="flex gap-8 mt-24">
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>닫기</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={save}>수정 저장</button>
        </div>
      </div>
    </div>
  )
}
