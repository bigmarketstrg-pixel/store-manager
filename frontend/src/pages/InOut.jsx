import { Fragment, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { productApi } from '../api/client'
import { useToast } from '../hooks/useToast.jsx'

const BUSINESSES = ['전체', '다담', '훌라', '오아시스', '이 외']

export default function InOut() {
  const [records, setRecords] = useState([])
  const [business, setBusiness] = useState('전체')
  const [start, setStart] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [end, setEnd] = useState(dayjs().format('YYYY-MM-DD'))
  const [loading, setLoading] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [expandedKeys, setExpandedKeys] = useState({})
  const { toast, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const params = { start, end }
      if (business !== '전체') params.business = business
      const r = await productApi.history(params)
      setRecords(r.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const groupedRecords = Array.from(records.reduce((map, record) => {
    const key = `${record.record_date}|${record.transaction_no || record.id}|${record.io_type}`
    const group = map.get(key)
    if (group) {
      group.items.push(record)
      group.quantity += record.quantity || 0
      return map
    }
    map.set(key, {
      key,
      record_date: record.record_date,
      transaction_no: record.transaction_no,
      io_type: record.io_type,
      items: [record],
      quantity: record.quantity || 0,
    })
    return map
  }, new Map()).values())

  const sameValue = (items, key) => {
    const values = [...new Set(items.map(item => item[key]).filter(Boolean))]
    return values.length === 1 ? values[0] : values.length > 1 ? '여러 항목' : ''
  }
  const toggleExpanded = (key) => {
    setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0 }}>입출기록</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          <input type="date" className="input" value={start} onChange={e => setStart(e.target.value)} style={{ width: 150 }} />
          <span style={{ alignSelf: 'center', color: 'var(--muted)' }}>~</span>
          <input type="date" className="input" value={end} onChange={e => setEnd(e.target.value)} style={{ width: 150 }} />
          <select className="input" value={business} onChange={e => setBusiness(e.target.value)} style={{ width: 110 }}>
            {BUSINESSES.map(b => <option key={b}>{b}</option>)}
          </select>
          <button className="btn btn-primary" onClick={load}>조회</button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 52 }}></th><th>날짜</th><th>거래번호</th><th>구분</th><th>품목</th>
                <th>사업자</th><th>대분류</th><th>브랜드</th>
                <th className="num">품목수</th><th className="num">총수량</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>불러오는 중...</td></tr>
              ) : groupedRecords.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>입출기록이 없습니다</td></tr>
              ) : groupedRecords.map(group => {
                const first = group.items[0]
                const itemCount = group.items.length
                const isExpanded = !!expandedKeys[group.key]
                const productLabel = itemCount === 1 ? first.product_name : `${first.product_name} 외 ${itemCount - 1}개`
                return (
                  <Fragment key={group.key}>
                    <tr
                      key={group.key}
                      onDoubleClick={() => setSelectedGroup(group)}
                      style={{
                        cursor: 'pointer',
                        background: itemCount > 1 ? 'rgba(79,142,247,.06)' : undefined,
                      }}
                    >
                      <td className="center">
                        {itemCount > 1 ? (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={(e) => { e.stopPropagation(); toggleExpanded(group.key) }}
                            style={{ width: 30, height: 28, padding: 0, fontWeight: 700 }}
                            title={isExpanded ? '접기' : '펼치기'}
                          >
                            {isExpanded ? '-' : '+'}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>-</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>{group.record_date}</td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{group.transaction_no}</td>
                      <td>
                        <span className={`badge ${group.io_type === '입고' ? 'badge-green' : 'badge-red'}`}>{group.io_type}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{productLabel}</td>
                      <td><span className="badge badge-blue">{sameValue(group.items, 'business')}</span></td>
                      <td style={{ fontSize: 12 }}>{sameValue(group.items, 'category')}</td>
                      <td style={{ fontSize: 12 }}>{sameValue(group.items, 'brand')}</td>
                      <td className="num">{itemCount}</td>
                      <td className="num">{group.quantity}</td>
                    </tr>
                    {isExpanded && group.items.map((item, index) => (
                      <tr
                        key={`${group.key}-${item.id}`}
                        onDoubleClick={() => setSelectedGroup(group)}
                        style={{ background: '#fafafa', cursor: 'pointer' }}
                      >
                        <td className="center" style={{ color: 'var(--muted)' }}>{index === 0 ? '└' : ''}</td>
                        <td></td>
                        <td style={{ fontSize: 11, color: 'var(--muted)' }}></td>
                        <td></td>
                        <td style={{ fontWeight: 500, paddingLeft: 28 }}>{item.product_name}</td>
                        <td><span className="badge badge-blue">{item.business}</span></td>
                        <td style={{ fontSize: 12 }}>{item.category}</td>
                        <td style={{ fontSize: 12 }}>{item.brand}</td>
                        <td className="num">1</td>
                        <td className="num">{item.quantity}</td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedGroup && (
        <HistoryGroupModal
          group={selectedGroup}
          onClose={() => setSelectedGroup(null)}
          onSave={(updatedRows) => {
            setRecords(prev => prev.map(record => updatedRows.find(updated => updated.id === record.id) || record))
            setSelectedGroup(null)
            toast('입출기록 수정 완료')
          }}
          toast={toast}
        />
      )}
      <ToastContainer />
    </div>
  )
}

function HistoryGroupModal({ group, onClose, onSave, toast }) {
  const [forms, setForms] = useState(group.items.map(record => ({
    id: record.id,
    record_date: record.record_date || '',
    transaction_no: record.transaction_no || '',
    io_type: record.io_type || '입고',
    product_name: record.product_name || '',
    business: record.business || '다담',
    category: record.category || '',
    subcategory: record.subcategory || '',
    brand: record.brand || '',
    quantity: record.quantity || 0,
    cost_price: record.cost_price || 0,
    memo: record.memo || '',
  })))
  const set = (index, key, value) => {
    setForms(prev => prev.map((form, i) => i === index ? { ...form, [key]: value } : form))
  }

  const save = async () => {
    try {
      const updatedRows = []
      for (const form of forms) {
        const payload = {
          ...form,
          quantity: Number(form.quantity) || 0,
          cost_price: Number(form.cost_price) || 0,
        }
        delete payload.id
        const r = await productApi.updateHistory(form.id, payload)
        updatedRows.push(r.data)
      }
      onSave(updatedRows)
    } catch (err) {
      toast(err.response?.data?.detail || '입출기록 수정 실패', 'error')
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 'min(1180px, 96vw)' }} onClick={e => e.stopPropagation()}>
        <h2>입출기록 상세</h2>
        <div style={{ marginBottom: 16, color: 'var(--muted)', fontSize: 13 }}>
          {group.record_date} · {group.transaction_no} · {group.items.length}개 품목
        </div>

        <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
          <table style={{ minWidth: 1080, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 120 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 86 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 220 }} />
            </colgroup>
            <thead>
              <tr>
                <th>날짜</th><th>거래번호</th><th>구분</th><th>상품명</th><th>사업자</th>
                <th>대분류</th><th>중분류</th><th>브랜드</th>
                <th className="num">수량</th><th className="num">단가</th><th>메모</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((form, index) => (
                <tr key={form.id}>
                  <td><input className="input" type="date" value={form.record_date} onChange={e => set(index, 'record_date', e.target.value)} /></td>
                  <td><input className="input" value={form.transaction_no} onChange={e => set(index, 'transaction_no', e.target.value)} /></td>
                  <td>
                    <select className="input" value={form.io_type} onChange={e => set(index, 'io_type', e.target.value)}>
                      <option>입고</option>
                      <option>출고</option>
                    </select>
                  </td>
                  <td><input className="input" value={form.product_name} onChange={e => set(index, 'product_name', e.target.value)} /></td>
                  <td>
                    <select className="input" value={form.business} onChange={e => set(index, 'business', e.target.value)}>
                      {BUSINESSES.filter(b => b !== '전체').map(b => <option key={b}>{b}</option>)}
                    </select>
                  </td>
                  <td><input className="input" value={form.category} onChange={e => set(index, 'category', e.target.value)} /></td>
                  <td><input className="input" value={form.subcategory} onChange={e => set(index, 'subcategory', e.target.value)} /></td>
                  <td><input className="input" value={form.brand} onChange={e => set(index, 'brand', e.target.value)} /></td>
                  <td><input className="input" type="number" value={form.quantity} onChange={e => set(index, 'quantity', e.target.value)} style={{ textAlign: 'right' }} /></td>
                  <td><input className="input" type="number" value={form.cost_price} onChange={e => set(index, 'cost_price', e.target.value)} style={{ textAlign: 'right' }} /></td>
                  <td><input className="input" value={form.memo} onChange={e => set(index, 'memo', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-8 mt-24">
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>닫기</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={save}>수정 저장</button>
        </div>
      </div>
    </div>
  )
}
