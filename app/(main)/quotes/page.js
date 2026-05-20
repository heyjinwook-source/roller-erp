'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const PAGE_SIZE = 30
const STATUS_COLORS = {
  '견적': 'bg-blue-100 text-blue-700',
  '수주': 'bg-green-100 text-green-700',
  '생산': 'bg-amber-100 text-amber-700',
  '완료': 'bg-gray-100 text-gray-600',
  '취소': 'bg-red-100 text-red-500',
}
let _itemId = 1

function calcItem(item) {
  const parts = Array.isArray(item.parts) ? item.parts : []
  const mat = parts.reduce((s,p) => s+(Number(p.qty)||0)*(Number(p.unit_price)||0), 0)
  const lab = Number(item.labor_cost)||0
  const tot = mat+lab
  const qty = Number(item.quantity)||1
  return { mat, lab, tot, unitPrice: tot/qty, amount: tot }
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('전체')
  const [clientFilter, setClientFilter] = useState('')
  const [clients, setClients] = useState([])
  const [showClientDrop, setShowClientDrop] = useState(false)
  const [counts, setCounts] = useState({})

  // 수정 폼 상태
  const [editQuote, setEditQuote] = useState(null)
  const [editForm, setEditForm] = useState({ client_id:'', quote_date:'', notes:'' })
  const [editItems, setEditItems] = useState([])
  const [saving, setSaving] = useState(false)

  const searchTimer = useRef(null)
  const dropRef = useRef(null)
  const supabase = createClient()

  async function loadClients() {
    const all = []
    let from = 0
    while (true) {
      const { data } = await supabase.from('clients').select('id, name').eq('is_active', true).order('name').range(from, from+999)
      if (!data||!data.length) break
      all.push(...data)
      if (data.length<1000) break
      from+=1000
    }
    setClients(all)
  }

  async function loadCounts() {
    const { data } = await supabase.from('quotes').select('status')
    if (data) {
      const c = { '전체': data.length }
      data.forEach(q => { c[q.status]=(c[q.status]||0)+1 })
      setCounts(c)
    }
  }

  async function fetchQuotes(keyword, status, clientId, pageNum) {
    setLoading(true)
    const from = (pageNum-1)*PAGE_SIZE
    const to = from+PAGE_SIZE-1
    let query = supabase
      .from('quotes')
      .select('*, clients(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (keyword) query = query.or(`quote_no.ilike.%${keyword}%`)
    if (status !== '전체') query = query.eq('status', status)
    if (clientId) query = query.eq('client_id', clientId)
    const { data, count } = await query
    setQuotes(data||[])
    setTotal(count||0)
    setLoading(false)
  }

  useEffect(() => { fetchQuotes('','전체','',1); loadClients(); loadCounts() }, [])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); fetchQuotes(search,statusFilter,clientFilter,1) }, 350)
    return () => clearTimeout(searchTimer.current)
  }, [search, statusFilter, clientFilter])

  useEffect(() => {
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowClientDrop(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function goPage(p) { setPage(p); fetchQuotes(search,statusFilter,clientFilter,p) }
  const totalPages = Math.ceil(total/PAGE_SIZE)
  const getPageNums = () => {
    const delta=2, range=[]
    const left=Math.max(1,page-delta), right=Math.min(totalPages,page+delta)
    if(left>1){range.push(1);if(left>2)range.push('...')}
    for(let i=left;i<=right;i++) range.push(i)
    if(right<totalPages){if(right<totalPages-1)range.push('...');range.push(totalPages)}
    return range
  }

  const selectedClient = clients.find(c => c.id===clientFilter)

  // ── 삭제 ──
  async function handleDelete(id, quoteNo) {
    if (!confirm(`견적 ${quoteNo}을 삭제하시겠습니까?\n품목 데이터도 함께 삭제됩니다.`)) return
    await supabase.from('quote_items').delete().eq('quote_id', id)
    await supabase.from('quotes').delete().eq('id', id)
    fetchQuotes(search,statusFilter,clientFilter,page)
    loadCounts()
  }

  // ── 수정 열기 ──
  async function openEdit(q) {
    setEditQuote(q)
    setEditForm({ client_id: q.client_id||'', quote_date: q.quote_date||'', notes: q.notes||'' })
    // 기존 품목 로드
    const { data } = await supabase.from('quote_items').select('*').eq('quote_id', q.id).order('sort_order')
    setEditItems((data||[]).map(i => ({
      _id: _itemId++,
      id: i.id,
      product_type: i.product_type||'',
      spec: i.spec||'',
      quantity: i.quantity||1,
      labor_cost: i.labor_cost||0,
      parts: Array.isArray(i.parts)?i.parts:[],
    })))
    window.scrollTo({ top:0, behavior:'smooth' })
  }

  function closeEdit() { setEditQuote(null); setEditItems([]) }

  function addEditItem() {
    setEditItems(prev => [...prev, { _id:_itemId++, product_type:'', spec:'', quantity:1, labor_cost:0, parts:[] }])
  }
  function removeEditItem(id) { setEditItems(prev => prev.filter(i=>i._id!==id)) }
  function updateEditItem(id, field, val) {
    setEditItems(prev => prev.map(i => i._id===id ? {...i,[field]:val} : i))
  }

  // ── 수정 저장 ──
  async function handleEditSave() {
    if (!editForm.client_id) return alert('거래처를 선택해 주세요.')
    setSaving(true)
    try {
      const totalAmount = editItems.reduce((s,item) => s+calcItem(item).amount, 0)
      await supabase.from('quotes').update({
        client_id: editForm.client_id,
        quote_date: editForm.quote_date,
        notes: editForm.notes,
        total_amount: totalAmount,
        updated_at: new Date().toISOString()
      }).eq('id', editQuote.id)

      // 기존 품목 삭제 후 재삽입
      await supabase.from('quote_items').delete().eq('quote_id', editQuote.id)
      const newItems = editItems.filter(i=>i.product_type).map((item,idx) => {
        const c = calcItem(item)
        return {
          quote_id: editQuote.id,
          product_type: item.product_type,
          spec: item.spec,
          quantity: Number(item.quantity)||1,
          labor_cost: Number(item.labor_cost)||0,
          parts: item.parts,
          unit_price: Math.round(c.unitPrice),
          total_price: Math.round(c.amount),
          sort_order: idx,
        }
      })
      if (newItems.length) await supabase.from('quote_items').insert(newItems)

      closeEdit()
      fetchQuotes(search,statusFilter,clientFilter,page)
      loadCounts()
    } catch(e) { alert('오류: '+e.message) }
    setSaving(false)
  }

  const filteredClients = clients.filter(c => !clientFilter || c.name.includes(selectedClient?.name||''))

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">견적 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">견적 작성, 수주 전환, 거래처별 이력 조회</p>
        </div>
        <Link href="/quotes/new"
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700">
          + 새 견적 작성
        </Link>
      </div>

      {/* ── 수정 폼 ── */}
      {editQuote && (
        <div className="bg-white rounded-xl border border-blue-200 p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">견적 수정 — <span className="font-mono text-blue-700">{editQuote.quote_no}</span></h2>
              <p className="text-xs text-gray-400 mt-0.5">기본 정보와 품목을 수정합니다. 부품 세부내역은 보기 페이지에서 수정하세요.</p>
            </div>
            <button onClick={closeEdit} className="text-gray-300 hover:text-gray-600 text-xl leading-none">×</button>
          </div>

          {/* 헤더 */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">거래처 *</label>
              <select value={editForm.client_id} onChange={e=>setEditForm({...editForm,client_id:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 bg-white">
                <option value="">선택</option>
                {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">견적일</label>
              <input type="date" value={editForm.quote_date} onChange={e=>setEditForm({...editForm,quote_date:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">메모</label>
              <input value={editForm.notes} onChange={e=>setEditForm({...editForm,notes:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" placeholder="" />
            </div>
          </div>

          {/* 품목 */}
          <div className="mb-4">
            <div className="text-xs text-gray-500 mb-2 font-medium">품목 목록</div>
            <table className="w-full text-sm mb-2">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 text-left font-medium">품목명</th>
                  <th className="pb-2 text-left font-medium">규격</th>
                  <th className="pb-2 text-right font-medium w-20">수량</th>
                  <th className="pb-2 text-right font-medium w-28">인건비 (원)</th>
                  <th className="pb-2 text-right font-medium w-28">품목단가</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {editItems.map(item => {
                  const c = calcItem(item)
                  return (
                    <tr key={item._id} className="border-t border-gray-50">
                      <td className="py-1.5 pr-2">
                        <input value={item.product_type} onChange={e=>updateEditItem(item._id,'product_type',e.target.value)}
                          className="w-full border-0 border-b border-gray-200 px-1 py-1 text-sm focus:outline-none focus:border-gray-400 bg-transparent" placeholder="B/R로라" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input value={item.spec} onChange={e=>updateEditItem(item._id,'spec',e.target.value)}
                          className="w-full border-0 border-b border-gray-200 px-1 py-1 text-sm focus:outline-none focus:border-gray-400 bg-transparent" placeholder="규격" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input type="number" value={item.quantity} onChange={e=>updateEditItem(item._id,'quantity',e.target.value)}
                          className="w-full border-0 border-b border-gray-200 px-1 py-1 text-sm text-right focus:outline-none focus:border-gray-400 bg-transparent" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input type="number" value={item.labor_cost} onChange={e=>updateEditItem(item._id,'labor_cost',e.target.value)}
                          className="w-full border-0 border-b border-gray-200 px-1 py-1 text-sm text-right focus:outline-none focus:border-gray-400 bg-transparent" />
                      </td>
                      <td className="py-1.5 text-right text-xs text-blue-700 font-medium font-mono">
                        {c.unitPrice ? Math.round(c.unitPrice).toLocaleString() : '—'}
                      </td>
                      <td className="py-1.5 text-center">
                        {editItems.length>1 && (
                          <button onClick={()=>removeEditItem(item._id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <button onClick={addEditItem} className="text-xs text-gray-400 hover:text-gray-700">+ 품목 추가</button>
          </div>

          <div className="flex gap-2 pt-3 border-t border-gray-100">
            <button onClick={handleEditSave} disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
              {saving ? '저장 중...' : '수정 저장'}
            </button>
            <button onClick={closeEdit} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 필터 바 */}
        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {['전체','견적','수주','생산','완료','취소'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter===s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {s} {counts[s]!==undefined?`(${counts[s]})`:''}
              </button>
            ))}
          </div>
          <div className="flex gap-3 flex-wrap items-center">
            <input value={search} onChange={e=>setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:border-gray-400"
              placeholder="견적번호 검색" />
            <div className="relative" ref={dropRef}>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-gray-400 bg-white">
                <span className="px-3 text-xs text-gray-400 whitespace-nowrap border-r border-gray-200 py-2">거래처</span>
                <input value={selectedClient?selectedClient.name:''}
                  onChange={e=>{if(!e.target.value)setClientFilter('');setShowClientDrop(true)}}
                  onFocus={()=>setShowClientDrop(true)}
                  placeholder="전체" readOnly={!!clientFilter}
                  className="px-3 py-2 text-sm w-40 focus:outline-none bg-transparent cursor-pointer" />
                {clientFilter && (
                  <button onClick={()=>{setClientFilter('');setShowClientDrop(false)}}
                    className="px-2 text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
                )}
                <button onClick={()=>setShowClientDrop(v=>!v)}
                  className="px-2 py-2 text-gray-400 border-l border-gray-200 text-xs">{showClientDrop?'▲':'▼'}</button>
              </div>
              {showClientDrop && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                  <div onClick={()=>{setClientFilter('');setShowClientDrop(false)}}
                    className="px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 cursor-pointer border-b border-gray-100">전체 보기</div>
                  {clients.map(c=>(
                    <div key={c.id} onClick={()=>{setClientFilter(c.id);setShowClientDrop(false)}}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${clientFilter===c.id?'bg-blue-50 text-blue-700 font-medium':'text-gray-700'}`}>
                      {c.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <span className="text-xs text-gray-400 ml-auto">전체 {total.toLocaleString()}건</span>
          </div>
        </div>

        {/* 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                <th className="px-5 py-2.5 text-left font-medium">견적번호</th>
                <th className="px-4 py-2.5 text-left font-medium">거래처</th>
                <th className="px-4 py-2.5 text-left font-medium">견적일</th>
                <th className="px-4 py-2.5 text-right font-medium">합계금액</th>
                <th className="px-4 py-2.5 text-center font-medium">상태</th>
                <th className="px-4 py-2.5 text-center font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-10 text-center text-gray-300">로딩 중...</td></tr>
              ) : quotes.length ? quotes.map(q => (
                <tr key={q.id} className={`border-t border-gray-50 hover:bg-gray-50 ${editQuote?.id===q.id?'bg-blue-50':''}`}>
                  <td className="px-5 py-2.5 font-mono text-xs text-gray-600">{q.quote_no}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{q.clients?.name}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{q.quote_date}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm">
                    {q.total_amount?`₩${Number(q.total_amount).toLocaleString()}`:'—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[q.status]||'bg-gray-100 text-gray-600'}`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center gap-2">
                      <Link href={`/quotes/${q.id}`} className="text-xs text-blue-600 hover:underline">보기</Link>
                      <button onClick={()=>openEdit(q)}
                        className={`text-xs hover:underline ${editQuote?.id===q.id?'text-blue-700 font-medium':'text-gray-500 hover:text-gray-800'}`}>
                        수정
                      </button>
                      <select value={q.status}
                        onChange={async e => {
                          const newStatus = e.target.value
                          if (newStatus==='수주') {
                            if (!confirm(`${q.quote_no}을 수주로 전환하시겠습니까?\n수주번호가 자동 생성됩니다.`)) return
                            const { data: newOrder } = await supabase.from('orders').insert({
                              client_id: q.client_id, quote_id: q.id,
                              order_date: new Date().toISOString().slice(0,10), status: '대기',
                            }).select().single()
                            if (newOrder) {
                              const { data: qi } = await supabase.from('quote_items').select('*').eq('quote_id', q.id)
                              if (qi?.length) await supabase.from('order_items').insert(
                                qi.map((item,i)=>({ order_id:newOrder.id, product_type:item.product_type, spec:item.spec, quantity:item.quantity, unit_price:item.unit_price, total_price:item.total_price, status:'대기', sort_order:i }))
                              )
                              alert(`수주 전환 완료! 수주번호: ${newOrder.order_no}`)
                            }
                          }
                          await supabase.from('quotes').update({ status: newStatus }).eq('id', q.id)
                          fetchQuotes(search,statusFilter,clientFilter,page)
                          loadCounts()
                        }}
                        className="text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white focus:outline-none cursor-pointer text-gray-600 hover:border-gray-400">
                        <option value="견적">견적</option>
                        <option value="수주">수주</option>
                        <option value="완료">완료</option>
                        <option value="취소">취소</option>
                      </select>
                      <button onClick={()=>handleDelete(q.id,q.quote_no)} className="text-xs text-red-500 hover:underline">삭제</button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="py-10 text-center text-gray-300">견적 데이터가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages>1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
            <span className="text-xs text-gray-400">{page}/{totalPages} 페이지</span>
            <div className="flex items-center gap-1">
              <button onClick={()=>goPage(1)} disabled={page===1} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">◀◀</button>
              <button onClick={()=>goPage(page-1)} disabled={page===1} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">◀</button>
              {getPageNums().map((p,i)=>p==='...'
                ?<span key={i} className="px-2 py-1 text-xs text-gray-300">···</span>
                :<button key={p} onClick={()=>goPage(p)} className={`px-3 py-1 text-xs rounded border ${p===page?'bg-gray-900 text-white border-gray-900':'border-gray-200 hover:bg-gray-50'}`}>{p}</button>
              )}
              <button onClick={()=>goPage(page+1)} disabled={page===totalPages} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">▶</button>
              <button onClick={()=>goPage(totalPages)} disabled={page===totalPages} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">▶▶</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
