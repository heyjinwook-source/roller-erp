'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const STATUS_STYLE = {
  '출고완료': 'bg-green-100 text-green-700',
  '대기':     'bg-gray-100 text-gray-600',
  '가공중':   'bg-blue-100 text-blue-700',
  '출고대기': 'bg-amber-100 text-amber-700',
  'CNC예정':  'bg-purple-100 text-purple-700',
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ orders: 0, pending: 0, done: 0, clients: 0, quotes: 0 })
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const [ordersRes, clientsRes, quotesRes, recentRes] = await Promise.all([
        supabase.from('orders').select('status'),
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('quotes').select('status'),
        supabase.from('orders').select('order_no, order_date, delivery_date, status, clients(name)')
          .order('created_at', { ascending: false }).limit(8),
      ])

      const orders = ordersRes.data || []
      const quotes = quotesRes.data || []
      setStats({
        orders: orders.length,
        pending: orders.filter(o => o.status !== '출고완료').length,
        done: orders.filter(o => o.status === '출고완료').length,
        clients: clientsRes.count || 0,
        quotes: quotes.filter(q => q.status === '견적').length,
      })
      setRecent(recentRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  const statCards = [
    { label: '총 수주', value: stats.orders, unit: '건', bg: 'bg-white' },
    { label: '진행 중', value: stats.pending, unit: '건', bg: 'bg-blue-50', textColor: 'text-blue-700' },
    { label: '출고 완료', value: stats.done, unit: '건', bg: 'bg-green-50', textColor: 'text-green-700' },
    { label: '검토 중 견적', value: stats.quotes, unit: '건', bg: 'bg-amber-50', textColor: 'text-amber-700' },
    { label: '거래처', value: stats.clients, unit: '개', bg: 'bg-white' },
  ]

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-400 mt-0.5">{today}</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {statCards.map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl border border-gray-200 p-4`}>
            <div className="text-xs text-gray-500 mb-2">{s.label}</div>
            <div className={`text-2xl font-semibold ${s.textColor || 'text-gray-900'}`}>
              {loading ? '—' : s.value.toLocaleString()}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{s.unit}</div>
          </div>
        ))}
      </div>

      {/* 최근 수주 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">최근 수주</h2>
          <a href="/orders" className="text-xs text-gray-400 hover:text-gray-700">전체 보기 →</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                <th className="px-5 py-2.5 text-left font-medium">수주번호</th>
                <th className="px-4 py-2.5 text-left font-medium">거래처</th>
                <th className="px-4 py-2.5 text-left font-medium">수주일</th>
                <th className="px-4 py-2.5 text-left font-medium">납기</th>
                <th className="px-4 py-2.5 text-left font-medium">현황</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-300 text-sm">로딩 중...</td></tr>
              ) : recent.length ? recent.map(o => (
                <tr key={o.order_no} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-gray-600">{o.order_no}</td>
                  <td className="px-4 py-3 text-gray-800">{o.clients?.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{o.order_date}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{o.delivery_date}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[o.status] || 'bg-gray-100 text-gray-600'}`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-300 text-sm">수주 데이터가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
