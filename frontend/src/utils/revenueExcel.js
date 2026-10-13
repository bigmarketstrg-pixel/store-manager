const summaryColumns = [
  '항목', '매출', '원가', '순수익', '마진율(%)', '거래건수', '품목수', '판매수량',
  '매출비중(%)', '수량비중(%)', '평균단가', '개당순익',
]
const detailColumns = [
  'No', '날짜', '거래번호', '상품명', '사업자', '대분류', '중분류', '브랜드',
  '수량', '원가단가', '판매가', '매출', '원가', '순수익', '판매경로', '결제방식', '직원', '메모',
]

function addSheet(XLSX, book, name, rows, columns, widths) {
  const sheet = XLSX.utils.json_to_sheet(rows, { header: columns })
  sheet['!cols'] = widths.map(wch => ({ wch }))
  sheet['!autofilter'] = { ref: sheet['!ref'] }
  for (const [address, cell] of Object.entries(sheet)) {
    if (!address.startsWith('!') && cell.t === 'n') cell.z = '#,##0.##'
  }
  XLSX.utils.book_append_sheet(book, sheet, name)
}

export function buildRevenueWorkbook(XLSX, { query, groupLabel, rows, selectedKey, summary, items }) {
  const book = XLSX.utils.book_new()
  const conditions = [
    { 조건: '시작일', 값: query.start }, { 조건: '종료일', 값: query.end },
    { 조건: '사업자', 값: query.business || '전체' }, { 조건: '집계 기준', 값: groupLabel },
    { 조건: '선택 항목', 값: selectedKey ?? '전체 집계' },
    { 조건: '거래건수 기준', 값: '거래번호 중복 제외. 여러 분류에 걸친 거래는 각 분류에 포함됩니다.' },
    { 조건: '순수익 기준', 값: '매출 - 상품 원가' },
  ]
  addSheet(XLSX, book, '조회조건', conditions, ['조건', '값'], [20, 85])
  const totals = summary || {
    total: rows.reduce((sum, row) => sum + row.total, 0),
    cost_total: rows.reduce((sum, row) => sum + row.cost_total, 0),
    profit: rows.reduce((sum, row) => sum + row.profit, 0),
    count: rows[0]?.overall_count || 0,
    line_count: rows.reduce((sum, row) => sum + row.line_count, 0),
    quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
  }
  const summaryRow = (row, label) => ({
    항목: label, 매출: row.total, 원가: row.cost_total, 순수익: row.profit,
    '마진율(%)': row.total ? Math.round(row.profit / row.total * 1000) / 10 : 0,
    거래건수: row.count, 품목수: row.line_count, 판매수량: row.quantity,
    '매출비중(%)': row.revenue_percent ?? '', '수량비중(%)': row.quantity_percent ?? '',
    평균단가: row.quantity ? Math.round(row.total / row.quantity) : 0,
    개당순익: row.quantity ? Math.round(row.profit / row.quantity) : 0,
  })
  const summaryRows = rows ? [...rows.map(row => summaryRow(row, row.key)), summaryRow(totals, '전체 합계')]
    : [summaryRow(totals, selectedKey)]
  addSheet(XLSX, book, rows ? '매출집계' : '선택항목집계', summaryRows, summaryColumns,
    [30, 18, 18, 18, 14, 12, 12, 12, 16, 16, 16, 16])
  if (items) {
    const detailRows = items.map((row, index) => ({
      No: index + 1, 날짜: row.sale_date, 거래번호: row.transaction_no || '', 상품명: row.product_name || '',
      사업자: row.business || '', 대분류: row.category || '', 중분류: row.subcategory || '', 브랜드: row.brand || '',
      수량: row.quantity, 원가단가: row.cost_price || 0, 판매가: row.sale_price, 매출: row.total,
      원가: (row.cost_price || 0) * row.quantity, 순수익: row.total - (row.cost_price || 0) * row.quantity,
      판매경로: row.channel || '', 결제방식: row.payment || '', 직원: row.staff_name || '', 메모: row.memo || '',
    }))
    addSheet(XLSX, book, '상세거래', detailRows, detailColumns,
      [8, 14, 18, 36, 14, 18, 18, 20, 10, 16, 16, 18, 18, 18, 16, 16, 16, 40])
  }
  return book
}

export async function downloadRevenueExcel(options) {
  const XLSX = await import('xlsx')
  const book = buildRevenueWorkbook(XLSX, options)
  const label = [options.groupLabel, options.selectedKey ?? '전체', options.query.business || '전체사업자']
    .join('_').replace(/[\\/:*?"<>|]/g, '-').slice(0, 100)
  XLSX.writeFile(book, '매출_' + label + '_' + options.query.start + '_' + options.query.end + '.xlsx')
}
