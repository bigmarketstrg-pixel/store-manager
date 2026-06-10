import { useState, useEffect, useRef } from 'react'
import { docApi } from '../api/client'
import { useToast } from '../hooks/useToast'
import dayjs from 'dayjs'

const DOC_TYPES = ['견적서', '납품서', '거래명세서']
const BUSINESSES = ['오아시스', '훌라']

export default function Documents() {
  const [docs, setDocs] = useState([])
  const [filterType, setFilterType] = useState('전체')
  const [filterBusiness, setFilterBusiness] = useState('전체')
  const [showModal, setShowModal] = useState(false)
  const [previewDoc, setPreviewDoc] = useState(null)
  const { toast, ToastContainer } = useToast()

  const load = async () => {
    try {
      const params = {}
      if (filterType !== '전체') params.doc_type = filterType
      if (filterBusiness !== '전체') params.business = filterBusiness
      const r = await docApi.list(params)
      setDocs(r.data)
    } catch { toast('불러오기 실패', 'error') }
  }

  useEffect(() => { load() }, [filterType, filterBusiness])

  const deleteDoc = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    try { await docApi.delete(id); toast('삭제 완료'); load() }
    catch { toast('삭제 실패', 'error') }
  }

  const openPreview = async (id) => {
    const r = await docApi.get(id)
    setPreviewDoc(r.data)
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>견적서 / 납품서 / 거래명세서</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ 새 문서</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex gap-8">
          <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 140 }}>
            {['전체', ...DOC_TYPES].map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="input" value={filterBusiness} onChange={e => setFilterBusiness(e.target.value)} style={{ width: 120 }}>
            {['전체', ...BUSINESSES].map(b => <option key={b}>{b}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>문서번호</th><th>구분</th><th>사업자</th><th>날짜</th><th>수신처</th><th className="num">합계</th><th>메모</th><th></th></tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>문서가 없습니다</td></tr>
              ) : docs.map(d => (
                <tr key={d.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{d.doc_no}</td>
                  <td><span className={`badge ${d.doc_type === '견적서' ? 'badge-blue' : d.doc_type === '납품서' ? 'badge-green' : 'badge-yellow'}`}>{d.doc_type}</span></td>
                  <td><span className="badge badge-purple">{d.business}</span></td>
                  <td style={{ fontSize: 12 }}>{d.doc_date}</td>
                  <td style={{ fontWeight: 500 }}>{d.recipient}</td>
                  <td className="num fw-600" style={{ color: 'var(--accent)' }}>₩{d.total?.toLocaleString()}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{d.memo}</td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-ghost btn-sm" onClick={() => openPreview(d.id)}>미리보기</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(d.id)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <DocModal
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); load(); toast('문서 저장 완료') }}
          toast={toast}
        />
      )}
      {previewDoc && (
        <DocPreview doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}
      <ToastContainer />
    </div>
  )
}

// ── 문서 작성 모달 ──────────────────────────────────────
function DocModal({ onClose, onSave, toast }) {
  const [form, setForm] = useState({
    doc_type: '견적서',
    business: '오아시스',
    doc_date: dayjs().format('YYYY-MM-DD'),
    recipient: '',
    memo: '',
  })
  const [items, setItems] = useState([
    { name: '', spec: '', qty: 1, price: 0 }
  ])
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const setItem = (i, k, v) => setItems(prev => prev.map((row, idx) => idx === i ? { ...row, [k]: v } : row))
  const addItem = () => setItems(p => [...p, { name: '', spec: '', qty: 1, price: 0 }])
  const removeItem = (i) => setItems(p => p.filter((_, idx) => idx !== i))

  const total = items.reduce((s, i) => s + (i.price * i.qty), 0)
  const fmt = n => n?.toLocaleString() || '0'

  const save = async () => {
    if (!form.recipient) { toast('수신처를 입력하세요', 'error'); return }
    const validItems = items.filter(i => i.name)
    if (validItems.length === 0) { toast('품목을 하나 이상 입력하세요', 'error'); return }
    try {
      await docApi.create({ ...form, total, items: validItems })
      onSave()
    } catch (err) { toast(err.response?.data?.detail || '저장 실패', 'error') }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 680 }} onClick={e => e.stopPropagation()}>
        <h2>새 문서 작성</h2>
        <div className="grid-2" style={{ gap: 12, marginBottom: 20 }}>
          <div className="field">
            <label>문서 종류</label>
            <select className="input" value={form.doc_type} onChange={e => set('doc_type', e.target.value)}>
              {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>사업자</label>
            <select className="input" value={form.business} onChange={e => set('business', e.target.value)}>
              {BUSINESSES.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="field">
            <label>날짜</label>
            <input className="input" type="date" value={form.doc_date} onChange={e => set('doc_date', e.target.value)} />
          </div>
          <div className="field">
            <label>수신처</label>
            <input className="input" value={form.recipient} onChange={e => set('recipient', e.target.value)} placeholder="업체명 / 고객명" />
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label>메모</label>
            <input className="input" value={form.memo} onChange={e => set('memo', e.target.value)} />
          </div>
        </div>

        {/* 품목 입력 */}
        <div style={{ marginBottom: 16 }}>
          <div className="flex-between" style={{ marginBottom: 8 }}>
            <div className="card-title" style={{ margin: 0 }}>품목</div>
            <button className="btn btn-ghost btn-sm" onClick={addItem}>+ 행 추가</button>
          </div>
          <table style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--muted)', fontSize: 11 }}>품목명</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--muted)', fontSize: 11 }}>규격</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--muted)', fontSize: 11, width: 60 }}>수량</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--muted)', fontSize: 11, width: 110 }}>단가</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--muted)', fontSize: 11, width: 110 }}>금액</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px 4px' }}>
                    <input className="input" style={{ padding: '5px 8px' }} value={item.name} onChange={e => setItem(i, 'name', e.target.value)} placeholder="품목명" />
                  </td>
                  <td style={{ padding: '4px 4px' }}>
                    <input className="input" style={{ padding: '5px 8px' }} value={item.spec} onChange={e => setItem(i, 'spec', e.target.value)} placeholder="규격" />
                  </td>
                  <td style={{ padding: '4px 4px' }}>
                    <input className="input" style={{ padding: '5px 8px', textAlign: 'center' }} type="number" min={1} value={item.qty} onChange={e => setItem(i, 'qty', +e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 4px' }}>
                    <input className="input" style={{ padding: '5px 8px', textAlign: 'right' }} type="number" value={item.price} onChange={e => setItem(i, 'price', +e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>
                    ₩{fmt(item.price * item.qty)}
                  </td>
                  <td>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>합계 </span>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>₩{fmt(total)}</span>
          </div>
        </div>

        <div className="flex gap-8">
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>취소</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={save}>저장</button>
        </div>
      </div>
    </div>
  )
}

// ── 미리보기 모달 ──────────────────────────────────────
function DocPreview({ doc, onClose }) {
  const printRef = useRef()
  const items = doc.items_json ? JSON.parse(doc.items_json) : []
  const fmt = n => n?.toLocaleString() || '0'

  const print = () => {
    const w = window.open('', '_blank')
    w.document.write(`
      <html><head><title>${doc.doc_type} ${doc.doc_no}</title>
      <style>
        body { font-family: 'Noto Sans KR', sans-serif; padding: 40px; color: #111; }
        h2 { text-align: center; font-size: 24px; margin-bottom: 8px; }
        .meta { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th { background: #f0f0f0; border: 1px solid #ccc; padding: 8px; text-align: center; }
        td { border: 1px solid #ccc; padding: 8px; }
        td.right { text-align: right; }
        td.center { text-align: center; }
        .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 16px; }
      </style></head><body>
      <h2>${doc.doc_type}</h2>
      <div class="meta">
        <span>문서번호: ${doc.doc_no}</span>
        <span>날짜: ${doc.doc_date}</span>
        <span>수신: ${doc.recipient}</span>
        <span>사업자: ${doc.business}</span>
      </div>
      <table>
        <thead><tr><th>품목</th><th>규격</th><th>수량</th><th>단가</th><th>금액</th></tr></thead>
        <tbody>
          ${items.map(i => `<tr>
            <td>${i.name}</td><td class="center">${i.spec || ''}</td>
            <td class="center">${i.qty}</td>
            <td class="right">₩${fmt(i.price)}</td>
            <td class="right">₩${fmt(i.price * i.qty)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="total">합계: ₩${fmt(doc.total)}</div>
      ${doc.memo ? `<p style="margin-top:16px;font-size:13px;color:#666">메모: ${doc.memo}</p>` : ''}
      </body></html>
    `)
    w.document.close()
    w.print()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 620 }} onClick={e => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>{doc.doc_type} — {doc.doc_no}</h2>
          <button className="btn btn-primary btn-sm" onClick={print}>🖨 인쇄</button>
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 20, fontSize: 13 }}>
          <div className="flex gap-16" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
            <span><span className="text-muted">사업자:</span> {doc.business}</span>
            <span><span className="text-muted">날짜:</span> {doc.doc_date}</span>
            <span><span className="text-muted">수신:</span> {doc.recipient}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>품목</th><th>규격</th><th>수량</th><th className="num">단가</th><th className="num">금액</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td>{item.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{item.spec}</td>
                  <td className="center">{item.qty}</td>
                  <td className="num">₩{fmt(item.price)}</td>
                  <td className="num fw-600">₩{fmt(item.price * item.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <span className="text-muted" style={{ fontSize: 12 }}>합계 </span>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>₩{fmt(doc.total)}</span>
          </div>
          {doc.memo && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>메모: {doc.memo}</div>}
        </div>
        <div style={{ marginTop: 20, textAlign: 'right' }}>
          <button className="btn btn-ghost" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
