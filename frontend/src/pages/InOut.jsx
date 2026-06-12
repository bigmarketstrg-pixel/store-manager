import { useState, useEffect } from 'react'
import { productApi } from '../api/client'
import { useToast } from '../hooks/useToast.jsx'
import dayjs from 'dayjs'

const BUSINESSES = ['전체', '다담', '훌라', '오아시스', '이 외']
const emptyRow = () => ({ brand: '', product_name: '', quantity: 1, cost_price: 0 })

export default function InOut() {
  const [records, setRecords] = useState([])
  const [business, setBusiness] = useState('전체')
  const [start, setStart] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [end, setEnd] = useState(dayjs().format('YYYY-MM-DD'))
  const [loading, setLoading] = useState(false)
  const [showInbound, setShowInbound] = useState(false)
  const { toast, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const params = { start, end }
      if (business !== '전체') params.business = business
      const r = await productApi.history(params)
      setRecords(r.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>입출기록</h1>
        <button className="btn btn-primary" onClick={() => setShowInbound(true)}>+ 입고 등록</button>
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
                <th className="num">수량</th><th className="num">단가</th><th>메모</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>불러오는 중...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>입출기록이 없습니다</td></tr>
              ) : records.map(r => (
                <tr key={r.id}>
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
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.memo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showInbound && (
        <BulkInboundModal
          onClose={() => setShowInbound(false)}
          onSave={() => { setShowInbound(false); load(); toast('입고 등록 완료') }}
          toast={toast}
        />
      )}
      <ToastContainer />
    </div>
  )
}

function BulkInboundModal({ onClose, onSave, toast }) {
  const [recordDate, setRecordDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [supplierName, setSupplierName] = useState('')
  const [memo, setMemo] = useState('')
  const [rows, setRows] = useState([emptyRow()])

  const setRow = (index, key, value) => {
    setRows(prev => prev.map((row, i) => i === index ? { ...row, [key]: value } : row))
  }
  const addRow = () => setRows(prev => [...prev, emptyRow()])
  const removeRow = (index) => setRows(prev => prev.filter((_, i) => i !== index))
  const amount = row => (Number(row.quantity) || 0) * (Number(row.cost_price) || 0)
  const totalAmount = rows.reduce((sum, row) => sum + amount(row), 0)
  const fmt = n => Math.round(Number(n) || 0).toLocaleString()

  const save = async () => {
    const items = rows
      .map(row => ({
        brand: row.brand.trim(),
        product_name: row.product_name.trim(),
        quantity: Number(row.quantity) || 0,
        cost_price: Number(row.cost_price) || 0,
        amount: amount(row),
      }))
      .filter(row => row.product_name && row.quantity > 0)

    if (!supplierName.trim()) { toast('상호명을 입력해주세요.', 'error'); return }
    if (items.length === 0) { toast('입고 품목을 하나 이상 입력해주세요.', 'error'); return }

    try {
      await productApi.inboundBulk({
        record_date: recordDate,
        supplier_name: supplierName.trim(),
        total_amount: totalAmount,
        memo,
        items,
      })
      onSave()
    } catch (err) {
      toast(err.response?.data?.detail || '입고 등록 실패', 'error')
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 900 }} onClick={e => e.stopPropagation()}>
        <h2>입고 등록</h2>
        <div className="grid-2" style={{ gap: 12, marginBottom: 16 }}>
          <div className="field">
            <label>날짜</label>
            <input className="input" type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)} />
          </div>
          <div className="field">
            <label>상호명</label>
            <input className="input" value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="거래처 상호명" />
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>메모</label>
            <input className="input" value={memo} onChange={e => setMemo(e.target.value)} />
          </div>
        </div>

        <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>브랜드</th>
                <th>품명</th>
                <th className="num">수량</th>
                <th className="num">단가</th>
                <th className="num">금액</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td><input className="input" value={row.brand} onChange={e => setRow(i, 'brand', e.target.value)} placeholder="브랜드" /></td>
                  <td><input className="input" value={row.product_name} onChange={e => setRow(i, 'product_name', e.target.value)} placeholder="품명" /></td>
                  <td><input className="input" type="number" min={1} value={row.quantity} onChange={e => setRow(i, 'quantity', e.target.value)} style={{ textAlign: 'right' }} /></td>
                  <td><input className="input" type="number" min={0} value={row.cost_price} onChange={e => setRow(i, 'cost_price', e.target.value)} style={{ textAlign: 'right' }} /></td>
                  <td className="num fw-600">₩{fmt(amount(row))}</td>
                  <td>
                    {rows.length > 1 && <button className="btn btn-ghost btn-sm" onClick={() => removeRow(i)}>삭제</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex-between" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={addRow}>+ 행 추가</button>
          <div>
            <span className="text-muted" style={{ marginRight: 8 }}>총액</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>₩{fmt(totalAmount)}</span>
          </div>
        </div>

        <div className="flex gap-8 mt-24">
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>취소</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={save}>입고 등록</button>
        </div>
      </div>
    </div>
  )
}
