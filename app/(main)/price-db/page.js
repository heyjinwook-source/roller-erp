'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'

export default function PriceDbPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ part_name: '', spec: '', unit_price: '', unit: '개', notes: '' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const fileRef = useRef(null)
  const supabase = createClient()

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('price_db').select('*').order('part_name').order('spec')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = items.filter(i =>
    !search || i.part_name?.includes(search) || i.spec?.includes(search)
  )

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
    resetForm(); await load(); setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('price_db').delete().eq('id', id)
    await load()
  }

  // Excel 다운로드
  const handleDownload = () => {
    import('https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs').then(XLSX => {
      const wb = XLSX.utils.book_new()
      const wsData = [
        ['품목명', '규격', '단가(원)', '단위', '비고'],
        ...items.map(i => [i.part_name, i.spec || '', i.unit_price, i.unit || '개', i.notes || ''])
      ]
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      ws['!cols'] = [{ wch: 25 }, { wch: 35 }, { wch: 12 }, { wch: 8 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, ws, '단가DB')

      const wsGuide = XLSX.utils.aoa_to_sheet([
        ['업로드 양식 안내'],
        [''],
        ['컬럼명', '설명', '필수여부', '예시'],
        ['품목명', '부품 이름', '필수', '파이프'],
        ['규격', '규격/사양', '선택', '42.7*1.8T'],
        ['단가(원)', '숫자만 입력', '필수', '2500'],
        ['단위', '개/mm/kg 등', '선택', '개'],
        ['비고', '추가 설명', '선택', ''],
        [''],
        ['※ 업로드 시 품목명+규격 동일하면 단가 업데이트, 없으면 신규 추가'],
      ])
      wsGuide['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 20 }]
      XLSX.utils.book_append_sheet(wb, wsGuide, '업로드안내')

      const today = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `단가DB_${today}.xlsx`)
    })
  }

  // Excel 업로드
  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)

    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      if (rows.length < 2) {
        setUploadResult({ type: 'error', msg: '데이터가 없습니다.' })
        setUploading(false); return
      }

      const header = rows[0].map(h => String(h).trim())
      const col = {
        name:  header.findIndex(h => h.includes('품목')),
        spec:  header.findIndex(h => h.includes('규격')),
        price: header.findIndex(h => h.includes('단가')),
        unit:  header.findIndex(h => h.includes('단위')),
        notes: header.findIndex(h => h.includes('비고')),
      }

      if (col.name < 0 || col.price < 0) {
        setUploadResult({ type: 'error', msg: '"품목명"과 "단가" 컬럼이 필요합니다.' })
        setUploading(false); return
      }

      // 기존 DB 조회 (품목명+규격 → id 맵)
      const { data: existing } = await supabase.from('price_db').select('id, part_name, spec')
      const existMap = {}
      ;(existing || []).forEach(r => { existMap[`${r.part_name}||${r.spec || ''}`] = r.id })

      const toInsert = [], toUpdate = []
      let skipCount = 0

      for (let ri = 1; ri < rows.length; ri++) {
        const row = rows[ri]
        const part_name = String(row[col.name] ?? '').trim()
        if (!part_name) { skipCount++; continue }

        const unit_price = Number(String(row[col.price] ?? '').replace(/,/g, ''))
        if (isNaN(unit_price) || unit_price <= 0) { skipCount++; continue }

        const spec    = col.spec  >= 0 ? String(row[col.spec]  ?? '').trim() : ''
        const unit    = col.unit  >= 0 ? String(row[col.unit]  ?? '').trim() || '개' : '개'
        const notes   = col.notes >= 0 ? String(row[col.notes] ?? '').trim() : ''

        const payload = { part_name, spec, unit_price, unit, notes, updated_at: new Date().toISOString() }
        const mapKey = `${part_name}||${spec}`

        if (existMap[mapKey]) {
          toUpdate.push({ id: existMap[mapKey], ...payload })
        } else {
          toInsert.push(payload)
        }
      }

      let insertedCount = 0, updatedCount = 0

      // 500건씩 나눠 insert
      for (let i = 0; i < toInsert.length; i += 500) {
        const chunk = toInsert.slice(i, i + 500)
        const { error } = await supabase.from('price_db').insert(chunk)
        if (!error) insertedCount += chunk.length
      }

      // update (병렬)
      const updateResults = await Promise.all(
        toUpdate.map(({ id, ...payload }) =>
          supabase.from('price_db').update(payload).eq('id', id)
        )
      )
      updatedCount = updateResults.filter(r => !r.error).length

      await load()
      setUploadResult({
        type: 'success',
        msg: `완료! 신규 추가 ${insertedCount}건 · 업데이트 ${updatedCount}건 · 건너뜀 ${skipCount}건`
      })
    } catch (err) {
      setUploadResult({ type: 'error', msg: `오류: ${err.message}` })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">단가 DB</h1>
          <p className="text-sm text-gray-400 mt-0.5">부품·자재의 기준 단가를 관리합니다.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleDownload}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors font-medium">
            ⬇ Excel 다운로드
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50">
            ⬆ {uploading ? '업로드 중...' : 'Excel 업로드'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {/* 업로드 결과 */}
      {uploadResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center justify-between ${
          uploadResult.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          <span>{uploadResult.msg}</span>
          <button onClick={() => setUploadResult(null)} className="ml-4 text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* 안내 박스 */}
      <div className="mb-5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-600 leading-relaxed">
        <strong className="text-blue-700">Excel 업로드 방법:</strong>&nbsp;
        ① Excel 다운로드 → ② 엑셀에서 단가 수정/추가 → ③ Excel 업로드&nbsp;&nbsp;
        <span className="text-blue-400">| 품목명+규격 동일 → 단가 업데이트 / 새 항목 → 자동 추가</span>
      </div>

      {/* 개별 입력 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{editId ? '단가 수정' : '개별 등록'}</h2>
        <div className="grid grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">품목명 *</label>
            <input value={form.part_name} onChange={e => setForm({ ...form, part_name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
              placeholder="예: 파이프" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">규격</label>
            <input value={form.spec} onChange={e => setForm({ ...form, spec: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
              placeholder="예: 42.7*1.8T" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">단가 (원) *</label>
            <input type="number" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 text-right"
              placeholder="0" />
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
          {editId && (
            <button onClick={resetForm} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
          )}
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-4">
          <h2 className="text-sm font-semibold text-gray-800 shrink-0">
            {loading ? '로딩 중...' : `총 ${filtered.length.toLocaleString()}건`}
          </h2>
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:border-gray-400"
            placeholder="품목명 또는 규격 검색" />
        </div>
        <div className="overflow-x-auto" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
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
              ) : filtered.length ? filtered.map(item => (
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
                <tr><td colSpan={5} className="py-10 text-center text-gray-300">등록된 단가가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
