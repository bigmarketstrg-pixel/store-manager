import { useState, useEffect, useRef } from 'react'
import { productApi } from '../api/client'
import { useToast } from '../hooks/useToast.jsx'

const BUSINESSES = ['전체', '다담', '훌라', '오아시스', '이 외']

export default function Stock() {
  const [products, setProducts] = useState([])
  const [q, setQ] = useState('')
  const [business, setBusiness] = useState('전체')
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [brand, setBrand] = useState('')
  const [costMin, setCostMin] = useState('')
  const [costMax, setCostMax] = useState('')
  const [saleMin, setSaleMin] = useState('')
  const [saleMax, setSaleMax] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [showInbound, setShowInbound] = useState(false)
  const [inboundItem, setInboundItem] = useState(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)
  const importModeRef = useRef('merge')
  const { toast, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (q) params.q = q
      if (business !== '전체') params.business = business
      if (category) params.category = category
      if (subcategory) params.subcategory = subcategory
      if (brand) params.brand = brand
      if (costMin !== '') params.cost_min = +costMin
      if (costMax !== '') params.cost_max = +costMax
      if (saleMin !== '') params.sale_min = +saleMin
      if (saleMax !== '') params.sale_max = +saleMax
      const r = await productApi.list(params)
      setProducts(r.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [q, business, category, subcategory, brand, costMin, costMax, saleMin, saleMax])

  const openEdit = (item = null) => { setEditItem(item); setShowModal(true) }
  const openInbound = (item) => { setInboundItem(item); setShowInbound(true) }

  const resetFilters = () => {
    setQ('')
    setBusiness('전체')
    setCategory('')
    setSubcategory('')
    setBrand('')
    setCostMin('')
    setCostMax('')
    setSaleMin('')
    setSaleMax('')
  }

  const startImport = (mode) => {
    importModeRef.current = mode
    fileInputRef.current?.click()
  }

  const importDb = async (file) => {
    if (!file) return
    const replaceAll = importModeRef.current === 'replace'
    if (replaceAll && !confirm('기존 재고 상품을 모두 삭제하고 이 DB 파일로 다시 채울까요? 이 작업은 되돌릴 수 없습니다.')) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    const importMessage = replaceAll
      ? '선택한 DB 파일의 재고를 새 기준으로 가져옵니다.'
      : 'DB 파일의 재고를 가져올까요? 같은 상품명+사업자는 기존 상품 정보가 업데이트됩니다.'
    if (!confirm(importMessage)) {
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const form = new FormData()
    form.append('file', file)
    form.append('update_existing', 'true')
    form.append('replace_all', replaceAll ? 'true' : 'false')

    setImporting(true)
    try {
      const r = await productApi.importDb(form)
      const { total, created, updated, skipped, deleted = 0 } = r.data
      if (deleted) toast(`기존 재고 ${deleted}개 삭제 후 교체했습니다.`)
      toast(`가져오기 완료: 전체 ${total}개 / 추가 ${created}개 / 업데이트 ${updated}개 / 건너뜀 ${skipped}개`)
      load()
    } catch (err) {
      toast(err.response?.data?.detail || 'DB 가져오기 실패', 'error')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const fmt = n => n?.toLocaleString() || '0'

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>재고 관리</h1>
        <div className="flex gap-8">
          <input
            ref={fileInputRef}
            type="file"
            accept=".db,.sqlite,.sqlite3"
            style={{ display: 'none' }}
            onChange={e => importDb(e.target.files?.[0])}
          />
          <button className="btn btn-ghost" disabled={importing} onClick={() => startImport('merge')}>
            {importing ? '가져오는 중...' : 'DB 가져오기'}
          </button>
          <button className="btn btn-danger" disabled={importing} onClick={() => startImport('replace')}>
            DB 전체교체
          </button>
          <button className="btn btn-primary" onClick={() => openEdit(null)}>+ 상품 추가</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          <input className="input" placeholder="상품명 검색..." value={q} onChange={e => setQ(e.target.value)} style={{ width: 200 }} />
          <select className="input" value={business} onChange={e => setBusiness(e.target.value)} style={{ width: 120 }}>
            {BUSINESSES.map(b => <option key={b}>{b}</option>)}
          </select>
          <input className="input" placeholder="대분류" value={category} onChange={e => setCategory(e.target.value)} style={{ width: 130 }} />
          <input className="input" placeholder="중분류" value={subcategory} onChange={e => setSubcategory(e.target.value)} style={{ width: 130 }} />
          <input className="input" placeholder="브랜드" value={brand} onChange={e => setBrand(e.target.value)} style={{ width: 130 }} />
          <input className="input" type="number" placeholder="단가 최소" value={costMin} onChange={e => setCostMin(e.target.value)} style={{ width: 110 }} />
          <input className="input" type="number" placeholder="단가 최대" value={costMax} onChange={e => setCostMax(e.target.value)} style={{ width: 110 }} />
          <input className="input" type="number" placeholder="판매가 최소" value={saleMin} onChange={e => setSaleMin(e.target.value)} style={{ width: 120 }} />
          <input className="input" type="number" placeholder="판매가 최대" value={saleMax} onChange={e => setSaleMax(e.target.value)} style={{ width: 120 }} />
          <button className="btn btn-ghost" onClick={resetFilters}>초기화</button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>상품명</th><th>사업자</th><th>대분류</th><th>중분류</th><th>브랜드</th>
                <th className="num">단가</th><th className="num">판매가</th><th className="num">재고</th>
                <th>비고</th><th>액션</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>불러오는 중...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>상품이 없습니다</td></tr>
              ) : products.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td><span className={`badge ${p.business === '훌라' ? 'badge-purple' : p.business === '다담' ? 'badge-blue' : 'badge-green'}`}>{p.business}</span></td>
                  <td>{p.category}</td>
                  <td>{p.subcategory}</td>
                  <td>{p.brand}</td>
                  <td className="num">₩{fmt(p.cost_price)}</td>
                  <td className="num">₩{fmt(p.sale_price)}</td>
                  <td className="num">
                    <span style={{ color: p.stock < 5 ? 'var(--red)' : p.stock < 10 ? 'var(--yellow)' : 'var(--green)', fontWeight: 600 }}>
                      {fmt(p.stock)}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.note}</td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-ghost btn-sm" onClick={() => openInbound(p)}>입고</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>수정</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <ProductModal
          item={editItem}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); load(); toast(editItem ? '수정 완료' : '상품 추가 완료') }}
          toast={toast}
        />
      )}
      {showInbound && (
        <InboundModal
          item={inboundItem}
          onClose={() => setShowInbound(false)}
          onSave={() => { setShowInbound(false); load(); toast('입고 처리 완료') }}
          toast={toast}
        />
      )}
      <ToastContainer />
    </div>
  )
}

function ProductModal({ item, onClose, onSave, toast }) {
  const [form, setForm] = useState({
    name: item?.name || '',
    business: item?.business || '다담',
    category: item?.category || '',
    subcategory: item?.subcategory || '',
    brand: item?.brand || '',
    product_code: item?.product_code || '',
    cost_price: item?.cost_price || 0,
    sale_price: item?.sale_price || 0,
    stock: item?.stock || 0,
    note: item?.note || '',
    memo: item?.memo || '',
  })

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    try {
      if (item) await productApi.update(item.id, form)
      else await productApi.create(form)
      onSave()
    } catch (err) {
      toast(err.response?.data?.detail || '저장 실패', 'error')
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 540 }} onClick={e => e.stopPropagation()}>
        <h2>{item ? '상품 수정' : '상품 추가'}</h2>
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>상품명 *</label>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="field">
            <label>사업자</label>
            <select className="input" value={form.business} onChange={e => set('business', e.target.value)}>
              {['다담','훌라','오아시스','이 외'].map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="field">
            <label>상품코드</label>
            <input className="input" value={form.product_code} onChange={e => set('product_code', e.target.value)} />
          </div>
          <div className="field">
            <label>대분류</label>
            <input className="input" value={form.category} onChange={e => set('category', e.target.value)} />
          </div>
          <div className="field">
            <label>중분류</label>
            <input className="input" value={form.subcategory} onChange={e => set('subcategory', e.target.value)} />
          </div>
          <div className="field">
            <label>브랜드</label>
            <input className="input" value={form.brand} onChange={e => set('brand', e.target.value)} />
          </div>
          <div className="field">
            <label>단가</label>
            <input className="input" type="number" value={form.cost_price} onChange={e => set('cost_price', +e.target.value)} />
          </div>
          <div className="field">
            <label>판매가</label>
            <input className="input" type="number" value={form.sale_price} onChange={e => set('sale_price', +e.target.value)} />
          </div>
          <div className="field">
            <label>재고수량</label>
            <input className="input" type="number" value={form.stock} onChange={e => set('stock', +e.target.value)} />
          </div>
          <div className="field">
            <label>비고</label>
            <input className="input" value={form.note} onChange={e => set('note', e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>메모</label>
            <input className="input" value={form.memo} onChange={e => set('memo', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-8 mt-24">
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>취소</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={save}>저장</button>
        </div>
      </div>
    </div>
  )
}

function InboundModal({ item, onClose, onSave, toast }) {
  const [qty, setQty] = useState(1)
  const [costPrice, setCostPrice] = useState(item?.cost_price || 0)
  const [memo, setMemo] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const save = async () => {
    try {
      await productApi.inbound({ product_id: item.id, quantity: qty, cost_price: costPrice, record_date: date, memo })
      onSave()
    } catch (err) {
      toast(err.response?.data?.detail || '입고 실패', 'error')
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>입고 처리</h2>
        <div style={{ marginBottom: 20, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 8 }}>
          <div style={{ fontWeight: 600 }}>{item?.name}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>현재 재고: {item?.stock}개</div>
        </div>
        <div className="grid-2" style={{ gap: 12 }}>
          <div className="field">
            <label>입고날짜</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>입고수량</label>
            <input className="input" type="number" min={1} value={qty} onChange={e => setQty(+e.target.value)} />
          </div>
          <div className="field">
            <label>단가</label>
            <input className="input" type="number" value={costPrice} onChange={e => setCostPrice(+e.target.value)} />
          </div>
          <div className="field">
            <label>메모</label>
            <input className="input" value={memo} onChange={e => setMemo(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-8 mt-24">
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>취소</button>
          <button className="btn btn-success" style={{ flex: 2 }} onClick={save}>입고 처리</button>
        </div>
      </div>
    </div>
  )
}
