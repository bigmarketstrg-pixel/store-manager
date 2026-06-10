import { useState, useEffect } from 'react'
import { docApi } from '../api/client'
import { useToast } from '../hooks/useToast.jsx'
import dayjs from 'dayjs'

const DOC_TYPES = ['견적서', '납품서', '거래명세서']
const BUSINESSES = ['오아시스', '훌라']

const BUSINESS_PROFILES = {
  오아시스: {
    name: '오아시스뮤직',
    representative: '김 광 수',
    bizNo: '898-05-01658',
    address: '대전 서구 갈마동 1426',
    account: '새마을금고 9003-3031-3588-0 김광수',
    phone: '010-4427-2209',
    fax: '0425233836',
    email: 'kks3837@naver.com',
    managerEmail: 'kks3837@naver.com',
    logo: '/doc-assets/oasis-logo.png',
    stamp: '/doc-assets/oasis-stamp.png',
  },
  훌라: {
    name: '에이씨씨(훌라우쿨렐레)',
    representative: '유 영 선',
    bizNo: '305-28-85306',
    address: '대전 서구 갈마동 1426',
    account: '우리은행 1005-602-035478 유영선',
    phone: '070-4235-6911',
    fax: '042-632-6445',
    email: 'tpyou@hanmail.net',
    managerEmail: 'hulauke@naver.com',
    logo: '/doc-assets/hula-logo.jpg',
    stamp: '/doc-assets/hula-stamp.png',
  },
}

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const fmtWon = n => Math.round(Number(n) || 0).toLocaleString('ko-KR')

function getBusinessProfile(business) {
  if (BUSINESS_PROFILES[business]) return BUSINESS_PROFILES[business]
  if (business?.includes('훌라')) return BUSINESS_PROFILES.훌라
  return BUSINESS_PROFILES.오아시스
}

function formatKoreanDate(date) {
  if (!date) return ''
  const [y, m, d] = String(date).split('-')
  if (!y || !m || !d) return String(date)
  return `${y}년 ${m}월 ${d}일`
}

function numToKorean(n) {
  n = Math.round(Number(n) || 0)
  if (n === 0) return '영 원정'
  const nums = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
  const units = ['', '십', '백', '천']
  const bigUnits = ['', '만', '억', '조']
  let result = ''
  let big = 0

  while (n > 0) {
    const chunk = n % 10000
    n = Math.floor(n / 10000)
    if (chunk > 0) {
      let part = ''
      let rest = chunk
      for (let i = 0; i < 4; i += 1) {
        const digit = rest % 10
        rest = Math.floor(rest / 10)
        if (digit > 0) part = `${nums[digit]}${units[i]}${part}`
      }
      result = `${part}${bigUnits[big]}${result}`
    }
    big += 1
  }

  return `${result}원정`
}

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
  const items = doc.items_json ? JSON.parse(doc.items_json) : []
  const fmt = n => n?.toLocaleString() || '0'

  const print = () => {
    const profile = getBusinessProfile(doc.business)
    const assetBase = window.location.origin
    const printItems = [...items]
    while (printItems.length < 10) printItems.push({ name: '', spec: '', qty: '', price: '' })

    const itemRows = printItems.slice(0, 10).map((item, idx) => {
      const qty = Number(item.qty) || 0
      const price = Number(item.price) || 0
      const amount = qty && price ? qty * price : 0
      return `<tr>
        <td class="cen">${idx + 1}</td>
        <td>${escapeHtml(item.name || '')}</td>
        <td class="cen">${escapeHtml(item.spec || '')}</td>
        <td class="num">${qty ? fmtWon(qty) : ''}</td>
        <td class="num">${price ? fmtWon(price) : ''}</td>
        <td class="num">${amount ? fmtWon(amount) : '-'}</td>
        <td></td>
      </tr>`
    }).join('')

    const w = window.open('', '_blank')
    if (!w) {
      alert('팝업이 차단되어 인쇄 창을 열 수 없습니다.')
      return
    }

    w.document.write(`
      <!doctype html>
      <html lang="ko"><head><meta charset="UTF-8"><title>${escapeHtml(doc.doc_type)} ${escapeHtml(doc.doc_no)}</title>
      <style>
        @page { size: A4; margin: 0; }
        * { box-sizing: border-box; }
        body {
          font-family: 'Noto Sans KR', 'Malgun Gothic', Arial, sans-serif;
          margin: 0;
          color: #222;
          background: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .doc {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          padding: 15mm 15mm 10mm;
          background: #fff;
          font-size: 9pt;
          position: relative;
        }
        .doc-logo { text-align: center; margin-bottom: 4mm; }
        .doc-logo img { max-height: 28pt; max-width: 150pt; object-fit: contain; }
        .doc-title { text-align: center; font-size: 18pt; font-weight: 700; letter-spacing: .4em; margin-bottom: 6mm; }
        .doc-top { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-bottom: 4mm; }
        .doc-left { padding-right: 8mm; }
        table { width: 100%; border-collapse: collapse; }
        .doc-left td { padding: 4pt 0; font-size: 9pt; vertical-align: top; }
        .doc-left td:first-child { color: #555; width: 55pt; white-space: nowrap; }
        .doc-right { border: 1pt solid #aaa; position: relative; }
        .doc-right td { padding: 3.5pt 5pt; font-size: 8.5pt; border-bottom: .5pt solid #ccc; vertical-align: middle; }
        .doc-right tr:last-child td { border-bottom: 0; }
        .label-cell { background: #f5f5f5; color: #444; white-space: nowrap; border-right: .5pt solid #ccc; width: 55pt; }
        .val-cell { color: #222; }
        .stamp-wrap { position: absolute; right: 5pt; top: 50%; transform: translateY(-50%); }
        .stamp-wrap img { height: 44pt; opacity: .85; }
        .total-box { border: 1pt solid #aaa; display: grid; grid-template-columns: auto 1fr auto; margin-bottom: 4mm; }
        .total-box .lbl1 { padding: 4pt 8pt; border-right: .5pt solid #ccc; font-size: 8pt; color: #555; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 1pt; white-space: nowrap; }
        .total-box .lbl1 small { font-size: 7pt; }
        .total-won { display: flex; align-items: center; justify-content: center; font-size: 15pt; font-weight: 700; letter-spacing: .05em; }
        .total-krw { padding: 4pt 10pt; border-left: .5pt solid #ccc; font-size: 9pt; display: flex; align-items: center; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .doc-provide { font-size: 8.5pt; color: #333; margin-bottom: 3mm; }
        .doc-items { border: 1pt solid #aaa; margin-bottom: 4mm; }
        .doc-items th { background: #f5f5f5; padding: 4pt 5pt; font-size: 8.5pt; font-weight: 600; border-bottom: 1pt solid #aaa; text-align: center; }
        .doc-items th.l { text-align: left; }
        .doc-items td { padding: 3.5pt 5pt; border-bottom: .5pt solid #e0e0e0; font-size: 8.5pt; vertical-align: middle; height: 22pt; }
        .doc-items tbody tr:last-child td { border-bottom: 0; }
        .doc-items tfoot td { padding: 4pt 5pt; border-top: 1pt solid #aaa; font-size: 8.5pt; font-weight: 600; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .cen { text-align: center; }
        .doc-memo { border-top: 1pt solid #ddd; padding-top: 3mm; font-size: 8pt; color: #444; white-space: pre-wrap; }
      </style></head><body>
      <div class="doc">
        <div class="doc-logo"><img src="${assetBase}${profile.logo}" alt="${escapeHtml(profile.name)} 로고" /></div>
        <div class="doc-title">${escapeHtml(doc.doc_type)}</div>

        <div class="doc-top">
          <div class="doc-left">
            <table>
              <tbody>
                <tr><td>날&nbsp;&nbsp;짜 :</td><td>${escapeHtml(formatKoreanDate(doc.doc_date))}</td></tr>
                <tr><td>수&nbsp;&nbsp;신 :</td><td>${escapeHtml(doc.recipient)}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="doc-right">
            <table>
              <tbody>
                <tr><td class="label-cell">사업장소재지</td><td class="val-cell" colspan="3">${escapeHtml(profile.address)}</td></tr>
                <tr><td class="label-cell">상호명</td><td class="val-cell">${escapeHtml(profile.name)}</td><td class="val-cell">대표 ${escapeHtml(profile.representative)}</td><td class="val-cell">(인)</td></tr>
                <tr><td class="label-cell">사업자번호</td><td class="val-cell" colspan="3">${escapeHtml(profile.bizNo)}</td></tr>
                <tr><td class="label-cell">거래계좌</td><td class="val-cell" colspan="3">${escapeHtml(profile.account)}</td></tr>
                <tr><td class="label-cell" rowspan="2">E-mail</td><td class="label-cell">대표자</td><td class="val-cell" colspan="2">${escapeHtml(profile.email)}</td></tr>
                <tr><td class="label-cell">담당자</td><td class="val-cell" colspan="2">${escapeHtml(profile.managerEmail)}</td></tr>
                <tr><td class="label-cell">연락처</td><td class="val-cell">${escapeHtml(profile.phone)}</td><td class="val-cell" colspan="2">FAX&nbsp;&nbsp;${escapeHtml(profile.fax)}</td></tr>
              </tbody>
            </table>
            <div class="stamp-wrap"><img src="${assetBase}${profile.stamp}" alt="도장" /></div>
          </div>
        </div>

        <div class="doc-provide">아래와 같이 공급합니다</div>

        <div class="total-box">
          <div class="lbl1">합계금액<br><small>(공급가액+세액)</small></div>
          <div class="total-won">${escapeHtml(numToKorean(doc.total))}</div>
          <div class="total-krw">(₩${fmtWon(doc.total)})</div>
        </div>

        <div class="doc-items">
          <table>
            <thead>
              <tr>
                <th style="width:22pt;">No.</th>
                <th class="l" style="min-width:80pt;">품명</th>
                <th style="width:48pt;">규격</th>
                <th style="width:30pt;">수량</th>
                <th style="width:60pt;">단가</th>
                <th style="width:70pt;">금액</th>
                <th style="width:55pt;">비고</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
            <tfoot>
              <tr>
                <td colspan="5" style="text-align:center;">합&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;계</td>
                <td class="num">${fmtWon(doc.total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="doc-memo">${escapeHtml(doc.memo || '※ 부가세 및 택배비 포함 가격입니다.')}</div>
      </div>
      </body></html>
    `)
    w.document.close()
    setTimeout(() => {
      w.focus()
      w.print()
    }, 250)
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
