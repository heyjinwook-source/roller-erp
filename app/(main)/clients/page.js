'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const PAGE_SIZE = 30

export default function ClientsPage() {
  const [clients, setClients] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', short_name: '', phone: '', mobile: '', email: '', address: '', rep_name: '', manager: '', biz_no: '', industry: '', notes: '' })
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState(null)
  const searchTimer = useRef(null)
  const supabase = createClient()

  const fetchClients = useCallback(async (keyword, pageNum) => {
    setLoading(true)
    const from = (pageNum - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let query = supabase
      .from('clients')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('name')
      .range(from, to)
    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%,short_name.ilike.%${keyword}%`)
    }
    const { data, count } = await query
    setClients(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [])

  useEffect(() => { fetchClients('', 1) }, [fetchClients])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); fetchClients(search, 1) }, 350)
    return () => clearTimeout(searchTimer.current)
  }, [search, fetchClients])

  const goPage = (p) => { setPage(p); fetchClients(search, p) }
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const getPageNums = () => {
    const delta = 2, range = []
    const left = Math.max(1, page - delta), right = Math.min(totalPages, page + delta)
    if (left > 1) { range.push(1); if (left > 2) range.push('...') }
    for (let i = left; i <= right; i++) range.push(i)
    if (right < totalPages) { if (right < totalPages - 1) range.push('...'); range.push(totalPages) }
    return range
  }

  const resetForm = () => {
    setForm({ name: '', short_name: '', phone: '', mobile: '', email: '', address: '', rep_name: '', manager: '', biz_no: '', industry: '', notes: '' })
    setEditId(null); setShowForm(false)
  }

  const handleEdit = (c) => {
    setForm({
      name: c.name || '', short_name: c.short_name || '',
      phone: c.phone || '', mobile: c.mobile || '',
      email: c.email || '', address: c.address || '',
      rep_name: c.rep_name || '', manager: c.manager || '',
      biz_no: c.biz_no || '', industry: c.industry || '', notes: c.notes || ''
    })
    setEditId(c.id); setShowForm(true); setDetail(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = async () => {
    if (!form.name) return alert('거래처명은 필수입니다.')
    setSaving(true)
    if (editId) {
      await supabase.from('clients').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editId)
    } else {
      await supabase.from('clients').insert(form)
    }
    resetForm(); fetchClients(search, page); setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('거래처를 비활성화하시겠습니까?')) return
    await supabase.from('clients').update({ is_active: false }).eq('id', id)
    setDetail(null); fetchClients(search, page)
  }

  const FIELDS = [
    { label: '거래처명 *', key: 'name', placeholder: '(주)에이팩이엔지' },
    { label: '약칭', key: 'short_name', placeholder: '에이팩' },
    { label: '대표자', key: 'rep_name', placeholder: '홍길동' },
    { label: '전화번호', key: 'phone', placeholder: '02-0000-0000' },
    { label: '핸드폰', key: 'mobile', placeholder: '010-0000-0000' },
    { label: '담당자', key: 'manager', placeholder: '담당자명' },
    { label: '이메일', key: 'email', placeholder: 'contact@company.com' },
    { label: '사업자번호', key: 'biz_no', placeholder: '000-00-00000' },
    { label: '업종', key: 'industry', placeholder: '제조업' },
  ]

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">거래처 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">업체 정보 및 거래 이력을 관리합니다.</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); setDetail(null) }}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700">
          + 거래처 추가
        </button>
      </div>

      {/* 등록/수정 폼 */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{editId ? '거래처 수정' : '새 거래처 등록'}</h2>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {FIELDS.map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                <input value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                  placeholder={placeholder} />
              </div>
            ))}
            <div className="col-span-3">
              <label className="text-xs text-gray-500 mb-1 block">주소</label>
              <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                placeholder="서울시 ..." />
            </div>
            <div className="col-span-3">
              <label className="text-xs text-gray-500 mb-1 block">메모</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
              {saving ? '저장 중...' : editId ? '수정 저장' : '등록'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
          </div>
        </div>
      )}

      <div className="flex gap-4 items-start">
        {/* 목록 */}
        <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${detail ? 'flex-1 min-w-0' : 'w-full'}`}>
          {/* 검색 */}
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-4 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-800 shrink-0">
              전체 {total.toLocaleString()}개
            </h2>
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:border-gray-400"
              placeholder="거래처명·전화번호 검색" />
            {search && !loading && (
              <span className="text-xs text-gray-400">검색 결과 {total.toLocaleString()}개</span>
            )}
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-5 py-2.5 text-left font-medium">거래처명</th>
                  {!detail && <th className="px-4 py-2.5 text-left font-medium">대표자</th>}
                  {!detail && <th className="px-4 py-2.5 text-left font-medium">연락처</th>}
                  {!detail && <th className="px-4 py-2.5 text-left font-medium">이메일</th>}
                  <th className="px-4 py-2.5 text-center font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="py-10 text-center text-gray-300">로딩 중...</td></tr>
                ) : clients.length ? clients.map(c => (
                  <tr key={c.id}
                    className={`border-t border-gray-50 cursor-pointer transition-colors ${detail?.id === c.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    onClick={() => setDetail(detail?.id === c.id ? null : c)}>
                    <td className="px-5 py-2.5 font-medium text-gray-800">{c.name}</td>
                    {!detail && <td className="px-4 py-2.5 text-gray-500 text-xs">{c.rep_name}</td>}
                    {!detail && <td className="px-4 py-2.5 text-gray-500 text-xs">{c.phone}</td>}
                    {!detail && <td className="px-4 py-2.5 text-gray-400 text-xs">{c.email}</td>}
                    <td className="px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setDetail(detail?.id === c.id ? null : c)}
                        className={`text-xs mr-2 hover:underline ${detail?.id === c.id ? 'text-blue-700 font-medium' : 'text-gray-500'}`}>
                        상세
                      </button>
                      <button onClick={() => handleEdit(c)} className="text-xs text-blue-600 hover:underline mr-2">수정</button>
                      <button onClick={() => handleDelete(c.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="py-10 text-center text-gray-300">검색 결과가 없습니다</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
              <span className="text-xs text-gray-400">
                {page}/{totalPages} 페이지 ({((page-1)*PAGE_SIZE+1).toLocaleString()}~{Math.min(page*PAGE_SIZE,total).toLocaleString()}번)
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => goPage(1)} disabled={page===1} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">◀◀</button>
                <button onClick={() => goPage(page-1)} disabled={page===1} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">◀</button>
                {getPageNums().map((p,i) => p==='...'
                  ? <span key={i} className="px-2 py-1 text-xs text-gray-300">···</span>
                  : <button key={p} onClick={() => goPage(p)}
                      className={`px-3 py-1 text-xs rounded border transition-colors ${p===page?'bg-gray-900 text-white border-gray-900':'border-gray-200 hover:bg-gray-50'}`}>{p}</button>
                )}
                <button onClick={() => goPage(page+1)} disabled={page===totalPages} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">▶</button>
                <button onClick={() => goPage(totalPages)} disabled={page===totalPages} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">▶▶</button>
              </div>
            </div>
          )}
        </div>

        {/* 상세보기 패널 */}
        {detail && (
          <div className="w-72 shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-6">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <div className="text-sm font-semibold text-gray-900 leading-tight">{detail.name}</div>
                {detail.short_name && <div className="text-xs text-gray-400 mt-0.5">{detail.short_name}</div>}
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-300 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: '대표자', value: detail.rep_name },
                { label: '담당자', value: detail.manager },
                { label: '전화번호', value: detail.phone },
                { label: '핸드폰', value: detail.mobile },
                { label: '이메일', value: detail.email },
                { label: '사업자번호', value: detail.biz_no },
                { label: '업종', value: detail.industry },
                { label: '주소', value: detail.address },
                { label: '메모', value: detail.notes },
              ].filter(item => item.value).map(({ label, value }) => (
                <div key={label}>
                  <div className="text-xs text-gray-400 mb-0.5">{label}</div>
                  <div className="text-sm text-gray-800 leading-relaxed break-words">{value}</div>
                </div>
              ))}
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => handleEdit(detail)}
                className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-700">수정</button>
              <button onClick={() => handleDelete(detail.id)}
                className="flex-1 py-2 border border-red-200 text-red-500 rounded-lg text-xs font-medium hover:bg-red-50">삭제</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
