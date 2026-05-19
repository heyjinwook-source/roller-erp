'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const STATUS_STYLE = {
  '견적':   'bg-blue-100 text-blue-700',
  '수주':   'bg-green-100 text-green-700',
  '생산':   'bg-amber-100 text-amber-700',
  '완료':   'bg-gray-100 text-gray-600',
  '취소':   'bg-red-100 text-red-500',
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('전체')
  const supabase = createClient()

  const load = async () => {
    const { data } = await supabase
      .from('quotes')
      .select('*, clients(name), quote_items(id)')
      .order('created_at', { ascending: false })
    setQuotes(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = quotes.filter(q => {
    const matchSearch = !search || q.quote_no?.includes(search) || q.clients?.name?.includes(search)
    const matchStatus = statusFilter === '전체' || q.status === statusFilter
    return matchSearch && matchStatus
  })

  const handleStatusChange = async (id, status) => {
    await supabase.from('quotes').update({ status }).eq('id', id)
    await load()
  }

  const handleConvertToOrder = async (quote) => {
    if (!confirm(`${quote.quote_no}을 수주로 전환하시겠습니까?`)) return
    const { error } = await supabase.from('orders').insert({
      client_id: quote.client_id,
      quote_id: quote.id,
      order_date: new Date().toISOString().slice(0, 10),
      status: '대기',
    })
    if (!error) {
      await supabase.from('quotes').update({ status: '수주' }).eq('id', quote.id)
      await load()
      alert('수주로 전환되었습니다. 수주현황에서 납기 등을 입력해 주세요.')
    }
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">견적 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">견적 세부 작성 → 최종 견적서 출력 → 수주 전환</p>
        </div>
        <Link href="/quotes/new"
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          + 새 견적 작성
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-4 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:border-gray-400"
            placeholder="견적번호·거래처 검색" />
          <div className="flex gap-1.5">
            {['전체', '견적', '수주', '생산', '완료', '취소'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {s}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400 ml-auto">{filtered.length}건</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                <th className="px-5 py-2.5 text-left font-medium">견적번호</th>
                <th className="px-4 py-2.5 text-left font-medium">거래처</th>
                <th className="px-4 py-2.5 text-left font-medium">날짜</th>
                <th className="px-4 py-2.5 text-right font-medium">품목수</th>
                <th className="px-4 py-2.5 text-right font-medium">합계금액</th>
                <th className="px-4 py-2.5 text-center font-medium">상태</th>
                <th className="px-4 py-2.5 text-center font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-10 text-center text-gray-300">로딩 중...</td></tr>
              ) : filtered.length ? filtered.map(q => (
                <tr key={q.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs text-gray-600">
                    <Link href={`/quotes/${q.id}`} className="hover:underline text-blue-600">{q.quote_no}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-800">{q.clients?.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{q.quote_date}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{q.quote_items?.length || 0}개</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {q.total_amount ? `₩${Number(q.total_amount).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[q.status] || 'bg-gray-100 text-gray-600'}`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link href={`/quotes/${q.id}`} className="text-xs text-blue-600 hover:underline mr-2">보기</Link>
                    {q.status === '견적' && (
                      <button onClick={() => handleConvertToOrder(q)}
                        className="text-xs text-green-600 hover:underline">수주전환</button>
                    )}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="py-10 text-center text-gray-300">견적 데이터가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
