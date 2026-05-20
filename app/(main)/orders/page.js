'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const PAGE_SIZE = 30
const STATUSES = ['대기', '가공중', 'CNC예정', '출고대기', '출고완료']
const STATUS_COLORS = {
  '대기':    'bg-gray-100 text-gray-600',
  '가공중':  'bg-blue-100 text-blue-700',
  'CNC예정': 'bg-purple-100 text-purple-700',
  '출고대기':'bg-amber-100 text-amber-700',
  '출고완료':'bg-green-100 text-green-700',
}
let _itemId = 1

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('전체')
  const [counts, setCounts] = useState({})
  const [detail, setDetail] = useState(null)
  const [detailItems, setDetailItems] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editOrder, setEditOrder] = useState(null) // 수정 중인 수주
  const [clients, setClients] = useState([])
  const [form, setForm] = useState({ client_id: '', order_date: new Date().toISOString().slice(0,10), delivery_date: '', notes: '' })
  const [formItems, setFormItems] = useState([{ _id: _itemId++, product_type: '', spec: '', quantity: '', unit_price: '', status: '대기' }])
  const [saving, setSaving] = useState(false)
  const searchTimer = useRef(null)
  const supabase = createClient()

  async function loadClients() {
    const all = []
    let from = 0
    while (true) {
      const { data } = await supabase.from('clients').select('id,name').eq('is_active',true).order('name').range(from,from+999)
      if (!data||!data.length) break
      all.push(...data)
      if (data.length<1000) break
      from+=1000
    }
    setClients(all)
  }

  async function loadCounts() {
    const { data } = await supabase.from('orders').select('status')
    if (data) {
      const c = { '전체': data.length }
      data.forEach(o => { c[o.status] = (c[o.status]||0)+1 })
      setCounts(c)
    }
  }

  async function fetchOrders(keyword, status, pageNum) {
    setLoading(true)
    const from = (pageNum-1)*PAGE_SIZE
    const to = from+PAGE_SIZE-1
    let query = supabase.from('orders')
      .select('*, clients(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (keyword) query = query.or(`order_no.ilike.%${keyword}%,clients.name.ilike.%${keyword}%`)
    if (status !== '전체') query = query.eq('status', status)
    const { data, count } = await query
    setOrders(data||[])
    setTotal(count||0)
    setLoading(false)
  }

  async function loadDetail(order) {
    setDetail(order)
    setDetailLoading(true)
    const { data } = await supabase.from('order_items').select('*').eq('order_id',order.id).order('sort_order')
    setDetailItems(data||[])
    setDetailLoading(false)
  }

  useEffect(() => { fetchOrders('','전체',1); loadClients(); loadCounts() }, [])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); fetchOrders(search,statusFilter,1) }, 350)
    return () => clearTimeout(searchTimer.current)
  }, [search, statusFilter])

  function goPage(p) { setPage(p); fetchOrders(search,statusFilter,p) }
  const totalPages = Math.ceil(total/PAGE_SIZE)
  const getPageNums = () => {
    const delta=2, range=[]
    const left=Math.max(1,page-delta), right=Math.min(totalPages,page+delta)
    if(left>1){range.push(1);if(left>2)range.push('...')}
    for(let i=left;i<=right;i++) range.push(i)
    if(right<totalPages){if(right<totalPages-1)range.push('...');range.push(totalPages)}
    return range
  }

  function resetForm() {
    setForm({ client_id:'', order_date:new Date().toISOString().slice(0,10), delivery_date:'', notes:'' })
    setFormItems([{ _id:_itemId++, product_type:'', spec:'', quantity:'', unit_price:'', status:'대기' }])
    setEditOrder(null)
    setShowForm(false)
  }

  function openNewForm() {
    resetForm()
    setDetail(null)
    setShowForm(true)
  }

  function openEditForm(order, items) {
    setForm({ client_id:order.client_id||'', order_date:order.order_date||'', delivery_date:order.delivery_date||'', notes:order.notes||'' })
    setFormItems(items.map(i => ({ _id:_itemId++, id:i.id, product_type:i.product_type||'', spec:i.spec||'', quantity:i.quantity||'', unit_price:i.unit_price||'', status:i.status||'대기' })))
    setEditOrder(order)
    setShowForm(true)
    window.scrollTo({ top:0, behavior:'smooth' })
  }

  function addFormItem() {
    setFormItems(prev => [...prev, { _id:_itemId++, product_type:'', spec:'', quantity:'', unit_price:'', status:'대기' }])
  }
  function removeFormItem(id) {
    setFormItems(prev => prev.filter(i => i._id !== id))
  }
  function updateFormItem(id, field, val) {
    setFormItems(prev => prev.map(i => i._id===id ? {...i, [field]:val} : i))
  }

  async function handleSave() {
    if (!form.client_id) return alert('거래처를 선택해 주세요.')
    if (formItems.every(i => !i.product_type)) return alert('품목을 1개 이상 입력해 주세요.')
    setSaving(true)
    try {
      if (editOrder) {
        // 수정
        await supabase.from('orders').update({
          client_id: form.client_id,
          order_date: form.order_date,
          delivery_date: form.delivery_date||null,
          notes: form.notes,
          updated_at: new Date().toISOString()
        }).eq('id', editOrder.id)

        // 기존 품목 삭제 후 재삽입
        await supabase.from('order_items').delete().eq('order_id', editOrder.id)
        const newItems = formItems.filter(i=>i.product_type).map((i,idx) => ({
          order_id: editOrder.id,
          product_type: i.product_type,
          spec: i.spec,
          quantity: Number(i.quantity)||0,
          unit_price: Number(i.unit_price)||0,
          total_price: (Number(i.quantity)||0)*(Number(i.unit_price)||0),
          status: i.status,
          sort_order: idx
        }))
        if (newItems.length) await supabase.from('order_items').insert(newItems)
        alert('수정 완료되었습니다.')
      } else {
        // 신규 수주 직접 입력 (order_no 자동생성)
        const { data: newOrder, error } = await supabase.from('orders').insert({
          client_id: form.client_id,
          order_date: form.order_date,
          delivery_date: form.delivery_date||null,
          status: '대기',
          notes: form.notes
        }).select().single()
        if (error) { alert('저장 오류: '+error.message); setSaving(false); return }

        const newItems = formItems.filter(i=>i.product_type).map((i,idx) => ({
          order_id: newOrder.id,
          product_type: i.product_type,
          spec: i.spec,
          quantity: Number(i.quantity)||0,
          unit_price: Number(i.unit_price)||0,
          total_price: (Number(i.quantity)||0)*(Number(i.unit_price)||0),
          status: '대기',
          sort_order: idx
        }))
        if (newItems.length) await supabase.from('order_items').insert(newItems)
        alert(`수주 등록 완료! 수주번호: ${newOrder.order_no}`)
      }
      resetForm()
      fetchOrders(search,statusFilter,page)
      loadCounts()
    } catch(e) { alert('오류: '+e.message) }
    setSaving(false)
  }

  async function handleDelete(orderId) {
    if (!confirm('이 수주를 삭제하시겠습니까? 품목 데이터도 함께 삭제됩니다.')) return
    await supabase.from('order_items').delete().eq('order_id', orderId)
    await supabase.from('orders').delete().eq('id', orderId)
    setDetail(null)
    fetchOrders(search,statusFilter,page)
    loadCounts()
  }

  async function updateStatus(orderId, status) {
    await supabase.from('orders').update({ status }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id===orderId ? {...o,status} : o))
    if (detail?.id===orderId) setDetail(prev => ({...prev,status}))
    loadCounts()
  }

  async function updateDelivery(orderId, date) {
    await supabase.from('orders').update({ delivery_date:date }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id===orderId ? {...o,delivery_date:date} : o))
    if (detail?.id===orderId) setDetail(prev => ({...prev,delivery_date:date}))
  }

  async function updateItemStatus(itemId, status) {
    await supabase.from('order_items').update({ status }).eq('id', itemId)
    setDetailItems(prev => prev.map(i => i.id===itemId ? {...i,status} : i))
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">수주현황</h1>
          <p className="text-sm text-gray-400 mt-0.5">수주 진행 상태를 관리합니다.</p>
        </div>
        <button onClick={openNewForm}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700">
          + 수주 직접 입력
        </button>
      </div>

      {/* 직접입력 / 수정 폼 */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">
              {editOrder ? `수주 수정 — ${editOrder.order_no}` : '새 수주 직접 입력'}
            </h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
          </div>

          {/* 헤더 */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">거래처 *</label>
              <select value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 bg-white">
                <option value="">선택</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">수주일 *</label>
              <input type="date" value={form.order_date} onChange={e=>setForm({...form,order_date:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">납기</label>
              <input type="date" value={form.delivery_date} onChange={e=>setForm({...form,delivery_date:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">메모</label>
              <input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" placeholder="" />
            </div>
          </div>

          {/* 품목 */}
          <div className="mb-3">
            <table className="w-full text-sm mb-2">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 text-left font-medium">품목명 *</th>
                  <th className="pb-2 text-left font-medium">규격</th>
                  <th className="pb-2 text-right font-medium w-24">수량</th>
                  <th className="pb-2 text-right font-medium w-28">단가 (원)</th>
                  <th className="pb-2 text-right font-medium w-28">금액 (원)</th>
                  <th className="pb-2 text-center font-medium w-20">상태</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {formItems.map(item => {
                  const amt = (Number(item.quantity)||0)*(Number(item.unit_price)||0)
                  return (
                    <tr key={item._id} className="border-t border-gray-50">
                      <td className="py-1.5 pr-2">
                        <input value={item.product_type} onChange={e=>updateFormItem(item._id,'product_type',e.target.value)}
                          className="w-full border-0 border-b border-gray-200 px-1 py-1 text-sm focus:outline-none focus:border-gray-400 bg-transparent" placeholder="B/R로라" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input value={item.spec} onChange={e=>updateFormItem(item._id,'spec',e.target.value)}
                          className="w-full border-0 border-b border-gray-200 px-1 py-1 text-sm focus:outline-none focus:border-gray-400 bg-transparent" placeholder="50.8*500*530" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input type="number" value={item.quantity} onChange={e=>updateFormItem(item._id,'quantity',e.target.value)}
                          className="w-full border-0 border-b border-gray-200 px-1 py-1 text-sm text-right focus:outline-none focus:border-gray-400 bg-transparent" placeholder="0" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input type="number" value={item.unit_price} onChange={e=>updateFormItem(item._id,'unit_price',e.target.value)}
                          className="w-full border-0 border-b border-gray-200 px-1 py-1 text-sm text-right focus:outline-none focus:border-gray-400 bg-transparent" placeholder="0" />
                      </td>
                      <td className="py-1.5 pr-2 text-right text-xs text-gray-500 font-mono">
                        {amt ? amt.toLocaleString() : '—'}
                      </td>
                      <td className="py-1.5 pr-2">
                        <select value={item.status} onChange={e=>updateFormItem(item._id,'status',e.target.value)}
                          className="text-xs border border-gray-200 rounded px-1 py-1 bg-white focus:outline-none w-full">
                          {STATUSES.map(s=><option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 text-center">
                        {formItems.length > 1 && (
                          <button onClick={()=>removeFormItem(item._id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <button onClick={addFormItem} className="text-xs text-gray-400 hover:text-gray-700">+ 품목 추가</button>
          </div>

          <div className="flex gap-2 pt-3 border-t border-gray-100">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
              {saving ? '저장 중...' : editOrder ? '수정 저장' : '수주 등록'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
          </div>
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-6 gap-2 mb-5">
        {['전체', ...STATUSES].map(s => (
          <div key={s} onClick={() => setStatusFilter(s)}
            className={`cursor-pointer rounded-xl border p-3 transition-all ${statusFilter===s ? 'border-gray-500 bg-gray-100' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
            <div className="text-xs text-gray-500 mb-1 truncate">{s}</div>
            <div className="text-xl font-semibold text-gray-900">{counts[s]||0}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-4 items-start">
        {/* 목록 */}
        <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${detail ? 'flex-1 min-w-0' : 'w-full'}`}>
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-4 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-800 shrink-0">전체 {total.toLocaleString()}건</h2>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:border-gray-400"
              placeholder="수주번호·거래처 검색" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left font-medium">수주번호</th>
                  <th className="px-4 py-2.5 text-left font-medium">거래처</th>
                  {!detail && <th className="px-4 py-2.5 text-left font-medium">수주일</th>}
                  {!detail && <th className="px-4 py-2.5 text-left font-medium">납기</th>}
                  <th className="px-4 py-2.5 text-center font-medium">현황</th>
                  <th className="px-4 py-2.5 text-center font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="py-10 text-center text-gray-300">로딩 중...</td></tr>
                ) : orders.length ? orders.map(o => (
                  <tr key={o.id}
                    className={`border-t border-gray-50 cursor-pointer transition-colors ${detail?.id===o.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    onClick={() => detail?.id===o.id ? setDetail(null) : loadDetail(o)}>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600 font-medium">{o.order_no}</td>
                    <td className="px-4 py-2.5 text-gray-800">{o.clients?.name}</td>
                    {!detail && <td className="px-4 py-2.5 text-xs text-gray-500">{o.order_date}</td>}
                    {!detail && <td className="px-4 py-2.5 text-xs text-gray-500">{o.delivery_date || '—'}</td>}
                    <td className="px-4 py-2.5 text-center" onClick={e=>e.stopPropagation()}>
                      <select value={o.status} onChange={e=>updateStatus(o.id,e.target.value)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer border-0 outline-none ${STATUS_COLORS[o.status]||'bg-gray-100 text-gray-600'}`}>
                        {STATUSES.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-center" onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>detail?.id===o.id?setDetail(null):loadDetail(o)}
                        className={`text-xs hover:underline mr-2 ${detail?.id===o.id?'text-blue-700 font-medium':'text-gray-500'}`}>
                        {detail?.id===o.id?'닫기':'상세'}
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="py-10 text-center text-gray-300">수주 데이터가 없습니다</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
              <span className="text-xs text-gray-400">{page}/{totalPages} 페이지</span>
              <div className="flex items-center gap-1">
                <button onClick={()=>goPage(1)} disabled={page===1} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">◀◀</button>
                <button onClick={()=>goPage(page-1)} disabled={page===1} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">◀</button>
                {getPageNums().map((p,i) => p==='...'
                  ? <span key={i} className="px-2 py-1 text-xs text-gray-300">···</span>
                  : <button key={p} onClick={()=>goPage(p)} className={`px-3 py-1 text-xs rounded border ${p===page?'bg-gray-900 text-white border-gray-900':'border-gray-200 hover:bg-gray-50'}`}>{p}</button>
                )}
                <button onClick={()=>goPage(page+1)} disabled={page===totalPages} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">▶</button>
                <button onClick={()=>goPage(totalPages)} disabled={page===totalPages} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">▶▶</button>
              </div>
            </div>
          )}
        </div>

        {/* 상세 패널 */}
        {detail && (
          <div className="w-80 shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-6">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between">
              <div>
                <div className="font-mono text-sm font-semibold text-gray-900">{detail.order_no}</div>
                <div className="text-xs text-gray-500 mt-0.5">{detail.clients?.name}</div>
                {detail.quote_id && (
                  <Link href={`/quotes/${detail.quote_id}`} className="text-xs text-blue-600 hover:underline mt-0.5 block">
                    견적서 보기 →
                  </Link>
                )}
              </div>
              <button onClick={()=>setDetail(null)} className="text-gray-300 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="p-5 space-y-4">
              {/* 날짜·납기 */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">수주일</div>
                  <div className="text-gray-800">{detail.order_date}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">현황</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[detail.status]}`}>{detail.status}</span>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-400 mb-1">납기 수정</div>
                <input type="date" defaultValue={detail.delivery_date||''}
                  onBlur={e=>updateDelivery(detail.id,e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-gray-400" />
              </div>

              {/* 상태 버튼 */}
              <div>
                <div className="text-xs text-gray-400 mb-1.5">상태 변경</div>
                <div className="flex flex-wrap gap-1">
                  {STATUSES.map(s => (
                    <button key={s} onClick={()=>updateStatus(detail.id,s)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        detail.status===s ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>{s}</button>
                  ))}
                </div>
              </div>

              {/* 품목 목록 */}
              <div>
                <div className="text-xs text-gray-400 mb-2">품목 ({detailItems.length}개)</div>
                {detailLoading ? (
                  <div className="text-xs text-gray-300 text-center py-3">로딩 중...</div>
                ) : detailItems.length ? (
                  <div className="space-y-2">
                    {detailItems.map(item => (
                      <div key={item.id} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div>
                            <div className="text-xs font-medium text-gray-900">{item.product_type}</div>
                            {item.spec && <div className="text-xs text-gray-500 mt-0.5">{item.spec}</div>}
                          </div>
                          <select value={item.status||'대기'} onChange={e=>updateItemStatus(item.id,e.target.value)}
                            className={`text-xs rounded px-1.5 py-0.5 border-0 cursor-pointer shrink-0 ${STATUS_COLORS[item.status]||'bg-gray-100 text-gray-500'}`}>
                            {STATUSES.map(s=><option key={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>수량 {Number(item.quantity).toLocaleString()}개</span>
                          {item.unit_price>0 && <span>단가 {Number(item.unit_price).toLocaleString()}원</span>}
                        </div>
                        {item.total_price>0 && (
                          <div className="text-xs text-right font-medium text-gray-800 mt-0.5">
                            ₩{Number(item.total_price).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <div className="text-xs text-gray-300 text-center py-3">품목 없음</div>}
              </div>
            </div>

            {/* 수정·삭제 버튼 */}
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={()=>openEditForm(detail, detailItems)}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-700">
                수정
              </button>
              <button onClick={()=>handleDelete(detail.id)}
                className="flex-1 py-2 border border-red-200 text-red-500 rounded-lg text-xs font-medium hover:bg-red-50">
                삭제
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
