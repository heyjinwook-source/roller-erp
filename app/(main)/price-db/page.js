'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const PAGE_SIZE = 50

export default function PriceDbPage() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ part_name: '', spec: '', unit_price: '', unit: '개', notes: '' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const fileRef = useRef(null)
  const searchTimer = useRef(null)
  const supabase = createClient()

  const fetchItems = useCallback(async (keyword, pageNum) => {
    setLoading(true)
    const from = (pageNum - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let query = supabase
      .from('price_db')
      .select('*', { count: 'exact' })
      .order('part_name').order('spec')
      .range(from, to)
    if (keyword) query = query.or(`part_name.ilike.%${keyword}%,spec.ilike.%${keyword}%`)
    const { data, count } = await query
    setItems(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems('', 1) }, [fetchItems])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); fetchItems(search, 1) }, 400)
    return () => clearTimeout(searchTimer.current)
  }, [search, fetchItems])

  const goPage = (p) => { setPage(p); fetchItems(search, p) }
  const totalPages = Math.ceil(total / PAGE_SIZE)

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
    resetForm(); fetchItems(search, page); setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('price_db').delete().eq('id', id)
    fetchItems(search, page)
  }

  // 전체 데이터 페이지별 조회
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

  // CSV 다운로드 (xlsx 불필요)
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

  // CSV 업로드
  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true); setUploadResult(null)
    try {
      const text = await file.text()
      const lines = text.split('\n').filter(l => l.trim())

      // CSV 파싱 (따옴표 처리)
      const parseRow = (line) => {
        const result = []; let cur = '', inQ = false
        for (const ch of line) {
          if (ch === '"') { inQ = !inQ }
          else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = '' }
          else { cur += ch }
        }
        result.push(cur.trim())
        return result
      }

      const rows = lines.map(parseRow)
      if (rows.length < 2) {
        setUploadResult({ type: 'error', msg: '데이터가 없습니다.' }); setUploading(false); return
      }

      const header = rows[0].map(h => h.replace(/"/g,'').trim())
      const col = {
        name:  header.findIndex(h => h.includes('품목')),
        spec:  header.findIndex(h => h.includes('규격')),
        price: header.findIndex(h => h.includes('단가')),
        unit:  header.findIndex(h => h.includes('단위')),
        notes: header.findIndex(h => h.includes('비고')),
      }

      if (col.name < 0 || col.price < 0) {
        setUploadResult({ type: 'error', msg: '"품목명"과 "단가" 컬럼이 필요합니다.' }); setUploading(false); return
      }

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
        if (existMap[mapKey]) { toUpdate.push({ id: existMap[mapKey], ...payload }) }
        else { toInsert.push(payload) }
      }

      let insertedCount = 0, updatedCount = 0
      for (let i = 0; i < toInsert.length; i += 500) {
        const { error } = await supabase.from('price_db').insert(toInsert.slice(i, i + 500))
        if (!error) insertedCount += Math.min(500, toInsert.length - i)
      }
      const results = await Promise.all(
        toUpdate.map(({ id, ...p }) => supabase.from('price_db').update(p).eq('id', id))
      )
      updatedCount = results.filter(r => !r.error).length
      setPage(1); fetchItems(search, 1)
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

  return (
    <div className="p-6 max-w-5xl">
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

      <div className="mb-5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-600">
        <strong className="text-blue-700">사용법:</strong>&nbsp;
        CSV 다운로드 → 엑셀에서 수정 → CSV로 저장 → CSV 업로드&nbsp;
        <span className="text-blue-400">| 품목명+규격 동일 → 업데이트 / 새 항목 → 자동 추가</span>
      </div>

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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-4 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-800 shrink-0">전체 {total.toLocaleString()}건</h2>
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:border-gray-400"
            placeholder="품목명 또는 규격 검색" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                <th className="px-5 py-2.5 text-left font-medium">품목명</th>
                <th className="px-4 py-2.5 text-left font-medium">규격</th>
                <th className="px-4 py-2.5 text-right font-medium">단가 (원)</th>
                <th className="px-4 py-2.5 text-center font-medium">단위</th>
                <th className="px-4 py-2.5 text-center font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-10 text-center text-gray-300">로딩 중...</td></tr>
              ) : items.length ? items.map(item => (
                <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-2.5 font-medium text-gray-800">{item.part_name}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{item.spec}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{Number(item.unit_price).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-center text-gray-400 text-xs">{item.unit}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => handleEdit(item)} className="text-xs text-blue-600 hover:underline mr-3">수정</button>
                    <button onClick={() => handleDelete(item.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="py-10 text-center text-gray-300">검색 결과가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
