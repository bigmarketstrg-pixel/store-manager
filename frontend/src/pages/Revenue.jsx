import { useState, useEffect } from 'react'
import { saleApi } from '../api/client'
import dayjs from 'dayjs'

const GROUP_OPTIONS = [
  { value: 'day', label: '일별' },
  { value: 'month', label: '월별' },
  { value: 'business', label: '사업자별' },
  { value: 'product', label: '상품별' },
  { value: 'channel', label: '판매경로별' },
  { value: 'payment', label: '결제방식별' },
]
const BUSINESSES = ['전체', '다담', '훌라', '오아시스', '이 외']

export default function Revenue() {
  const [data, setData] = useState([])
  const [groupBy, setGroupBy] = useState('month')
  const [start, setStart] = useState(dayjs().startOf('month').format('YYYY-MM-DD'))
  const [end, setEnd] = useState(dayjs().format('YYYY-MM-DD'))
  const [business, setBusiness] = useState('전체')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params = { group_by: groupBy, start, end }
      if (business !== '전체') params.business = business
      const r = await saleApi.summary(params)
      setData(r.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [groupBy])

  const totalRevenue = data.reduce((s, r) => s + r.total, 0)
  const totalCount = data.reduce((s, r) => s + r.count, 0)
  const maxTotal = Math.max(...data.map(r => r.total), 1)
  const fmt = n => n?.toLocaleString() || '0'

  return (
    <div>
      <h1 className="page-title">매출 집계</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          <select className="input" value={groupBy} onChange={e => setGroupBy(e.target.value)} style={{ width: 130 }}>
            {GROUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input type="date" className="input" value={start} onChange={e => setStart(e.target.value)} style={{ width: 150 }} />
          <span style={{ alignSelf: 'center', color: 'var(--muted)' }}>~</span>
          <input type="date" className="input" value={end} onChange={e => setEnd(e.target.value)} style={{ width: 150 }} />
          <select className="input" value={business} onChange={e => setBusiness(e.target.value)} style={{ width: 110 }}>
            {BUSINESSES.map(b => <option key={b}>{b}</option>)}
          </select>
          <button className="btn btn-primary" onClick={load}>조회</button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>총 매출</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>₩{fmt(totalRevenue)}</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>총 거래건수</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{fmt(totalCount)}건</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>평균 거래금액</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent2)' }}>
            ₩{totalCount ? fmt(Math.round(totalRevenue / totalCount)) : '0'}
          </div>
        </div>
      </div>

      {/* 바 차트 + 테이블 */}
      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>불러오는 중...</div>
        ) : data.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>데이터 없음</div>
        ) : (
          <div>
            {/* 간단 바 차트 */}
            <div style={{ marginBottom: 24 }}>
              {data.slice(0, 20).map(row => (
                <div key={row.key} style={{ marginBottom: 10 }}>
                  <div className="flex-between" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{row.key}</span>
                    <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>₩{fmt(row.total)}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${(row.total / maxTotal) * 100}%`,
                      background: 'var(--accent)',
                      borderRadius: 4,
                      transition: 'width .3s'
                    }} />
                  </div>
                </div>
              ))}
            </div>
            {/* 테이블 */}
            <table>
              <thead>
                <tr>
                  <th>{GROUP_OPTIONS.find(o => o.value === groupBy)?.label}</th>
                  <th className="num">매출</th>
                  <th className="num">거래건수</th>
                  <th className="num">판매수량</th>
                  <th className="num">비율</th>
                </tr>
              </thead>
              <tbody>
                {data.map(row => (
                  <tr key={row.key}>
                    <td style={{ fontWeight: 500 }}>{row.key}</td>
                    <td className="num fw-600" style={{ color: 'var(--accent)' }}>₩{fmt(row.total)}</td>
                    <td className="num">{fmt(row.count)}건</td>
                    <td className="num">{fmt(row.quantity)}개</td>
                    <td className="num" style={{ color: 'var(--muted)' }}>
                      {totalRevenue ? ((row.total / totalRevenue) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
