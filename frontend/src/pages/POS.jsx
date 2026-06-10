import { useState, useEffect, useRef } from 'react'
import { productApi, saleApi } from '../api/client'
import { useToast } from '../hooks/useToast'
import dayjs from 'dayjs'

const CHANNELS = ['매장', '쿠팡', '네이버', '카카오', '스마트스토어', '기타']
const PAYMENTS = ['현금', '카드', '계좌이체', '기타']

export default function POS() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [cart, setCart] = useState([])
  const [channel, setChannel] = useState('매장')
  const [payment, setPayment] = useState('카드')
  const [memo, setMemo] = useState('')
  const [saleDate, setSaleDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [loading, setLoading] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false)
  const searchRef = useRef()
  const { toast, ToastContainer } = useToast()

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim().length < 1) { setResults([]); return }
      try {
        const r = await productApi.list({ q: query })
        setResults(r.data)
      } catch {}
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id)
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast(`재고 부족 (현재 ${product.stock}개)`, 'error')
          return prev
        }
        return prev.map(i => i.product_id === product.id
          ? { ...i, quantity: i.quantity + 1 }
          : i
        )
      }
      if (product.stock < 1) { toast('재고가 없습니다', 'error'); return prev }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        sale_price: product.sale_price,
        quantity: 1,
        max_stock: product.stock,
        business: product.business,
      }]
    })
    setQuery('')
    setResults([])
    searchRef.current?.focus()
  }

  const updateQty = (product_id, delta) => {
    setCart(prev => prev.map(i => {
      if (i.product_id !== product_id) return i
      const next = i.quantity + delta
      if (next < 1) return null
      if (next > i.max_stock) { toast(`최대 ${i.max_stock}개까지 가능`, 'error'); return i }
      return { ...i, quantity: next }
    }).filter(Boolean))
  }

  const removeFromCart = (product_id) => {
    setCart(prev => prev.filter(i => i.product_id !== product_id))
  }

  const setPriceOverride = (product_id, val) => {
    const n = parseInt(val.replace(/,/g, ''))
    if (isNaN(n)) return
    setCart(prev => prev.map(i => i.product_id === product_id ? { ...i, sale_price: n } : i))
  }

  const total = cart.reduce((s, i) => s + i.sale_price * i.quantity, 0)

  const completeSale = async () => {
    if (cart.length === 0) { toast('상품을 먼저 추가하세요', 'error'); return }
    setLoading(true)
    try {
      await saleApi.create({
        sale_date: saleDate,
        items: cart.map(i => ({
          product_id: i.product_id,
          sale_price: i.sale_price,
          quantity: i.quantity,
          channel,
          payment,
          memo,
        }))
      })
      toast(`판매 완료! ₩${total.toLocaleString()}`)
      setCart([])
      setMemo('')
      setShowPayModal(false)
      searchRef.current?.focus()
    } catch (err) {
      toast(err.response?.data?.detail || '판매 실패', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n) => n?.toLocaleString() || '0'

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>판매 <span>POS</span></h1>
        <div className="flex gap-8">
          <input type="date" className="input" value={saleDate} onChange={e => setSaleDate(e.target.value)} style={{ width: 150 }} />
        </div>
      </div>

      <div className="pos-layout">
        {/* 왼쪽: 검색 + 상품 */}
        <div className="pos-left">
          <div className="card">
            <div className="card-title">상품 검색</div>
            <input
              ref={searchRef}
              className="input input-lg"
              placeholder="상품명 입력..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
            {results.length > 0 && (
              <div className="pos-search-result" style={{ marginTop: 12 }}>
                {results.map(p => (
                  <div key={p.id} className="pos-product-card" onClick={() => addToCart(p)}>
                    <div className="pname">{p.name}</div>
                    <div className="pprice">₩{fmt(p.sale_price)}</div>
                    <div className="pstock">
                      재고 {p.stock}개 · {p.business}
                    </div>
                    {p.brand && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.brand}</div>}
                  </div>
                ))}
              </div>
            )}
            {query && results.length === 0 && (
              <div style={{ marginTop: 12, color: 'var(--muted)', fontSize: 13 }}>검색 결과 없음</div>
            )}
          </div>

          {/* 판매 설정 */}
          <div className="card">
            <div className="card-title">판매 설정</div>
            <div className="grid-3" style={{ gap: 12 }}>
              <div className="field">
                <label>판매경로</label>
                <select className="input" value={channel} onChange={e => setChannel(e.target.value)}>
                  {CHANNELS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>결제방식</label>
                <select className="input" value={payment} onChange={e => setPayment(e.target.value)}>
                  {PAYMENTS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="field">
                <label>메모</label>
                <input className="input" value={memo} onChange={e => setMemo(e.target.value)} placeholder="선택 입력" />
              </div>
            </div>
          </div>
        </div>

        {/* 오른쪽: 장바구니 */}
        <div className="pos-right">
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ margin: 0 }}>장바구니</div>
              {cart.length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setCart([])}>전체삭제</button>
              )}
            </div>

            <div className="pos-cart" style={{ flex: 1 }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0', fontSize: 13 }}>
                  상품을 검색해서 추가하세요
                </div>
              ) : cart.map(item => (
                <div key={item.product_id} className="cart-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cart-item-name" style={{ marginBottom: 4 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.business}</div>
                    <input
                      className="input"
                      style={{ width: 110, marginTop: 4, fontSize: 13, padding: '4px 8px' }}
                      value={item.sale_price.toLocaleString()}
                      onChange={e => setPriceOverride(item.product_id, e.target.value)}
                    />
                  </div>
                  <div className="cart-item-qty">
                    <button className="qty-btn" onClick={() => updateQty(item.product_id, -1)}>−</button>
                    <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 600 }}>{item.quantity}</span>
                    <button className="qty-btn" onClick={() => updateQty(item.product_id, 1)}>+</button>
                  </div>
                  <div style={{ minWidth: 80, textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: 'var(--accent)' }}>₩{fmt(item.sale_price * item.quantity)}</div>
                    <button
                      onClick={() => removeFromCart(item.product_id)}
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, marginTop: 2 }}
                    >삭제</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-total">
              <div className="total-row">
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>합계 ({cart.reduce((s,i) => s+i.quantity, 0)}개)</span>
                <span className="total-amount">₩{fmt(total)}</span>
              </div>
              <button
                className="btn btn-success btn-lg"
                style={{ width: '100%', fontSize: 16 }}
                onClick={() => setShowPayModal(true)}
                disabled={cart.length === 0}
              >
                결제 완료
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 결제 확인 모달 */}
      {showPayModal && (
        <div className="modal-bg" onClick={() => setShowPayModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>결제 확인</h2>
            <div style={{ marginBottom: 20 }}>
              {cart.map(i => (
                <div key={i.product_id} className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 14 }}>{i.name} × {i.quantity}</span>
                  <span style={{ fontWeight: 600 }}>₩{fmt(i.sale_price * i.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="flex-between" style={{ marginBottom: 8 }}>
              <span className="text-muted">판매경로</span><span>{channel}</span>
            </div>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <span className="text-muted">결제방식</span><span>{payment}</span>
            </div>
            <div className="flex-between" style={{ marginBottom: 24 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>최종 합계</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>₩{fmt(total)}</span>
            </div>
            <div className="flex gap-8">
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowPayModal(false)}>취소</button>
              <button className="btn btn-success" style={{ flex: 2 }} onClick={completeSale} disabled={loading}>
                {loading ? '처리 중...' : '결제 완료'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  )
}
