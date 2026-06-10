// ── 판매 내역 ──────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import { saleApi } from '../api/client'
import { useToast } from '../hooks/useToast'
import dayjs from 'dayjs'

const BUSINESSES = ['전체', '다담', '훌라', '오아시스', '이 외']

export function SalesHistory() {
  const [sales, setSales] = useState([])
  const [start, setStart] = useState(dayjs().subtract(7, 'day').format('YYYY-MM-DD'))
  const [end, setEnd] = useState(dayjs().format('YYYY-MM-DD'))
  const [business, setBusiness] = useState('전체')
  const [productName, setProductName] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const params = { start, end, limit: 500 }
      if (business !== '전체') params.business = business
      if (productName) params.product_name = productName
      const r = await saleApi.list(params)
      setSales(r.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const deleteSale = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    try {
      await saleApi.delete(id)
      toast('삭제 완료')
      load()
    } catch { toast('삭제 실패', 'error') }
  }

  const total = sales.reduce((s, r) => s + r.total, 0)
  const fmt = n => n?.toLocaleString() || '0'

  return (
    <div>
      <h1 className="page-title">판매 내역</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          <input type="date" className="input" value={start} onChange={e => setStart(e.target.value)} style={{ width: 150 }} />
          <span style={{ alignSelf: 'center', color: 'var(--muted)' }}>~</span>
          <input type="date" className="input" value={end} onChange={e => setEnd(e.target.value)} style={{ width: 150 }} />
          <select className="input" value={business} onChange={e => setBusiness(e.target.value)} style={{ width: 110 }}>
            {BUSINESSES.map(b => <option key={b}>{b}</option>)}
          </select>
          <input className="input" placeholder="상품명..." value={productName} onChange={e => setProductName(e.target.value)} style={{ width: 160 }} />
          <button className="btn btn-primary" onClick={load}>조회</button>
        </div>
      </div>
      {sales.length > 0 && (
        <div style={{ marginBottom: 12, color: 'var(--muted)', fontSize: 13 }}>
          총 {sales.length}건 · <span style={{ color: 'var(--green)', fontWeight: 700 }}>₩{fmt(total)}</span>
        </div>
      )}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>날짜</th><th>거래번호</th><th>상품명</th><th>사업자</th>
                <th>대분류</th><th>브랜드</th><th className="num">판매가</th>
                <th className="num">수량</th><th className="num">합계</th>
                <th>경로</th><th>결제</th><th>메모</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>불러오는 중...</td></tr>
              ) : sales.map(s => (
                <tr key={s.id}>
                  <td style={{ fontSize: 12 }}>{s.sale_date}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{s.transaction_no}</td>
                  <td style={{ fontWeight: 500 }}>{s.product_name}</td>
                  <td><span className="badge badge-blue">{s.business}</span></td>
                  <td style={{ fontSize: 12 }}>{s.category}</td>
                  <td style={{ fontSize: 12 }}>{s.brand}</td>
                  <td className="num">₩{fmt(s.sale_price)}</td>
                  <td className="num">{s.quantity}</td>
                  <td className="num fw-600" style={{ color: 'var(--accent)' }}>₩{fmt(s.total)}</td>
                  <td style={{ fontSize: 12 }}>{s.channel}</td>
                  <td style={{ fontSize: 12 }}>{s.payment}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{s.memo}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => deleteSale(s.id)}>삭제</button></td>
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
