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
  const searchTimer = useRef(null)
  const dropRef = useRef(null)
  const supabase = createClient()

  async function loadClients() {
    const all = []
    let from = 0
    while (true) {
      const { data } = await supabase.from('clients').select('id, name').eq('is_active', true).order('name').range(from, from + 999)
      if (!data || !data.length) break
      all.push(...data)
      if (data.length < 1000) break
      from += 1000
    }
    setClients(all)
  }

  async function loadCounts() {
    const { data } = await supabase.from('quotes').select('status')
    if (data) {
      const c = { '전체': data.length }
      data.forEach(q => { c[q.status] = (c[q.status] || 0) + 1 })
      setCounts(c)
    }
  }

  async function fetchQuotes(keyword, status, clientId, pageNum) {
    setLoading(true)
    const from = (pageNum - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let query = supabase
      .from('quotes')
      .select('*, clients(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (keyword) query = query.or(`quote_no.ilike.%${keyword}%`)
    if (status !== '전체') query = query.eq('status', status)
    if (clientId) query = query.eq('client_id', clientId)
    const { data, count } = await query
    setQuotes(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  useEffect(() => { fetchQuotes('', '전체', '', 1); loadClients(); loadCounts() }, [])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); fetchQuotes(search, statusFilter, clientFilter, 1) }, 350)
    return () => clearTimeout(searchTimer.current)
  }, [search, statusFilter, clientFilter])

  useEffect(() => {
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowClientDrop(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function goPage(p) { setPage(p); fetchQuotes(search, statusFilter, clientFilter, p) }
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const getPageNums = () => {
    const delta = 2, range = []
    const left = Math.max(1, page - delta), right = Math.min(totalPages, page + delta)
    if (left > 1) { range.push(1); if (left > 2) range.push('...') }
    for (let i = left; i <= right; i++) range.push(i)
    if (right < totalPages) { if (right < totalPages - 1) range.push('...'); range.push(totalPages) }
    return range
  }

  const selectedClient = clients.find(c => c.id === clientFilter)

  async function handleDelete(id, quoteNo) {
    if (!confirm(`견적 ${quoteNo}을 삭제하시겠습니까?\n품목 데이터도 함께 삭제됩니다.`)) return
    await supabase.from('quote_items').delete().eq('quote_id', id)
    await supabase.from('quotes').delete().eq('id', id)
    fetchQuotes(search, statusFilter, clientFilter, page)
    loadCounts()
  }

  const filteredClients = clients.filter(c => !clientFilter || c.name.includes(selectedClient?.name || ''))

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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 필터 바 */}
        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
          {/* 상태 필터 */}
          <div className="flex gap-1.5 flex-wrap">
            {['전체', '견적', '수주', '생산', '완료', '취소'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {s} {counts[s] !== undefined ? `(${counts[s]})` : ''}
              </button>
            ))}
          </div>
          {/* 검색 + 거래처 */}
          <div className="flex gap-3 flex-wrap items-center">
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:border-gray-400"
              placeholder="견적번호 검색" />

            {/* 거래처 필터 드롭다운 */}
            <div className="relative" ref={dropRef}>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-gray-400 bg-white">
                <span className="px-3 text-xs text-gray-400 whitespace-nowrap border-r border-gray-200 py-2">거래처</span>
                <input
                  value={selectedClient ? selectedClient.name : ''}
                  onChange={e => { if (!e.target.value) setClientFilter(''); setShowClientDrop(true) }}
                  onFocus={() => setShowClientDrop(true)}
                  placeholder="전체"
                  readOnly={!!clientFilter}
                  className="px-3 py-2 text-sm w-40 focus:outline-none bg-transparent cursor-pointer" />
                {clientFilter && (
                  <button onClick={() => { setClientFilter(''); setShowClientDrop(false) }}
                    className="px-2 text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
                )}
                <button onClick={() => setShowClientDrop(v => !v)}
                  className="px-2 py-2 text-gray-400 border-l border-gray-200 text-xs">{showClientDrop ? '▲' : '▼'}</button>
              </div>
              {showClientDrop && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                  <div onClick={() => { setClientFilter(''); setShowClientDrop(false) }}
                    className="px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 cursor-pointer border-b border-gray-100">전체 보기</div>
                  {clients.map(c => (
                    <div key={c.id} onClick={() => { setClientFilter(c.id); setShowClientDrop(false) }}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${clientFilter === c.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}>
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
                <tr key={q.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-2.5 font-mono text-xs text-gray-600">{q.quote_no}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{q.clients?.name}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{q.quote_date}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm">
                    {q.total_amount ? `₩${Number(q.total_amount).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[q.status] || 'bg-gray-100 text-gray-600'}`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Link href={`/quotes/${q.id}`} className="text-xs text-blue-600 hover:underline mr-3">보기/수주전환</Link>
                    <button onClick={() => handleDelete(q.id, q.quote_no)} className="text-xs text-red-500 hover:underline">삭제</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="py-10 text-center text-gray-300">견적 데이터가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
            <span className="text-xs text-gray-400">{page}/{totalPages} 페이지</span>
            <div className="flex items-center gap-1">
              <button onClick={() => goPage(1)} disabled={page===1} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">◀◀</button>
              <button onClick={() => goPage(page-1)} disabled={page===1} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">◀</button>
              {getPageNums().map((p,i) => p==='...'
                ? <span key={i} className="px-2 py-1 text-xs text-gray-300">···</span>
                : <button key={p} onClick={() => goPage(p)}
                    className={`px-3 py-1 text-xs rounded border ${p===page?'bg-gray-900 text-white border-gray-900':'border-gray-200 hover:bg-gray-50'}`}>{p}</button>
              )}
              <button onClick={() => goPage(page+1)} disabled={page===totalPages} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">▶</button>
              <button onClick={() => goPage(totalPages)} disabled={page===totalPages} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">▶▶</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
