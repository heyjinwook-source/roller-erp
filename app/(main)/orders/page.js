'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const STATUSES = ['대기', '가공중', 'CNC예정', '출고대기', '출고완료']
const STATUS_STYLE = {
  '대기':    'bg-gray-100 text-gray-600',
  '가공중':  'bg-blue-100 text-blue-700',
  'CNC예정': 'bg-purple-100 text-purple-700',
  '출고대기':'bg-amber-100 text-amber-700',
  '출고완료':'bg-green-100 text-green-700',
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('전체')
  const supabase = createClient()

  const load = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, clients(name), order_items(id, product_type, spec, quantity, status)')
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.order_no?.includes(search) || o.clients?.name?.includes(search)
    const matchStatus = statusFilter === '전체' || o.status === statusFilter
    return matchSearch && matchStatus
  })

  const handleStatusChange = async (id, status) => {
    await supabase.from('orders').update({ status }).eq('id', id)
    await load()
  }

  const handleDeliveryUpdate = async (id, date) => {
    await supabase.from('orders').update({ delivery_date: date }).eq('id', id)
    await load()
  }

  const counts = {
    전체: orders.length,
    ...Object.fromEntries(STATUSES.map(s => [s, orders.filter(o => o.status === s).length]))
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">수주현황</h1>
        <p className="text-sm text-gray-400 mt-0.5">수주 진행 상태를 관리합니다.</p>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-6 gap-3 mb-5">
        {[['전체', orders.length], ...STATUSES.map(s => [s, counts[s]])].map(([s, cnt]) => (
          <div key={s} onClick={() => setStatusFilter(s)}
            className={`cursor-pointer rounded-xl border p-3 transition-all ${statusFilter === s ? 'border-gray-400 bg-gray-100' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
            <div className="text-xs text-gray-500 mb-1">{s}</div>
            <div className="text-xl font-semibold text-gray-900">{cnt}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-4">
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:border-gray-400"
            placeholder="수주번호·거래처 검색" />
          <span className="text-xs text-gray-400 ml-auto">{filtered.length}건</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                <th className="px-5 py-2.5 text-left font-medium">수주번호</th>
                <th className="px-4 py-2.5 text-left font-medium">거래처</th>
                <th className="px-4 py-2.5 text-left font-medium">품목</th>
                <th className="px-4 py-2.5 text-left font-medium">수주일</th>
                <th className="px-4 py-2.5 text-left font-medium">납기</th>
                <th className="px-4 py-2.5 text-center font-medium">현황</th>
                <th className="px-4 py-2.5 text-center font-medium">상태 변경</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-10 text-center text-gray-300">로딩 중...</td></tr>
              ) : filtered.length ? filtered.map(o => (
                <tr key={o.id} className="border-t border-gray-50 hover:bg-gray-50 align-top">
                  <td className="px-5 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">{o.order_no}</td>
                  <td className="px-4 py-3 text-gray-800">{o.clients?.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {(o.order_items || []).slice(0, 2).map(i => (
                      <div key={i.id}>{i.product_type} {i.spec ? `(${i.spec.slice(0, 15)}...)` : ''} × {i.quantity}</div>
                    ))}
                    {(o.order_items?.length || 0) > 2 && <div className="text-gray-300">+ {o.order_items.length - 2}개 더</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{o.order_date}</td>
                  <td className="px-4 py-3">
                    <input type="date" defaultValue={o.delivery_date || ''}
                      onBlur={e => handleDeliveryUpdate(o.id, e.target.value)}
                      className="border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-gray-400 w-32" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[o.status] || 'bg-gray-100 text-gray-600'}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <select value={o.status} onChange={e => handleStatusChange(o.id, e.target.value)}
                      className="border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none bg-white">
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="py-10 text-center text-gray-300">수주 데이터가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
