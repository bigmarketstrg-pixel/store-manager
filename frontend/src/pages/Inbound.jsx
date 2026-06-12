import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { productApi } from '../api/client'
import { useToast } from '../hooks/useToast.jsx'

const INBOUND_BUSINESSES = ['다담', '훌라']
const emptyRow = () => ({
  category: '',
  subcategory: '',
  brand: '',
  product_name: '',
  quantity: 1,
  cost_price: 0,
  sale_price: 0,
})

export default function Inbound() {
  const { toast, ToastContainer } = useToast()
  const [products, setProducts] = useState([])
  const [recordDate, setRecordDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [supplierName, setSupplierName] = useState('')
  const [inboundBusiness, setInboundBusiness] = useState('다담')
  const [memo, setMemo] = useState('')
  const [rows, setRows] = useState([emptyRow()])

  useEffect(() => {
    productApi.list({})
      .then(r => setProducts(r.data))
      .catch(() => toast('상품 목록을 불러오지 못했습니다.', 'error'))
  }, [])

  const setRow = (index, key, value) => {
    setRows(prev => prev.map((row, i) => i === index ? { ...row, [key]: value } : row))
  }
  const fillFromProduct = (row, product) => ({
    ...row,
    category: product.category || '',
    subcategory: product.subcategory || '',
    brand: product.brand || '',
    product_name: product.name,
    cost_price: product.cost_price || 0,
    sale_price: product.sale_price || 0,
  })
  const applyProduct = (index, name) => {
    setRows(prev => prev.map((row, i) => {
      if (i !== index) return row
      const exact = products.find(p => p.name === name && p.business === inboundBusiness)
      if (!exact) return { ...row, product_name: name }
      return fillFromProduct(row, exact)
    }))
  }
  const changeInboundBusiness = (business) => {
    setInboundBusiness(business)
    setRows(prev => prev.map(row => {
      const exact = products.find(p => p.name === row.product_name && p.business === business)
      return exact ? fillFromProduct(row, exact) : row
    }))
  }
  const addRow = () => setRows(prev => [...prev, emptyRow()])
  const removeRow = (index) => setRows(prev => prev.filter((_, i) => i !== index))
  const amount = row => (Number(row.quantity) || 0) * (Number(row.cost_price) || 0)
  const totalAmount = rows.reduce((sum, row) => sum + amount(row), 0)
  const fmt = n => Math.round(Number(n) || 0).toLocaleString()
  const inboundProducts = products.filter(p => p.business === inboundBusiness)
  const productNames = [...new Set(inboundProducts.map(p => p.name).filter(Boolean))].sort()
  const categories = [...new Set(inboundProducts.map(p => p.category).filter(Boolean))].sort()
  const subcategories = [...new Set(inboundProducts.map(p => p.subcategory).filter(Boolean))].sort()
  const brands = [...new Set(inboundProducts.map(p => p.brand).filter(Boolean))].sort()

  const save = async () => {
    const items = rows
      .map(row => ({
        brand: row.brand.trim(),
        category: row.category.trim(),
        subcategory: row.subcategory.trim(),
        product_name: row.product_name.trim(),
        quantity: Number(row.quantity) || 0,
        cost_price: Number(row.cost_price) || 0,
        sale_price: Number(row.sale_price) || 0,
        amount: amount(row),
      }))
      .filter(row => row.product_name && row.quantity > 0)

    if (!supplierName.trim()) { toast('상호명을 입력해주세요.', 'error'); return }
    if (items.length === 0) { toast('입고 품목을 하나 이상 입력해주세요.', 'error'); return }

    try {
      await productApi.inboundBulk({
        record_date: recordDate,
        supplier_name: supplierName.trim(),
        business: inboundBusiness,
        total_amount: totalAmount,
        memo,
        items,
      })
      setSupplierName('')
      setMemo('')
      setRows([emptyRow()])
      toast('입고 등록 완료')
    } catch (err) {
      toast(err.response?.data?.detail || '입고 등록 실패', 'error')
    }
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>입고 등록</h1>
      </div>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1.4fr 120px 1.6fr', gap: 12, marginBottom: 16, alignItems: 'end' }}>
          <div className="field">
            <label>날짜</label>
            <input className="input" type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)} />
          </div>
          <div className="field">
            <label>상호명</label>
            <input className="input" value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="거래처 상호명" />
          </div>
          <div className="field">
            <label>사업자</label>
            <select className="input" value={inboundBusiness} onChange={e => changeInboundBusiness(e.target.value)}>
              {INBOUND_BUSINESSES.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="field">
            <label>메모</label>
            <input className="input" value={memo} onChange={e => setMemo(e.target.value)} />
          </div>
        </div>

        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
          <datalist id="inbound-products">{productNames.map(v => <option key={v} value={v} />)}</datalist>
          <datalist id="inbound-categories">{categories.map(v => <option key={v} value={v} />)}</datalist>
          <datalist id="inbound-subcategories">{subcategories.map(v => <option key={v} value={v} />)}</datalist>
          <datalist id="inbound-brands">{brands.map(v => <option key={v} value={v} />)}</datalist>
          <table style={{ minWidth: 1120, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 150 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 240 }} />
              <col style={{ width: 72 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 70 }} />
            </colgroup>
            <thead>
              <tr>
                <th>대분류</th><th>중분류</th><th>브랜드</th><th>품명</th>
                <th className="num">수량</th><th className="num">단가</th>
                <th className="num">판매가</th><th className="num">금액</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td><input className="input" list="inbound-categories" value={row.category} onChange={e => setRow(i, 'category', e.target.value)} placeholder="대분류" /></td>
                  <td><input className="input" list="inbound-subcategories" value={row.subcategory} onChange={e => setRow(i, 'subcategory', e.target.value)} placeholder="중분류" /></td>
                  <td><input className="input" list="inbound-brands" value={row.brand} onChange={e => setRow(i, 'brand', e.target.value)} placeholder="브랜드" /></td>
                  <td><input className="input" list="inbound-products" value={row.product_name} onChange={e => applyProduct(i, e.target.value)} placeholder="품명" /></td>
                  <td><input className="input" type="number" min={1} value={row.quantity} onChange={e => setRow(i, 'quantity', e.target.value)} style={{ textAlign: 'right' }} /></td>
                  <td><input className="input" type="number" min={0} value={row.cost_price} onChange={e => setRow(i, 'cost_price', e.target.value)} style={{ textAlign: 'right' }} /></td>
                  <td><input className="input" type="number" min={0} value={row.sale_price} onChange={e => setRow(i, 'sale_price', e.target.value)} style={{ textAlign: 'right' }} /></td>
                  <td className="num fw-600">₩{fmt(amount(row))}</td>
                  <td>{rows.length > 1 && <button className="btn btn-ghost btn-sm" onClick={() => removeRow(i)}>삭제</button>}</td>
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
          <button className="btn btn-ghost" onClick={() => setRows([emptyRow()])}>초기화</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={save}>입고 등록</button>
        </div>
      </div>
      <ToastContainer />
    </div>
  )
}
