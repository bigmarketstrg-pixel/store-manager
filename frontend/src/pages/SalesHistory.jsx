import { useState, useEffect } from 'react'
import { saleApi } from '../api/client'
import { useToast } from '../hooks/useToast.jsx'
import dayjs from 'dayjs'
import { Pencil, Trash2 } from 'lucide-react'
import SalesEditModal from '../components/SalesEditModal'

const BUSINESSES = ['전체', '다담', '훌라', '오아시스', '이 외']

export default function SalesHistory() {
  const [sales, setSales] = useState([])
  const [start, setStart] = useState(dayjs().subtract(7, 'day').format('YYYY-MM-DD'))
  const [end, setEnd] = useState(dayjs().format('YYYY-MM-DD'))
  const [business, setBusiness] = useState('전체')
  const [productName, setProductName] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const { toast, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const params = { start, end, limit: 500 }
      if (business !== '전체') params.business = business
      if (productName) params.product_name = productName
      const r = await saleApi.list(params)
      setSales(r.data)
    } catch (err) {
      toast(err.response?.data?.detail || '판매 내역을 불러오지 못했습니다.', 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const deleteSale = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    try {
      await saleApi.delete(id)
      toast('삭제 완료')
      load()
    } catch (err) { toast(err.response?.data?.detail || '삭제 실패', 'error') }
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
                <th>대분류</th><th>브랜드</th><th className="num">원가단가</th><th className="num">판매가</th>
                <th className="num">수량</th><th className="num">합계</th><th className="num">순수익</th>
                <th>경로</th><th>결제</th><th>메모</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={15} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>불러오는 중...</td></tr>
              ) : sales.map(s => (
                <tr key={s.id} onDoubleClick={() => setSelected(s)}>
                  <td style={{ fontSize: 12 }}>{s.sale_date}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{s.transaction_no}</td>
                  <td style={{ fontWeight: 500 }}>{s.product_name}</td>
                  <td><span className="badge badge-blue">{s.business}</span></td>
                  <td style={{ fontSize: 12 }}>{s.category}</td>
                  <td style={{ fontSize: 12 }}>{s.brand}</td>
                  <td className="num">₩{fmt(s.cost_price)}</td>
                  <td className="num">₩{fmt(s.sale_price)}</td>
                  <td className="num">{s.quantity}</td>
                  <td className="num fw-600" style={{ color: 'var(--accent)' }}>₩{fmt(s.total)}</td>
                  <td className="num">₩{fmt(s.total - (s.cost_price || 0) * s.quantity)}</td>
                  <td style={{ fontSize: 12 }}>{s.channel}</td>
                  <td style={{ fontSize: 12 }}>{s.payment}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{s.memo}</td>
                  <td><div className="flex gap-8" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" title="판매 수정" aria-label="판매 수정" onClick={() => setSelected(s)}><Pencil size={16} /></button>
                    <button className="btn btn-danger btn-sm" title="판매 삭제" aria-label="판매 삭제" onClick={() => deleteSale(s.id)}><Trash2 size={16} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selected && <SalesEditModal sale={selected} onClose={() => setSelected(null)} onSave={() => {
        setSelected(null)
        toast('판매 내역과 출고기록 수정 완료')
        load()
      }} />}
      <ToastContainer />
    </div>
  )
}
