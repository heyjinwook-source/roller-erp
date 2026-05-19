'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function ClientsPage() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', short_name: '', phone: '', email: '', address: '', notes: '' })
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const load = async () => {
    const { data } = await supabase.from('clients').select('*').eq('is_active', true).order('name')
    setClients(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = clients.filter(c =>
    c.name?.includes(search) || c.short_name?.includes(search) || c.phone?.includes(search)
  )

  const resetForm = () => { setForm({ name: '', short_name: '', phone: '', email: '', address: '', notes: '' }); setEditId(null); setShowForm(false) }

  const handleEdit = (c) => {
    setForm({ name: c.name, short_name: c.short_name || '', phone: c.phone || '', email: c.email || '', address: c.address || '', notes: c.notes || '' })
    setEditId(c.id); setShowForm(true)
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
    resetForm(); await load(); setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('거래처를 비활성화하시겠습니까?')) return
    await supabase.from('clients').update({ is_active: false }).eq('id', id)
    await load()
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">거래처 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">업체 정보 및 거래 이력을 관리합니다.</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          + 거래처 추가
        </button>
      </div>

      {/* 입력 폼 */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{editId ? '거래처 수정' : '새 거래처 등록'}</h2>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">거래처명 *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                placeholder="(주)에이팩이엔지" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">약칭</label>
              <input value={form.short_name} onChange={e => setForm({ ...form, short_name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                placeholder="에이팩" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">연락처</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                placeholder="02-0000-0000" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">이메일</label>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                placeholder="contact@company.com" />
            </div>
            <div className="col-span-2">
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
            <button onClick={resetForm} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-4">
          <h2 className="text-sm font-semibold text-gray-800 shrink-0">거래처 목록 ({filtered.length}개)</h2>
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-60 focus:outline-none focus:border-gray-400"
            placeholder="거래처명·전화번호 검색" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                <th className="px-5 py-2.5 text-left font-medium">거래처명</th>
                <th className="px-4 py-2.5 text-left font-medium">약칭</th>
                <th className="px-4 py-2.5 text-left font-medium">연락처</th>
                <th className="px-4 py-2.5 text-left font-medium">이메일</th>
                <th className="px-4 py-2.5 text-center font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-10 text-center text-gray-300">로딩 중...</td></tr>
              ) : filtered.length ? filtered.map(c => (
                <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{c.name}</td>
                  <td className="px-4 py-3 text-gray-500">{c.short_name}</td>
                  <td className="px-4 py-3 text-gray-500">{c.phone}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.email}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleEdit(c)} className="text-xs text-blue-600 hover:underline mr-3">수정</button>
                    <button onClick={() => handleDelete(c.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="py-10 text-center text-gray-300">등록된 거래처가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
