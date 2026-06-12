import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { productApi, wholesaleApi } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast.jsx'

const STATUSES = ['전체', '미수', '일부입금', '완납']

export default function Wholesale() {
  const { user } = useAuth()
  const { toast, ToastContainer } = useToast()
  const searchRef = useRef()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [cart, setCart] = useState([])
  const [dealerName, setDealerName] = useState('')
  const [outboundDate, setOutboundDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [paidAmount, setPaidAmount] = useState(0)
  const [memo, setMemo] = useState('')
  const [records, setRecords] = useState([])
  const [start, setStart] = useState(dayjs().startOf('month').format('YYYY-MM-DD'))
  const [end, setEnd] = useState(dayjs().endOf('month').format('YYYY-MM-DD'))
  const [dealerFilter, setDealerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('전체')
  const [loading, setLoading] = useState(false)

  const isAdmin = user?.role === 'admin'
  const total = cart.reduce((sum, item) => sum + item.sale_price * item.quantity, 0)
  const balance = Math.max(total - paidAmount, 0)
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

  const load = async () => {
    setLoading(true)
    try {
      const params = { start, end }
      if (dealerFilter.trim()) params.dealer_name = dealerFilter.trim()
      if (statusFilter !== '전체') params.payment_status_filter = statusFilter
      const r = await wholesaleApi.list(params)
      setRecords(r.data)
    } catch (err) {
      toast(err.response?.data?.detail || '도매 출고 내역을 불러오지 못했습니다.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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
        brand: product.brand,
        sale_price: product.sale_price,
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

  const setPrice = (productId, value) => {
    const price = parseInt(String(value).replace(/,/g, ''), 10)
    if (Number.isNaN(price)) return
    setCart(prev => prev.map(item => item.product_id === productId ? { ...item, sale_price: price } : item))
  }

  const save = async () => {
    if (!dealerName.trim()) {
      toast('도매처명을 입력해주세요.', 'error')
      return
    }
    if (cart.length === 0) {
      toast('출고할 상품을 추가해주세요.', 'error')
      return
    }
    try {
      const r = await wholesaleApi.create({
        outbound_date: outboundDate,
        dealer_name: dealerName.trim(),
        paid_amount: Math.min(Number(paidAmount || 0), total),
        memo,
        items: cart.map(item => ({
          product_id: item.product_id,
          sale_price: item.sale_price,
          quantity: item.quantity,
        })),
      })
      setRecords(prev => [r.data, ...prev])
      setCart([])
      setPaidAmount(0)
      setMemo('')
      toast('도매 출고 등록 완료')
      searchRef.current?.focus()
    } catch (err) {
      toast(err.response?.data?.detail || '도매 출고 등록 실패', 'error')
    }
  }

  const updatePayment = async (record) => {
    const value = prompt('입금액을 입력하세요.', String(record.paid_amount || 0))
    if (value === null) return
    const paid = parseInt(value.replace(/,/g, ''), 10)
    if (Number.isNaN(paid) || paid < 0) {
      toast('입금액을 숫자로 입력해주세요.', 'error')
      return
    }
    try {
      const r = await wholesaleApi.update(record.id, { paid_amount: paid })
      setRecords(prev => prev.map(item => item.id === record.id ? r.data : item))
      toast('입금액 수정 완료')
    } catch (err) {
      toast(err.response?.data?.detail || '입금액 수정 실패', 'error')
    }
  }

  const deleteRecord = async (record) => {
    if (!confirm('삭제하면 출고 수량이 재고로 복구됩니다. 삭제하시겠습니까?')) return
    try {
      await wholesaleApi.delete(record.id)
      setRecords(prev => prev.filter(item => item.id !== record.id))
      toast('삭제 완료')
    } catch (err) {
      toast(err.response?.data?.detail || '삭제 실패', 'error')
    }
  }

  const summaryTotal = records.reduce((sum, record) => sum + record.total, 0)
  const summaryPaid = records.reduce((sum, record) => sum + record.paid_amount, 0)
  const summaryBalance = records.reduce((sum, record) => sum + record.balance, 0)

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>도매처 출고 관리</h1>
      </div>

      <div className="pos-layout" style={{ marginBottom: 20 }}>
        <div className="pos-left">
          <div className="card">
            <div className="card-title">출고 정보</div>
            <div className="grid-3" style={{ gap: 12 }}>
              <div className="field">
                <label>출고일</label>
                <input className="input" type="date" value={outboundDate} onChange={e => setOutboundDate(e.target.value)} />
              </div>
              <div className="field">
                <label>도매처</label>
                <input className="input" value={dealerName} onChange={e => setDealerName(e.target.value)} placeholder="도매처명" />
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
            />
            {results.length > 0 && (
              <div className="pos-search-result" style={{ marginTop: 12 }}>
                {results.map(product => (
                  <div key={product.id} className="pos-product-card" onClick={() => addToCart(product)}>
                    <div className="pname">{product.name}</div>
                    <div className="pprice">₩{fmt(product.sale_price)}</div>
                    <div className="pstock">재고 {product.stock}개 · {product.business}</div>
                    {product.brand && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{product.brand}</div>}
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
                    <input className="input" style={{ width: 110, marginTop: 4, padding: '4px 8px' }} value={fmt(item.sale_price)} onChange={e => setPrice(item.product_id, e.target.value)} />
                  </div>
                  <div className="cart-item-qty">
                    <button className="qty-btn" onClick={() => updateQty(item.product_id, -1)}>−</button>
                    <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 600 }}>{item.quantity}</span>
                    <button className="qty-btn" onClick={() => updateQty(item.product_id, 1)}>+</button>
                  </div>
                  <div style={{ minWidth: 80, textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: 'var(--accent)' }}>₩{fmt(item.sale_price * item.quantity)}</div>
                    <button onClick={() => setCart(prev => prev.filter(p => p.product_id !== item.product_id))} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="cart-total">
              <div className="total-row"><span className="text-muted">출고 합계</span><span className="total-amount">₩{fmt(total)}</span></div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>입금액</label>
                <input className="input" type="number" value={paidAmount} onChange={e => setPaidAmount(+e.target.value)} />
              </div>
              <div className="total-row"><span className="text-muted">미수금</span><span style={{ color: balance ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>₩{fmt(balance)}</span></div>
              <button className="btn btn-success btn-lg" style={{ width: '100%' }} onClick={save} disabled={cart.length === 0}>도매 출고 등록</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          <input className="input" type="date" value={start} onChange={e => setStart(e.target.value)} style={{ width: 150 }} />
          <span style={{ alignSelf: 'center', color: 'var(--muted)' }}>~</span>
          <input className="input" type="date" value={end} onChange={e => setEnd(e.target.value)} style={{ width: 150 }} />
          <input className="input" value={dealerFilter} onChange={e => setDealerFilter(e.target.value)} placeholder="도매처 검색" style={{ width: 170 }} />
          <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 120 }}>
            {STATUSES.map(status => <option key={status}>{status}</option>)}
          </select>
          <button className="btn btn-primary" onClick={load}>조회</button>
        </div>
      </div>

      <div style={{ marginBottom: 12, color: 'var(--muted)', fontSize: 13 }}>
        총 {records.length}건 · 출고 <span style={{ color: 'var(--accent)', fontWeight: 700 }}>₩{fmt(summaryTotal)}</span>
        {' '}· 입금 <span style={{ color: 'var(--green)', fontWeight: 700 }}>₩{fmt(summaryPaid)}</span>
        {' '}· 미수 <span style={{ color: summaryBalance ? 'var(--red)' : 'var(--muted)', fontWeight: 700 }}>₩{fmt(summaryBalance)}</span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>출고일</th><th>번호</th><th>도매처</th><th>품목</th>
                <th className="num">출고액</th><th className="num">입금액</th><th className="num">미수금</th>
                <th>상태</th><th>메모</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>불러오는 중...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>도매 출고 기록이 없습니다</td></tr>
              ) : records.map(record => (
                <tr key={record.id}>
                  <td style={{ fontSize: 12 }}>{record.outbound_date}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{record.transaction_no}</td>
                  <td style={{ fontWeight: 600 }}>{record.dealer_name}</td>
                  <td style={{ minWidth: 220 }}>
                    {record.items.map(item => (
                      <div key={item.id} style={{ fontSize: 12 }}>
                        {item.product_name} × {item.quantity}
                      </div>
                    ))}
                  </td>
                  <td className="num fw-600">₩{fmt(record.total)}</td>
                  <td className="num">₩{fmt(record.paid_amount)}</td>
                  <td className="num" style={{ color: record.balance ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>₩{fmt(record.balance)}</td>
                  <td><span className={`badge ${record.payment_status === '완납' ? 'badge-green' : record.payment_status === '일부입금' ? 'badge-yellow' : 'badge-red'}`}>{record.payment_status}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{record.memo}</td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-ghost btn-sm" onClick={() => updatePayment(record)}>입금수정</button>
                      {isAdmin && <button className="btn btn-danger btn-sm" onClick={() => deleteRecord(record)}>삭제</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ToastContainer />
    </div>
  )
}
