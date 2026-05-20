'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const PRODUCT_TYPES = ['B/R로라','M/R로라','헤드드럼','2열체인로라','B/R(P)로라','케리어로라','리턴로라','테일드럼','B/R로라ALLSUS','1열체인로라','브라케트','샤푸트','가이드로라','고무코팅','기타']

function calcItem(item) {
  const mat = (item.parts||[]).reduce((s,p) => s+(Number(p.qty)||0)*(Number(p.unit_price)||0), 0)
  const lab = Number(item.labor_cost)||0   // 개당 인건비
  const unitCost = mat + lab               // 개당 총원가
  const qty = Number(item.quantity)||1
  const amount = unitCost * qty            // 품목단가 (수량 × 개당총원가)
  return { mat, lab, unitCost, amount }
}

let _itemId=1, _partId=1

// ── 공통 검색 드롭다운 컴포넌트 ──────────────────────
function SearchDropdown({ value, onChange, options, placeholder, width = 'w-44' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = options.filter(o =>
    !query || (typeof o === 'string' ? o : o.label)?.toLowerCase().includes(query.toLowerCase())
  )

  const displayVal = value
    ? (options.find(o => (typeof o === 'string' ? o : o.value) === value))
      ? (typeof options[0] === 'string' ? value : options.find(o=>o.value===value)?.label || value)
      : value
    : ''

  function select(opt) {
    const val = typeof opt === 'string' ? opt : opt.value
    onChange(val)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className={`relative ${width}`} ref={ref}>
      <div className={`flex items-center border rounded-lg overflow-hidden bg-white ${open ? 'border-gray-400' : 'border-gray-200'}`}>
        <input
          value={open ? query : displayVal}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setQuery(''); setOpen(true) }}
          placeholder={placeholder}
          className="flex-1 px-3 py-1.5 text-sm focus:outline-none bg-transparent min-w-0"
        />
        {value && (
          <button onClick={e => { e.stopPropagation(); onChange(''); setQuery(''); }}
            className="px-1.5 text-gray-300 hover:text-gray-500 text-base leading-none shrink-0">×</button>
        )}
        <button onClick={() => setOpen(v=>!v)}
          className="px-2 py-1.5 text-gray-400 border-l border-gray-200 text-xs shrink-0">{open?'▲':'▼'}</button>
      </div>
      {open && (
        <div className="absolute top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-52 overflow-y-auto min-w-full">
          {filtered.length ? filtered.map((opt, i) => {
            const val = typeof opt==='string' ? opt : opt.value
            const label = typeof opt==='string' ? opt : opt.label
            return (
              <div key={i} onClick={() => select(opt)}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${value===val?'bg-blue-50 text-blue-700 font-medium':'text-gray-700'}`}>
                {label}
              </div>
            )
          }) : (
            <div className="px-3 py-2 text-xs text-gray-300">결과 없음</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function NewQuotePage() {
  const router = useRouter()
  const supabase = createClient()

  const [clients, setClients] = useState([])
  const [priceDb, setPriceDb] = useState([])
  const [bomTemplates, setBomTemplates] = useState([])
  const [productTypes, setProductTypes] = useState([])

  const [clientId, setClientId] = useState('')
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0,10))
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  // price_db에서 고유 부품명 목록
  const partNames = [...new Set(priceDb.map(d => d.part_name).filter(Boolean))].sort()

  // 부품명으로 해당 규격 목록 조회
  function specsForPart(partName) {
    return priceDb
      .filter(d => d.part_name === partName && d.spec)
      .map(d => d.spec)
      .filter(Boolean)
  }

  useEffect(() => {
    async function load() {
      // clients 전체 로드
      const allClients = []
      let from = 0
      while (true) {
        const { data } = await supabase.from('clients').select('id,name').eq('is_active',true).order('name').range(from,from+999)
        if (!data||!data.length) break
        allClients.push(...data)
        if (data.length<1000) break
        from+=1000
      }
      setClients(allClients)

      // price_db 전체 로드
      const allPrices = []
      from = 0
      while (true) {
        const { data } = await supabase.from('price_db').select('*').order('part_name').range(from,from+999)
        if (!data||!data.length) break
        allPrices.push(...data)
        if (data.length<1000) break
        from+=1000
      }
      setPriceDb(allPrices)

      const { data: b } = await supabase.from('bom_templates').select('*').order('product_type,sort_order')
      setBomTemplates(b||[])

      const { data: pt } = await supabase.from('product_types').select('name').order('sort_order')
      setProductTypes((pt||[]).map(p=>p.name))
    }
    load()
  }, [])

  function lookupPrice(partName, spec) {
    if (!partName || !spec) return null  // 부품명+규격 둘 다 있어야 단가 조회
    const exact = priceDb.find(d => d.part_name?.trim()===partName?.trim() && d.spec?.trim()===spec?.trim())
    if (exact) return { price: Number(exact.unit_price), source:'db' }
    return null
  }

  const addItem = () => {
    setItems(prev => [...prev, { _id:_itemId++, product_type:'', spec:'', quantity:1, labor_cost:0, parts:[] }])
  }
  const removeItem = (id) => setItems(prev => prev.filter(i=>i._id!==id))

  const updateItem = (id, field, val) => {
    setItems(prev => prev.map(item => {
      if (item._id!==id) return item
      const updated = {...item, [field]:val}
      if (field==='product_type' && val) {
        const templates = bomTemplates.filter(b=>b.product_type===val)
        if (templates.length) {
          updated.parts = templates.map(t => {
            const res = lookupPrice(t.part_name, t.part_spec||'')
            return { _id:_partId++, part_name:t.part_name, spec:t.part_spec||'', qty:'', unit_price:res?.price||'', source:res?.source||'none' }
          })
        }
      }
      return updated
    }))
  }

  const addPart = (itemId) => {
    setItems(prev => prev.map(item =>
      item._id===itemId
        ? { ...item, parts:[...item.parts, { _id:_partId++, part_name:'', spec:'', qty:'', unit_price:'', source:'none' }] }
        : item
    ))
  }
  const removePart = (itemId, partId) => {
    setItems(prev => prev.map(item =>
      item._id===itemId ? {...item, parts:item.parts.filter(p=>p._id!==partId)} : item
    ))
  }

  const updatePart = (itemId, partId, field, val) => {
    setItems(prev => prev.map(item => {
      if (item._id!==itemId) return item
      const parts = item.parts.map(p => {
        if (p._id!==partId) return p
        const updated = {...p, [field]:val}
        if (field==='unit_price') updated.source = val?'manual':'none'
        if (field==='part_name') {
          // 부품명 변경 시 규격·단가 초기화 (규격 선택 후 단가 조회)
          updated.spec = ''
          updated.unit_price = ''
          updated.source = 'none'
        }
        if (field==='spec') {
          const res = lookupPrice(p.part_name, val)
          if (res) { updated.unit_price=res.price; updated.source='db' }
          else if (p.source==='db') { updated.unit_price=''; updated.source='none' }
        }
        return updated
      })
      return {...item, parts}
    }))
  }

  const autoLookupAll = () => {
    setItems(prev => prev.map(item => ({
      ...item,
      parts: item.parts.map(p => {
        if (p.source==='manual') return p
        const res = lookupPrice(p.part_name, p.spec)
        return res ? {...p, unit_price:res.price, source:res.source} : p
      })
    })))
  }

  const handleSave = async () => {
    if (!clientId) return alert('거래처를 선택해 주세요.')
    if (!items.length) return alert('품목을 1개 이상 추가해 주세요.')
    setSaving(true)
    const totalAmount = items.reduce((s,item)=>s+calcItem(item).amount, 0)
    const { data: quote, error } = await supabase.from('quotes').insert({
      client_id:clientId, quote_date:quoteDate, status:'견적', total_amount:totalAmount,
    }).select().single()
    if (error) { alert('저장 오류: '+error.message); setSaving(false); return }
    const quoteItems = items.map((item,i) => {
      const c = calcItem(item)
      return {
        quote_id:quote.id, product_type:item.product_type, spec:item.spec,
        quantity:Number(item.quantity)||1, labor_cost:Number(item.labor_cost)||0,
        parts:item.parts.map(p=>({ part_name:p.part_name, spec:p.spec, qty:Number(p.qty)||0, unit_price:Number(p.unit_price)||0, source:p.source })),
        unit_price:c.unitCost,    // 개당 총원가
        total_price:c.amount,     // 품목단가 (수량×개당총원가)
        sort_order:i,
      }
    })
    await supabase.from('quote_items').insert(quoteItems)
    router.push('/quotes')
  }

  const grandTotal = items.reduce((s,item)=>s+calcItem(item).amount, 0)

  const srcBadge = (src) => {
    if (src==='db') return <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">DB</span>
    if (src==='manual') return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">직접</span>
    return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">미입력</span>
  }

  const clientOptions = clients.map(c => ({ value:c.id, label:c.name }))

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">새 견적 작성</h1>
          <p className="text-sm text-gray-400 mt-0.5">품목별 부속품을 입력하면 단가가 자동으로 계산됩니다.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={autoLookupAll} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            ↻ 전체 단가조회
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
            {saving?'저장 중...':'견적서 저장'}
          </button>
        </div>
      </div>

      {/* 헤더 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">거래처 *</label>
            <SearchDropdown
              value={clientId}
              onChange={setClientId}
              options={clientOptions}
              placeholder="거래처 검색·선택"
              width="w-full"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">견적일</label>
            <input type="date" value={quoteDate} onChange={e=>setQuoteDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400" />
          </div>
          <div className="flex items-end">
            <div className="w-full bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-100">
              <div className="text-xs text-gray-400">합계금액</div>
              <div className="text-lg font-semibold text-gray-900">₩{grandTotal.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 품목 */}
      {items.map((item, idx) => {
        const c = calcItem(item)
        return (
          <div key={item._id} className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
            {/* 품목 헤더 */}
            <div className="flex items-center gap-3 px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex-wrap">
              <span className="w-6 h-6 rounded-full bg-gray-800 text-white text-xs flex items-center justify-center font-medium shrink-0">{idx+1}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">품목</span>
                <select value={item.product_type} onChange={e=>updateItem(item._id,'product_type',e.target.value)}
                  className="border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-gray-400 bg-white">
                  <option value="">선택</option>
                  {productTypes.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-xs text-gray-400 shrink-0">규격</span>
                <input value={item.spec} onChange={e=>updateItem(item._id,'spec',e.target.value)}
                  className="border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-gray-400 flex-1 min-w-0"
                  placeholder="예: 50.8(12)*500*530" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">수량</span>
                <input type="number" value={item.quantity} onChange={e=>updateItem(item._id,'quantity',e.target.value)}
                  className="border border-gray-200 rounded-md px-2 py-1.5 text-sm w-20 text-right focus:outline-none focus:border-gray-400" />
                <span className="text-xs text-gray-400">개</span>
              </div>
              <button onClick={()=>removeItem(item._id)} className="text-xs text-red-400 hover:text-red-600 shrink-0">삭제</button>
            </div>

            {/* 부품 테이블 */}
            <div className="px-5 pt-4 pb-2">
              <table className="w-full text-sm mb-3" style={{tableLayout:'fixed'}}>
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 text-left font-medium" style={{width:'22%'}}>부품명</th>
                    <th className="pb-2 text-left font-medium" style={{width:'28%'}}>규격</th>
                    <th className="pb-2 text-right font-medium" style={{width:'12%'}}>소요수량</th>
                    <th className="pb-2 text-right font-medium" style={{width:'14%'}}>단가 (원)</th>
                    <th className="pb-2 text-right font-medium" style={{width:'12%'}}>소계 (원)</th>
                    <th className="pb-2 text-center font-medium" style={{width:'8%'}}>출처</th>
                    <th style={{width:'4%'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {item.parts.map(p => {
                    const sub = (Number(p.qty)||0)*(Number(p.unit_price)||0)
                    const specOptions = specsForPart(p.part_name)
                    return (
                      <tr key={p._id} className="border-b border-gray-50">
                        {/* 부품명 드롭다운 */}
                        <td className="py-1.5 pr-2">
                          <SearchDropdown
                            value={p.part_name}
                            onChange={val => updatePart(item._id, p._id, 'part_name', val)}
                            options={partNames}
                            placeholder="부품명"
                            width="w-full"
                          />
                        </td>
                        {/* 규격 드롭다운 (부품명 선택 시 해당 규격만) */}
                        <td className="py-1.5 pr-2">
                          {specOptions.length > 0 ? (
                            <SearchDropdown
                              value={p.spec}
                              onChange={val => updatePart(item._id, p._id, 'spec', val)}
                              options={specOptions}
                              placeholder="규격 선택"
                              width="w-full"
                            />
                          ) : (
                            <input value={p.spec} onChange={e=>updatePart(item._id,p._id,'spec',e.target.value)}
                              className="w-full border-0 border-b border-gray-200 px-1 py-1 text-sm focus:outline-none focus:border-gray-400 bg-transparent"
                              placeholder="규격 입력" />
                          )}
                        </td>
                        <td className="py-1.5 pr-2">
                          <input type="number" value={p.qty} onChange={e=>updatePart(item._id,p._id,'qty',e.target.value)}
                            className="w-full border-0 border-b border-gray-200 px-1 py-1 text-sm text-right focus:outline-none focus:border-gray-400 bg-transparent" placeholder="0" />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input type="number" value={p.unit_price} onChange={e=>updatePart(item._id,p._id,'unit_price',e.target.value)}
                            className={`w-full border-0 border-b border-gray-200 px-1 py-1 text-sm text-right focus:outline-none focus:border-gray-400 bg-transparent ${p.source==='db'?'text-green-600':''}`}
                            placeholder="0" />
                        </td>
                        <td className="py-1.5 text-right text-xs text-gray-500 pr-2">
                          {sub ? sub.toLocaleString() : '—'}
                        </td>
                        <td className="py-1.5 text-center">{srcBadge(p.source)}</td>
                        <td className="py-1.5 text-center">
                          <button onClick={()=>removePart(item._id,p._id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <button onClick={()=>addPart(item._id)} className="text-xs text-gray-400 hover:text-gray-700 mb-2">+ 부품 추가</button>
            </div>

            {/* 계산 푸터 */}
            <div className="flex items-center gap-4 px-5 py-3 bg-gray-50 border-t border-gray-100 flex-wrap text-sm">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-400">기본원가 (재료비)</span>
                <span className="font-medium">{c.mat.toLocaleString()}원</span>
              </div>
              <span className="text-gray-300 text-lg">+</span>
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-gray-400">개당 인건비</span>
                  <div className="flex items-center gap-1">
                    <input type="number" value={item.labor_cost} onChange={e=>updateItem(item._id,'labor_cost',e.target.value)}
                      className="border border-gray-200 rounded-md px-2 py-1 text-sm w-28 text-right focus:outline-none focus:border-gray-400" placeholder="0" />
                    <span className="text-xs text-gray-400">원</span>
                  </div>
                </div>
              </div>
              <span className="text-gray-300 text-lg">=</span>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-400">개당 단가</span>
                <span className="font-semibold">{c.unitCost.toLocaleString()}원</span>
              </div>
              <span className="text-gray-400 text-sm">× {Number(item.quantity)||1}개</span>
              <span className="text-gray-300 text-lg">=</span>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-400">총단가액</span>
                <span className="text-blue-700 font-bold text-base">{c.amount.toLocaleString()}원</span>
              </div>
            </div>
          </div>
        )
      })}

      <button onClick={addItem}
        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors">
        + 품목 추가
      </button>
    </div>
  )
}
