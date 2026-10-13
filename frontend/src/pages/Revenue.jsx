import { useState, useEffect, useRef, useCallback } from 'react'
import { Download, Search } from 'lucide-react'
import { saleApi } from '../api/client'
import { useToast } from '../hooks/useToast.jsx'
import RevenueDetail from '../components/RevenueDetail'
import { downloadRevenueExcel } from '../utils/revenueExcel'
import dayjs from 'dayjs'
import './Revenue.css'

const GROUP_OPTIONS = [
  { value: 'day', label: '일별' },
  { value: 'month', label: '월별' },
  { value: 'business', label: '사업자별' },
  { value: 'category', label: '대분류별' },
  { value: 'subcategory', label: '중분류별' },
  { value: 'brand', label: '브랜드별' },
  { value: 'product', label: '상품별' },
  { value: 'channel', label: '판매경로별' },
  { value: 'payment', label: '결제방식별' },
]
const BUSINESSES = ['전체', '다담', '훌라', '오아시스', '이 외']
const fmt = value => Number(value || 0).toLocaleString('ko-KR')

export default function Revenue() {
  const [report, setReport] = useState({ rows: [], query: null })
  const [groupBy, setGroupBy] = useState('month')
  const [start, setStart] = useState(dayjs().startOf('month').format('YYYY-MM-DD'))
  const [end, setEnd] = useState(dayjs().endOf('month').format('YYYY-MM-DD'))
  const [business, setBusiness] = useState('전체')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [selected, setSelected] = useState(null)
  const requestId = useRef(0)
  const { toast, ToastContainer } = useToast()
  const closeDetail = useCallback(() => setSelected(null), [])

  const load = async () => {
    if (!start || !end || start > end) {
      toast('조회 기간을 확인해주세요.', 'error')
      setLoading(false)
      return
    }
    const current = ++requestId.current
    const query = { group_by: groupBy, start, end }
    if (business !== '전체') query.business = business
    setLoading(true)
    setError('')
    setSelected(null)
    try {
      const response = await saleApi.summary(query)
      if (current === requestId.current) setReport({ rows: response.data, query })
    } catch (err) {
      if (current === requestId.current) setError(err.response?.data?.detail || '매출 집계를 불러오지 못했습니다.')
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }

  useEffect(() => { load() }, [groupBy])
  useEffect(() => () => { requestId.current++ }, [])

  const data = report.rows
  const totalRevenue = data.reduce((sum, row) => sum + row.total, 0)
  const totalCost = data.reduce((sum, row) => sum + row.cost_total, 0)
  const totalProfit = totalRevenue - totalCost
  const totalCount = data[0]?.overall_count || 0
  const totalQuantity = data.reduce((sum, row) => sum + row.quantity, 0)
  const maxTotal = Math.max(...data.map(row => row.total), 1)
  const groupLabel = GROUP_OPTIONS.find(option => option.value === report.query?.group_by)?.label || '월별'
  const openDetail = row => setSelected({ key: row.key, query: report.query, groupLabel })

  const exportSummary = async () => {
    setExporting(true)
    try {
      await downloadRevenueExcel({ query: report.query, groupLabel, rows: data })
    } catch {
      toast('엑셀 다운로드에 실패했습니다.', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="revenue-page">
      <div className="revenue-heading">
        <h1 className="page-title">매출 집계</h1>
        <button className="btn btn-ghost" onClick={exportSummary} disabled={loading || exporting || !!error || !data.length}>
          <Download size={16} aria-hidden="true" />{exporting ? '저장 중...' : '집계 엑셀'}
        </button>
      </div>
      <form className="revenue-filters" onSubmit={event => { event.preventDefault(); load() }}>
        <div className="field">
          <label htmlFor="revenue-group">집계 기준</label>
          <select id="revenue-group" className="input" value={groupBy} onChange={event => setGroupBy(event.target.value)}>
            {GROUP_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="revenue-start">시작일</label>
          <input id="revenue-start" type="date" className="input" value={start} onChange={event => setStart(event.target.value)} />
        </div>
        <div className="field"><label htmlFor="revenue-end">종료일</label>
          <input id="revenue-end" type="date" className="input" value={end} onChange={event => setEnd(event.target.value)} />
        </div>
        <div className="field"><label htmlFor="revenue-business">사업자</label>
          <select id="revenue-business" className="input" value={business} onChange={event => setBusiness(event.target.value)}>
            {BUSINESSES.map(value => <option key={value}>{value}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" disabled={loading}><Search size={16} aria-hidden="true" />조회</button>
      </form>

      {error && <div className="revenue-error" role="alert">{error}</div>}
      {report.query && <p className="revenue-period">
        {report.query.start} ~ {report.query.end} · {report.query.business || '전체 사업자'} · {groupLabel}
      </p>}
      <div className="revenue-metrics" aria-busy={loading}>
        <RevenueMetric label="총 매출" value={'₩' + fmt(totalRevenue)} color="var(--green)" />
        <RevenueMetric label="총 순수익" title="매출 - 상품 원가" value={'₩' + fmt(totalProfit)}
          color={totalProfit >= 0 ? 'var(--accent)' : 'var(--red)'}
          note={'마진율 ' + (totalRevenue ? (totalProfit / totalRevenue * 100).toFixed(1) : '0.0') + '%'} />
        <RevenueMetric label="총 원가" value={'₩' + fmt(totalCost)} />
        <RevenueMetric label="총 거래건수" title="조회 기간의 거래번호 중복 제외" value={fmt(totalCount) + '건'} />
        <RevenueMetric label="총 판매수량" value={fmt(totalQuantity) + '개'} />
        <RevenueMetric label="평균 거래금액" value={'₩' + fmt(totalCount ? Math.round(totalRevenue / totalCount) : 0)} />
      </div>

      <section className="revenue-results" aria-busy={loading}>
        {loading ? <div className="revenue-empty" role="status">불러오는 중...</div>
          : error ? <button className="btn btn-ghost" onClick={load}>다시 조회</button>
          : !data.length ? <div className="revenue-empty">조회 기간에 매출이 없습니다.</div>
          : <>
            <div className="revenue-bars">
              {data.slice(0, 20).map(row => (
                <button type="button" className="revenue-bar" key={row.key} onClick={() => openDetail(row)}
                  aria-label={row.key + ' 상세 보기'}>
                  <span className="revenue-bar-label"><span>{row.key}</span>
                    <span>₩{fmt(row.total)} · {row.revenue_percent}%</span>
                  </span>
                  <span className="revenue-bar-track"><span style={{ width: Math.max(0, row.total / maxTotal * 100) + '%' }} /></span>
                </button>
              ))}
            </div>
            <div className="table-wrap">
              <table className="revenue-summary-table">
                <thead><tr>
                  <th>{groupLabel}</th><th className="num">매출</th><th className="num">원가</th>
                  <th className="num">순수익</th><th className="num">마진율</th>
                  <th className="num" title="같은 거래번호는 한 건으로 계산하며, 여러 분류에 걸친 거래는 각 분류에 포함됩니다.">거래건수</th>
                  <th className="num">판매수량</th><th className="num">매출비중</th>
                  <th className="num">수량비중</th><th className="num">평균단가</th><th className="num">개당순익</th>
                </tr></thead>
                <tbody>{data.map(row => (
                  <tr key={row.key} onClick={() => openDetail(row)} className="revenue-summary-row">
                    <td><button className="revenue-item-link" onClick={event => { event.stopPropagation(); openDetail(row) }}>
                      {row.key}
                    </button></td>
                    <td className="num fw-600 text-accent">₩{fmt(row.total)}</td>
                    <td className="num text-muted">₩{fmt(row.cost_total)}</td>
                    <td className={'num fw-600 ' + (row.profit >= 0 ? 'text-green' : 'text-red')}>₩{fmt(row.profit)}</td>
                    <td className="num">{row.margin_rate}%</td><td className="num">{fmt(row.count)}건</td>
                    <td className="num">{fmt(row.quantity)}개</td><td className="num">{row.revenue_percent}%</td>
                    <td className="num">{row.quantity_percent}%</td><td className="num">₩{fmt(row.avg_sale)}</td>
                    <td className="num">₩{fmt(row.avg_profit)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>}
      </section>
      {selected && <RevenueDetail key={JSON.stringify(selected)} selected={selected} onClose={closeDetail} />}
      <ToastContainer />
    </div>
  )
}

function RevenueMetric({ label, value, color, note, title }) {
  return <div className="revenue-metric" title={title}>
    <span>{label}</span><strong style={{ color }}>{value}</strong>{note && <small>{note}</small>}
  </div>
}
