'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const PAGE_SIZE = 50

export default function PriceDbPage() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [partNames, setPartNames] = useState([])       // 품목명 드롭다운 목록
  const [searchName, setSearchName] = useState('')     // 품목명 검색
  const [searchSpec, setSearchSpec] = useState('')     // 규격 검색
  const [showDropdown, setShowDropdown] = useState(false)
  const [form, setForm] = useState({ part_name: '', spec: '', unit_price: '', unit: '개', notes: '' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const fileRef = useRef(null)
  const nameTimer = useRef(null)
  const specTimer = useRef(null)
  const dropdownRef = useRef(null)
  const supabase = createClient()

  // 고유 품목명 목록 로드
  const loadPartNames = useCallback(async () => {
    const { data } = await supabase
      .from('price_db')
      .select('part_name')
      .order('part_name')
    if (data) {
      const unique = [...new Set(data.map(d => d.part_name))].filter(Boolean)
      setPartNames(unique)
    }
  }, [])

  const fetchItems = useCallback(async (name, spec, pageNum) => {
    setLoading(true)
    const from = (pageNum - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let query = supabase
      .from('price_db')
      .select('*', { count: 'exact' })
      .order('part_name').order('spec')
      .range(from, to)
    if (name) query = query.ilike('part_name', `%${name}%`)
    if (spec) query = query.ilike('spec', `%${spec}%`)
    const { data, count } = await query
    setItems(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchItems('', '', 1)
    loadPartNames()
  }, [fetchItems, loadPartNames])

  // 품목명 검색 디바운스
  useEffect(() => {
    clearTimeout(nameTimer.current)
    nameTimer.current = setTimeout(() => { setPage(1); fetchItems(searchName, searchSpec, 1) }, 350)
    return () => clearTimeout(nameTimer.current)
  }, [searchName])

  // 규격 검색 디바운스
  useEffect(() => {
    clearTimeout(specTimer.current)
    specTimer.current = setTimeout(() => { setPage(1); fetchItems(searchName, searchSpec, 1) }, 350)
    return () => clearTimeout(specTimer.current)
  }, [searchSpec])

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const goPage = (p) => { setPage(p); fetchItems(searchName, searchSpec, p) }
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const resetSearch = () => {
    setSearchName(''); setSearchSpec(''); setPage(1)
    fetchItems('', '', 1)
  }

  // 드롭다운 필터링
  const filteredNames = partNames.filter(n =>
    !searchName || n.toLowerCase().includes(searchName.toLowerCase())
  ).slice(0, 50)

  const selectName = (name) => {
    setSearchName(name)
    setShowDropdown(false)
    setPage(1)
    fetchItems(name, searchSpec, 1)
  }

  const resetForm = () => {
    setForm({ part_name: '', spec: '', unit_price: '', unit: '개', notes: '' })
    setEditId(null)
  }

  const handleEdit = (item) => {
    setForm({ part_name: item.part_name, spec: item.spec || '', unit_price: item.unit_price, unit: item.unit || '개', notes: item.notes || '' })
    setEditId(item.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = async () => {
    if (!form.part_name || !form.unit_price) return alert('품목명과 단가는 필수입니다.')
    setSaving(true)
    const payload = { ...form, unit_price: Number(form.unit_price), updated_at: new Date().toISOString() }
    if (editId) {
      await supabase.from('price_db').update(payload).eq('id', editId)
    } else {
      await supabase.from('price_db').insert(payload)
    }
    resetForm(); fetchItems(searchName, searchSpec, page); loadPartNames(); setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('price_db').delete().eq('id', id)
    fetchItems(searchName, searchSpec, page); loadPartNames()
  }

  const fetchAll = async () => {
    const all = []
    let from = 0
    while (true) {
      const { data } = await supabase.from('price_db').select('*')
        .order('part_name').order('spec').range(from, from + 999)
      if (!data || data.length === 0) break
      all.push(...data)
      if (data.length < 1000) break
      from += 1000
    }
    return all
  }

  const handleDownload = async () => {
    const all = await fetchAll()
    const header = ['품목명', '규격', '단가(원)', '단위', '비고']
    const rows = all.map(i => [i.part_name, i.spec || '', i.unit_price, i.unit || '개', i.notes || ''])
    const csv = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `단가DB_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true); setUploadResult(null)
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(l => l.trim())
      const parseRow = (line) => {
        const result = []; let cur = '', inQ = false
        for (const ch of line) {
          if (ch === '"') inQ = !inQ
          else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = '' }
          else cur += ch
        }
        result.push(cur.trim())
        return result
      }
      const rows = lines.map(parseRow)
      if (rows.length < 2) { setUploadResult({ type: 'error', msg: '데이터가 없습니다.' }); setUploading(false); return }
      const header = rows[0].map(h => h.replace(/"/g,'').trim())
      const col = {
        name:  header.findIndex(h => h.includes('품목')),
        spec:  header.findIndex(h => h.includes('규격')),
        price: header.findIndex(h => h.includes('단가')),
        unit:  header.findIndex(h => h.includes('단위')),
        notes: header.findIndex(h => h.includes('비고')),
      }
      if (col.name < 0 || col.price < 0) { setUploadResult({ type: 'error', msg: '"품목명"과 "단가" 컬럼이 필요합니다.' }); setUploading(false); return }
      const { data: existing } = await supabase.from('price_db').select('id, part_name, spec')
      const existMap = {}
      ;(existing || []).forEach(r => { existMap[`${r.part_name}||${r.spec || ''}`] = r.id })
      const toInsert = [], toUpdate = []; let skipCount = 0
      for (let ri = 1; ri < rows.length; ri++) {
        const row = rows[ri]
        const part_name = (row[col.name] || '').replace(/"/g,'').trim()
        if (!part_name) { skipCount++; continue }
        const unit_price = Number((row[col.price] || '').replace(/[",]/g,'').trim())
        if (isNaN(unit_price) || unit_price <= 0) { skipCount++; continue }
        const spec  = col.spec  >= 0 ? (row[col.spec]  || '').replace(/"/g,'').trim() : ''
        const unit  = col.unit  >= 0 ? (row[col.unit]  || '').replace(/"/g,'').trim() || '개' : '개'
        const notes = col.notes >= 0 ? (row[col.notes] || '').replace(/"/g,'').trim() : ''
        const payload = { part_name, spec, unit_price, unit, notes, updated_at: new Date().toISOString() }
        const mapKey = `${part_name}||${spec}`
        if (existMap[mapKey]) toUpdate.push({ id: existMap[mapKey], ...payload })
        else toInsert.push(payload)
      }
      let insertedCount = 0, updatedCount = 0
      for (let i = 0; i < toInsert.length; i += 500) {
        const { error } = await supabase.from('price_db').insert(toInsert.slice(i, i + 500))
        if (!error) insertedCount += Math.min(500, toInsert.length - i)
      }
      const results = await Promise.all(toUpdate.map(({ id, ...p }) => supabase.from('price_db').update(p).eq('id', id)))
      updatedCount = results.filter(r => !r.error).length
      setPage(1); fetchItems(searchName, searchSpec, 1); loadPartNames()
      setUploadResult({ type: 'success', msg: `완료! 신규 ${insertedCount}건 · 업데이트 ${updatedCount}건 · 건너뜀 ${skipCount}건` })
    } catch (err) {
      setUploadResult({ type: 'error', msg: `오류: ${err.message}` })
    } finally { setUploading(false); e.target.value = '' }
  }

  const getPageNums = () => {
    const delta = 2, range = []
    const left = Math.max(1, page - delta), right = Math.min(totalPages, page + delta)
    if (left > 1) { range.push(1); if (left > 2) range.push('...') }
    for (let i = left; i <= right; i++) range.push(i)
    if (right < totalPages) { if (right < totalPages - 1) range.push('...'); range.push(totalPages) }
    return range
  }

  const hasFilter = searchName || searchSpec

  return (
    <div className="p-6 max-w-5xl">
      {/* 헤더 */}
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">단가 DB</h1>
          <p className="text-sm text-gray-400 mt-0.5">부품·자재의 기준 단가를 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDownload}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 font-medium">
            ⬇ CSV 다운로드
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
            ⬆ {uploading ? '업로드 중...' : 'CSV 업로드'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {uploadResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center justify-between ${
          uploadResult.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          <span>{uploadResult.msg}</span>
          <button onClick={() => setUploadResult(null)} className="ml-4 text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* 개별 등록 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{editId ? '단가 수정' : '개별 등록'}</h2>
        <div className="grid grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">품목명 *</label>
            <input value={form.part_name} onChange={e => setForm({ ...form, part_name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" placeholder="예: 파이프" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">규격</label>
            <input value={form.spec} onChange={e => setForm({ ...form, spec: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" placeholder="예: 42.7*1.8T" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">단가 (원) *</label>
            <input type="number" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 text-right" placeholder="0" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">단위</label>
            <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 bg-white">
              {['개', 'mm', 'm', 'kg', 'EA', 'SET'].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
            {saving ? '저장 중...' : editId ? '수정 저장' : '등록'}
          </button>
          {editId && <button onClick={resetForm} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>}
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 검색 바 */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">

            {/* 품목명 드롭다운+검색 */}
            <div className="relative" ref={dropdownRef}>
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-gray-400 bg-white">
                <span className="px-3 text-xs text-gray-400 whitespace-nowrap border-r border-gray-200 py-2">품목명</span>
                <input
                  value={searchName}
                  onChange={e => { setSearchName(e.target.value); setShowDropdown(true) }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="검색 또는 선택"
                  className="px-3 py-2 text-sm w-44 focus:outline-none bg-transparent" />
                {searchName && (
                  <button onClick={() => { setSearchName(''); setShowDropdown(false) }}
                    className="px-2 text-gray-300 hover:text-gray-500 text-lg">×</button>
                )}
                <button onClick={() => setShowDropdown(v => !v)}
                  className="px-2 py-2 text-gray-400 hover:text-gray-600 border-l border-gray-200 text-xs">
                  {showDropdown ? '▲' : '▼'}
                </button>
              </div>

              {/* 드롭다운 목록 */}
              {showDropdown && filteredNames.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                  <div
                    className="px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                    onClick={() => { setSearchName(''); setShowDropdown(false); setPage(1); fetchItems('', searchSpec, 1) }}>
                    전체 보기
                  </div>
                  {filteredNames.map(name => (
                    <div key={name}
                      onClick={() => selectName(name)}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${searchName === name ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}>
                      {name}
                    </div>
                  ))}
                  {filteredNames.length === 50 && (
                    <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">더 입력하면 좁혀집니다</div>
                  )}
                </div>
              )}
            </div>

            {/* 규격 검색 */}
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-gray-400 bg-white">
              <span className="px-3 text-xs text-gray-400 whitespace-nowrap border-r border-gray-200 py-2">규격</span>
              <input
                value={searchSpec}
                onChange={e => setSearchSpec(e.target.value)}
                placeholder="규격 검색"
                className="px-3 py-2 text-sm w-40 focus:outline-none bg-transparent" />
              {searchSpec && (
                <button onClick={() => setSearchSpec('')}
                  className="px-2 text-gray-300 hover:text-gray-500 text-lg">×</button>
              )}
            </div>

            {/* 초기화 + 결과 */}
            {hasFilter && (
              <button onClick={resetSearch}
                className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                초기화
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {loading ? '검색 중...' : `${total.toLocaleString()}건`}
            </span>
          </div>
        </div>

        {/* 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                <th className="px-5 py-2.5 text-left font-medium">품목명</th>
                <th className="px-4 py-2.5 text-left font-medium">규격</th>
                <th className="px-4 py-2.5 text-right font-medium">단가 (원)</th>
                <th className="px-4 py-2.5 text-center font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-10 text-center text-gray-300">검색 중...</td></tr>
              ) : items.length ? items.map(item => (
                <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-2.5 font-medium text-gray-800">{item.part_name}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{item.spec}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{Number(item.unit_price).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => handleEdit(item)} className="text-xs text-blue-600 hover:underline mr-3">수정</button>
                    <button onClick={() => handleDelete(item.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="py-10 text-center text-gray-300">검색 결과가 없습니다</td></tr>
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
