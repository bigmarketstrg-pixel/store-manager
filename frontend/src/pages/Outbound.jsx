import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { productApi } from '../api/client'
import { useToast } from '../hooks/useToast.jsx'

const REASONS = ['샘플', '폐기', '행사 반출', '재고 조정', '기타']

export default function Outbound() {
  const { toast, ToastContainer } = useToast()
  const searchRef = useRef()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [cart, setCart] = useState([])
  const [recordDate, setRecordDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [reason, setReason] = useState(REASONS[0])
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const fmt = n => Number(n || 0).toLocaleString()

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 1) {
        setResults([])
        return
      }
      try {
        const r = await productApi.list({ q: query })
        setResults(r.data)
      } catch {}
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id)
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast(`재고 부족 (현재 ${product.stock}개)`, 'error')
          return prev
        }
        return prev.map(item => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      }
      if (product.stock < 1) {
        toast('재고가 없습니다', 'error')
        return prev
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        business: product.business,
        category: product.category,
        brand: product.brand,
        cost_price: product.cost_price,
        quantity: 1,
        max_stock: product.stock,
      }]
    })
    setQuery('')
    setResults([])
    searchRef.current?.focus()
  }

  const updateQty = (productId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.product_id !== productId) return item
      const next = item.quantity + delta
      if (next < 1) return null
      if (next > item.max_stock) {
        toast(`최대 ${item.max_stock}개까지 가능`, 'error')
        return item
      }
      return { ...item, quantity: next }
    }).filter(Boolean))
  }

  const save = async () => {
    if (cart.length === 0) {
      toast('출고할 상품을 추가해주세요.', 'error')
      return
    }
    setSaving(true)
    try {
      await productApi.outboundBulk({
        record_date: recordDate,
        reason,
        memo,
        items: cart.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
        })),
      })
      setCart([])
      setMemo('')
      toast('출고 등록 완료')
      searchRef.current?.focus()
    } catch (err) {
      toast(err.response?.data?.detail || '출고 등록 실패', 'error')
    } finally {
      setSaving(false)
    }
  }

  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>출고 등록</h1>
      </div>

      <div className="pos-layout">
        <div className="pos-left">
          <div className="card">
            <div className="card-title">출고 정보</div>
            <div className="grid-3" style={{ gap: 12 }}>
              <div className="field">
                <label>출고일</label>
                <input className="input" type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)} />
              </div>
              <div className="field">
                <label>출고 사유</label>
                <select className="input" value={reason} onChange={e => setReason(e.target.value)}>
                  {REASONS.map(item => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div className="field">
                <label>메모</label>
                <input className="input" value={memo} onChange={e => setMemo(e.target.value)} placeholder="선택 입력" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">상품 검색</div>
            <input
              ref={searchRef}
              className="input input-lg"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="상품명 입력..."
              autoFocus
            />
            {results.length > 0 && (
              <div className="pos-search-result" style={{ marginTop: 12 }}>
                {results.map(product => (
                  <div key={product.id} className="pos-product-card" onClick={() => addToCart(product)}>
                    <div className="pname">{product.name}</div>
                    <div className="pprice">재고 {product.stock}개</div>
                    <div className="pstock">{product.business}{product.brand ? ` · ${product.brand}` : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pos-right">
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ margin: 0 }}>출고 품목</div>
              {cart.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setCart([])}>전체삭제</button>}
            </div>

            <div className="pos-cart" style={{ flex: 1 }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0', fontSize: 13 }}>상품을 검색해서 추가하세요</div>
              ) : cart.map(item => (
                <div key={item.product_id} className="cart-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cart-item-name">{item.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.business}{item.brand ? ` · ${item.brand}` : ''}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>현재 재고 {fmt(item.max_stock)}개</div>
                  </div>
                  <div className="cart-item-qty">
                    <button className="qty-btn" onClick={() => updateQty(item.product_id, -1)}>−</button>
                    <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 600 }}>{item.quantity}</span>
                    <button className="qty-btn" onClick={() => updateQty(item.product_id, 1)}>+</button>
                  </div>
                  <button
                    onClick={() => setCart(prev => prev.filter(p => p.product_id !== item.product_id))}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>

            <div className="cart-total">
              <div className="total-row">
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>총 출고수량</span>
                <span className="total-amount">{fmt(totalQuantity)}개</span>
              </div>
              <button className="btn btn-success btn-lg" style={{ width: '100%' }} onClick={save} disabled={cart.length === 0 || saving}>
                {saving ? '등록 중...' : '출고 등록'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <ToastContainer />
    </div>
  )
}
