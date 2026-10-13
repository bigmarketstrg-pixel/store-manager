import { useEffect, useRef, useState } from 'react'
import { Save, X } from 'lucide-react'
import { saleApi } from '../api/client'
import './SalesEditModal.css'

const fields = ['sale_date', 'product_name', 'business', 'category', 'subcategory', 'brand',
  'quantity', 'cost_price', 'sale_price', 'channel', 'payment', 'memo']
const businesses = ['다담', '훌라', '오아시스', '이 외']
const options = { channel: ['매장', '쿠팡', '네이버', '카카오', '스마트스토어', '기타'],
  payment: ['현금', '카드', '계좌이체', '기타'] }
const fmt = value => Number(value || 0).toLocaleString('ko-KR')

export default function SalesEditModal({ sale, onClose, onSave }) {
  const [form, setForm] = useState(Object.fromEntries(fields.map(key => [key, sale[key] ?? ''])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef(null)
  const busy = useRef(false)
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    const escape = event => { if (event.key === 'Escape' && !busy.current) onClose() }
    document.addEventListener('keydown', escape)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', escape)
      previous?.focus()
    }
  }, [onClose])
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const save = async event => {
    event.preventDefault()
    if (busy.current) return
    busy.current = true
    setSaving(true)
    setError('')
    try {
      await saleApi.update(sale.id, { ...form, quantity: Number(form.quantity),
        cost_price: Number(form.cost_price), sale_price: Number(form.sale_price) })
      onSave()
    } catch (err) {
      setError(err.response?.data?.detail || '판매 내역 수정에 실패했습니다.')
    } finally { busy.current = false; setSaving(false) }
  }
  const trapFocus = event => {
    if (event.key !== 'Tab') return
    const items = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')]
    const first = items[0], last = items[items.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      event.preventDefault(); last?.focus()
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
      event.preventDefault(); first?.focus()
    }
  }
  const total = Number(form.quantity) * Number(form.sale_price)
  const profit = total - Number(form.quantity) * Number(form.cost_price)
  return <div className="modal-bg" onClick={event => {
    if (event.target === event.currentTarget && !saving) onClose()
  }}>
    <div className="modal sale-edit" role="dialog" aria-modal="true" aria-labelledby="sale-edit-title"
      tabIndex={-1} ref={dialog} onKeyDown={trapFocus}>
      <div className="sale-edit-heading"><h2 id="sale-edit-title">판매 내역 수정</h2>
        <button className="btn btn-ghost" title="닫기" aria-label="닫기" disabled={saving} onClick={onClose}><X size={18} /></button>
      </div>
      <div className="sale-edit-number">{sale.transaction_no}</div>
      <form onSubmit={save}>
        <fieldset disabled={saving} className="sale-edit-fields">
          <label>판매일<input className="input" type="date" required value={form.sale_date} onChange={e => set('sale_date', e.target.value)} /></label>
          <label>사업자<select className="input" value={form.business} onChange={e => set('business', e.target.value)}>
            {businesses.map(name => <option key={name}>{name}</option>)}
          </select></label>
          <label className="sale-edit-wide">상품명<input className="input" required maxLength={200} value={form.product_name} onChange={e => set('product_name', e.target.value)} /></label>
          {[['category', '대분류'], ['subcategory', '중분류'], ['brand', '브랜드']].map(([key, label]) =>
            <label key={key}>{label}<input className="input" maxLength={100} value={form[key]} onChange={e => set(key, e.target.value)} /></label>)}
          {[['quantity', '수량', 1], ['cost_price', '원가단가', 0], ['sale_price', '판매가', 0]].map(([key, label, min]) =>
            <label key={key}>{label}<input className="input" type="number" min={min} max={2147483647} step={1} required value={form[key]} onChange={e => set(key, e.target.value)} /></label>)}
          {[['channel', '판매경로'], ['payment', '결제방식']].map(([key, label]) =>
            <label key={key}>{label}<select className="input" value={form[key]} onChange={e => set(key, e.target.value)}>
              {[...new Set([form[key], ...options[key]])].map(value => <option key={value} value={value}>{value || '미지정'}</option>)}
            </select></label>)}
          <label className="sale-edit-wide">메모<textarea className="input" rows={2} value={form.memo} onChange={e => set('memo', e.target.value)} /></label>
        </fieldset>
        <dl className="sale-edit-totals"><div><dt>매출</dt><dd>₩{fmt(total)}</dd></div><div><dt>순수익</dt><dd>₩{fmt(profit)}</dd></div></dl>
        {error && <p role="alert" className="sale-edit-error">{error}</p>}
        <div className="sale-edit-actions">
          <button className="btn btn-ghost" type="button" disabled={saving} onClick={onClose}>취소</button>
          <button className="btn btn-primary" type="submit" disabled={saving}><Save size={16} />{saving ? '저장 중...' : '수정 저장'}</button>
        </div>
      </form>
    </div>
  </div>
}
