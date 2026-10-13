import { useState, useEffect, useRef } from 'react'
import { Download, X, ChevronDown } from 'lucide-react'
import { saleApi } from '../api/client'
import { downloadRevenueExcel } from '../utils/revenueExcel'

const fmt = value => Number(value || 0).toLocaleString('ko-KR')

export default function RevenueDetail({ selected, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const dialogRef = useRef(null)
  const params = { ...selected.query, group_key: selected.key }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    saleApi.summaryDetails(params).then(response => {
      if (!cancelled) setDetail(response.data)
    }).catch(err => {
      if (!cancelled) setError(err.response?.data?.detail || '상세 거래를 불러오지 못했습니다.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [attempt])

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    const handleEscape = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [onClose])

  const handleKeys = event => {
    if (event.key !== 'Tab') return
    const elements = [...dialogRef.current.querySelectorAll('button:not(:disabled), [href], [tabindex="0"]')]
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault(); last?.focus()
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
      event.preventDefault(); first?.focus()
    }
  }

  const loadMore = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await saleApi.summaryDetails({ ...params, snapshot_id: detail.snapshot_id, before_id: detail.next_before_id })
      setDetail(previous => ({ ...response.data, items: [...previous.items, ...response.data.items] }))
    } catch (err) {
      setError(err.response?.data?.detail || '상세 거래를 불러오지 못했습니다.')
    } finally { setLoading(false) }
  }

  const exportDetails = async () => {
    setExporting(true)
    setExportError('')
    try {
      let page = (await saleApi.summaryDetails({ ...params, limit: 1000 })).data
      const summary = page.summary
      const items = [...page.items]
      while (page.next_before_id) {
        page = (await saleApi.summaryDetails({ ...params, limit: 1000,
          snapshot_id: page.snapshot_id, before_id: page.next_before_id })).data
        items.push(...page.items)
      }
      if (items.length !== summary.line_count) throw new Error('거래가 변경되었습니다. 다시 다운로드해 주세요.')
      await downloadRevenueExcel({ query: selected.query, groupLabel: selected.groupLabel,
        selectedKey: selected.key, summary, items })
    } catch (err) {
      setExportError(err.response?.data?.detail || err.message || '엑셀 다운로드에 실패했습니다.')
    } finally {
      setExporting(false)
      dialogRef.current?.focus()
    }
  }

  const summary = detail?.summary
  return <div className="modal-bg" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal revenue-detail" role="dialog" aria-modal="true" aria-labelledby="revenue-detail-title"
      tabIndex={-1} ref={dialogRef} onKeyDown={handleKeys}>
      <div className="revenue-detail-heading">
        <div><h2 id="revenue-detail-title">{selected.key} 매출 상세</h2>
          <p className="revenue-period">{selected.query.start} ~ {selected.query.end}
            {' · ' + (selected.query.business || '전체 사업자') + ' · ' + selected.groupLabel}</p>
        </div>
        <div className="revenue-detail-actions">
          <button className="btn btn-ghost" onClick={exportDetails} disabled={!summary?.line_count || exporting || loading}>
            <Download size={16} aria-hidden="true" />{exporting ? '저장 중...' : '상세 엑셀'}
          </button>
          <button className="btn btn-ghost revenue-icon-button" onClick={onClose} aria-label="닫기" title="닫기">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {summary && <dl className="revenue-detail-metrics">
        {[['거래건수', fmt(summary.count) + '건'], ['판매수량', fmt(summary.quantity) + '개'],
          ['매출', '₩' + fmt(summary.total)], ['원가', '₩' + fmt(summary.cost_total)],
          ['순수익', '₩' + fmt(summary.profit)], ['마진율', summary.margin_rate + '%']].map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>}
      {error && <div className="revenue-error" role="alert">{error}
        {!detail && <button className="btn btn-ghost btn-sm" onClick={() => setAttempt(value => value + 1)}>다시 시도</button>}
      </div>}
      {exportError && <div className="revenue-error" role="alert">{exportError}</div>}
      {!detail && loading ? <div className="revenue-empty" role="status">상세 거래를 불러오는 중...</div>
        : detail && <><div className="revenue-detail-count">거래 {fmt(summary.count)}건 · 품목 {fmt(summary.line_count)}줄</div>
          <div className="table-wrap revenue-detail-table">
            <table><thead><tr><th>날짜</th><th>거래번호</th><th>상품명</th><th>사업자</th>
              <th>대분류</th><th>중분류</th><th>브랜드</th><th className="num">수량</th>
              <th className="num">원가단가</th><th className="num">판매가</th><th className="num">매출</th>
              <th className="num">순수익</th><th>판매경로</th><th>결제방식</th><th>직원</th><th>메모</th>
            </tr></thead><tbody>
              {!detail.items.length ? <tr><td colSpan={16} className="revenue-empty">해당 거래가 없습니다.</td></tr>
                : detail.items.map(row => <tr key={row.id}>
                  <td>{row.sale_date}</td><td>{row.transaction_no || '—'}</td>
                  <td className="revenue-product-cell">{row.product_name}</td><td>{row.business || '기타'}</td>
                  <td>{row.category || '미분류'}</td><td>{row.subcategory || '미분류'}</td><td>{row.brand || '미분류'}</td>
                  <td className="num">{fmt(row.quantity)}</td><td className="num">₩{fmt(row.cost_price)}</td>
                  <td className="num">₩{fmt(row.sale_price)}</td><td className="num">₩{fmt(row.total)}</td>
                  <td className={'num ' + (row.total - row.cost_price * row.quantity >= 0 ? 'text-green' : 'text-red')}>
                    ₩{fmt(row.total - row.cost_price * row.quantity)}
                  </td><td>{row.channel || '기타'}</td><td>{row.payment || '기타'}</td>
                  <td>{row.staff_name || '—'}</td><td className="revenue-memo-cell">{row.memo}</td>
                </tr>)}
            </tbody></table>
          </div>
          {detail.next_before_id && <div className="revenue-load-more">
            <span>{fmt(detail.items.length)} / {fmt(summary.line_count)}줄</span>
            <button className="btn btn-ghost" disabled={loading} onClick={loadMore}>
              <ChevronDown size={16} aria-hidden="true" />{loading ? '불러오는 중...' : '더 보기'}
            </button>
          </div>}
        </>}
    </div>
  </div>
}
