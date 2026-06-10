import { useState, useEffect } from 'react'
import { productApi } from '../api/client'
import dayjs from 'dayjs'

const BUSINESSES = ['전체', '다담', '훌라', '오아시스', '이 외']

export default function InOut() {
  const [records, setRecords] = useState([])
  const [business, setBusiness] = useState('전체')
  const [start, setStart] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [end, setEnd] = useState(dayjs().format('YYYY-MM-DD'))
  const [loading, setLoading] = useState(false)

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
      <h1 className="page-title">입출기록</h1>
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
    </div>
  )
}
