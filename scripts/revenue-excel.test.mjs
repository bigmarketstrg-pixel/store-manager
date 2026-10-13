import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from '../frontend/node_modules/xlsx/xlsx.mjs'
import { buildRevenueWorkbook } from '../frontend/src/utils/revenueExcel.js'

const query = { group_by: 'business', start: '2026-07-01', end: '2026-07-31', business: '훌라' }

test('summary workbook preserves numeric amounts and non-additive transaction totals', () => {
  const rows = [
    { key: 'Brand A', total: 1500, cost_total: 700, profit: 800, count: 2,
      line_count: 3, quantity: 4, overall_count: 2, revenue_percent: 75, quantity_percent: 80 },
    { key: 'Brand B', total: 500, cost_total: 200, profit: 300, count: 1,
      line_count: 1, quantity: 1, overall_count: 2, revenue_percent: 25, quantity_percent: 20 },
  ]
  const book = buildRevenueWorkbook(XLSX, { query, groupLabel: '브랜드별', rows })
  const restored = XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
  const data = XLSX.utils.sheet_to_json(restored.Sheets['매출집계'])
  assert.equal(data[2].거래건수, 2)
  assert.equal(data[2].매출, 2000)
  assert.equal(data[2].순수익, 1100)
  assert.equal(typeof data[0].매출, 'number')
  assert.equal(XLSX.utils.sheet_to_json(restored.Sheets['조회조건'])[2].값, '훌라')
})

test('detail workbook includes every line beyond 1000 and treats user text as text', () => {
  const items = Array.from({ length: 1005 }, (_, index) => ({
    id: index + 1, sale_date: '2026-07-01', transaction_no: 'T1',
    product_name: '=2+2', business: '훌라', cost_price: 100, sale_price: 300,
    quantity: 2, total: 600, staff_name: 'Tester', memo: '+memo',
  }))
  const book = buildRevenueWorkbook(XLSX, { query, groupLabel: '사업자별', selectedKey: '훌라',
    summary: { count: 1, line_count: 1005, quantity: 2010, total: 603000, cost_total: 201000, profit: 402000 }, items })
  const restored = XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
  const sheet = restored.Sheets['상세거래']
  const data = XLSX.utils.sheet_to_json(sheet)
  assert.equal(data.length, 1005)
  assert.equal(data[1004].No, 1005)
  assert.equal(data[0].원가, 200)
  assert.equal(data[0].순수익, 400)
  assert.equal(sheet.D2.t, 's')
  assert.equal(sheet.D2.f, undefined)
  assert.equal(data[0].직원, 'Tester')
})
