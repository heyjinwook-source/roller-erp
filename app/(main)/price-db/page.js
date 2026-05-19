'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function PriceDbPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ part_name: '', spec: '', unit_price: '', unit: '개', notes: '' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const load = async () => {
    const { data } = await supabase.from('price_db').select('*').order('part_name')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = items.filter(i =>
    i.part_name?.includes(search) || i.spec?.includes(search)
  )

  const resetForm = () => { setForm({ part_name: '', spec: '', unit_price: '', unit: '개', notes: '' }); setEditId(null) }

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

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">단가 DB</h1>
        <p className="text-sm text-gray-400 mt-0.5">부품·자재의 기준 단가를 관리합니다. 견적 작성 시 자동 조회됩니다.</p>
      </div>

      {/* 입력 폼 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">{editId ? '단가 수정' : '새 단가 등록'}</h2>
        <div className="grid grid-cols-5 gap-3">
          <div className="col-span-1">
            <label className="text-xs text-gray-500 mb-1 block">품목명 *</label>
            <input value={form.part_name} onChange={e => setForm({ ...form, part_name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
              placeholder="예: 파이프" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">규격</label>
            <input value={form.spec} onChange={e => setForm({ ...form, spec: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
              placeholder="예: 파이프@50.8*1.4T" />
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
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {saving ? '저장 중...' : editId ? '수정 저장' : '등록'}
          </button>
          {editId && (
            <button onClick={resetForm} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              취소
            </button>
          )}
        </div>
      </div>

      {/* 검색 + 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-gray-800 shrink-0">등록 단가 ({filtered.length}건)</h2>
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-60 focus:outline-none focus:border-gray-400"
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
              ) : filtered.length ? filtered.map(item => (
                <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{item.part_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{item.spec}</td>
                  <td className="px-4 py-3 text-right font-mono">{Number(item.unit_price).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center text-gray-500 text-xs">{item.unit}</td>
                  <td className="px-4 py-3 text-center">
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
