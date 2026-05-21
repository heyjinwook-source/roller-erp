'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function SettingsPage() {
  const [tab, setTab] = useState('products')

  // ── 품목 관리 ──
  const [products, setProducts] = useState([])
  const [newProduct, setNewProduct] = useState('')
  const [editingProduct, setEditingProduct] = useState(null) // { index, value }
  const [prodSaving, setProdSaving] = useState(false)

  // ── BOM 템플릿 관리 ──
  const [boms, setBoms] = useState([])
  const [bomLoading, setBomLoading] = useState(true)
  const [bomForm, setBomForm] = useState({ product_type: '', part_name: '', part_spec: '', sort_order: 0 })
  const [editingBom, setEditingBom] = useState(null)
  const [bomSaving, setBomSaving] = useState(false)
  const [bomFilter, setBomFilter] = useState('')

  const supabase = createClient()

  // ── 품목 목록 로드 ──
  async function loadProducts() {
    try {
      const { data, error } = await supabase.from('product_types').select('*').order('sort_order').order('name')
      if (error) { console.error('product_types 로드 오류:', error.message); return }
      setProducts(data || [])
    } catch(e) { console.error(e) }
  }

  // ── BOM 로드 ──
  async function loadBoms() {
    setBomLoading(true)
    try {
      const { data, error } = await supabase.from('bom_templates').select('*').order('product_type').order('sort_order')
      if (error) { console.error('bom_templates 로드 오류:', error.message); setBomLoading(false); return }
      setBoms(data || [])
    } catch(e) { console.error(e) }
    setBomLoading(false)
  }

  useEffect(() => { loadProducts(); loadBoms() }, [])

  // 품목 추가
  async function addProduct() {
    const name = newProduct.trim()
    if (!name) return
    if (products.find(p => p.name === name)) return alert('이미 존재하는 품목입니다.')
    setProdSaving(true)
    const maxOrder = products.length ? Math.max(...products.map(p => p.sort_order || 0)) + 1 : 0
    await supabase.from('product_types').insert({ name, sort_order: maxOrder })
    setNewProduct('')
    await loadProducts()
    setProdSaving(false)
  }

  // 품목 수정
  async function saveProduct() {
    if (!editingProduct) return
    const name = editingProduct.value.trim()
    if (!name) return
    setProdSaving(true)
    await supabase.from('product_types').update({ name }).eq('id', editingProduct.id)
    setEditingProduct(null)
    await loadProducts()
    setProdSaving(false)
  }

  // 품목 삭제
  async function deleteProduct(id, name) {
    if (!confirm(`"${name}" 품목을 삭제하시겠습니까?\n관련 BOM 템플릿도 함께 삭제됩니다.`)) return
    await supabase.from('bom_templates').delete().eq('product_type', name)
    await supabase.from('product_types').delete().eq('id', id)
    await loadProducts(); await loadBoms()
  }

  // BOM 추가/수정
  async function saveBom() {
    if (!bomForm.product_type || !bomForm.part_name) return alert('품목명과 부품명은 필수입니다.')
    setBomSaving(true)
    const payload = {
      product_type: bomForm.product_type,
      part_name: bomForm.part_name,
      part_spec: bomForm.part_spec || null,
      sort_order: Number(bomForm.sort_order) || 0,
    }
    if (editingBom) {
      await supabase.from('bom_templates').update(payload).eq('id', editingBom)
    } else {
      await supabase.from('bom_templates').insert(payload)
    }
    setBomForm({ product_type: bomFilter || '', part_name: '', part_spec: '', sort_order: 0 })
    setEditingBom(null)
    await loadBoms()
    setBomSaving(false)
  }

  function openEditBom(bom) {
    setBomForm({ product_type: bom.product_type, part_name: bom.part_name, part_spec: bom.part_spec || '', sort_order: bom.sort_order || 0 })
    setEditingBom(bom.id)
    setBomFilter(bom.product_type)
  }

  async function deleteBom(id, productType, partName) {
    if (!confirm(`"${productType} → ${partName}" BOM을 삭제하시겠습니까?`)) return
    await supabase.from('bom_templates').delete().eq('id', id)
    await loadBoms()
  }

  // 품목별 BOM 그룹핑
  const productTypes = [...new Set(boms.map(b => b.product_type))].sort()
  const filteredBoms = bomFilter ? boms.filter(b => b.product_type === bomFilter) : boms

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-gray-900">설정</h1>
        <p className="text-sm text-gray-400 mt-0.5">품목 목록과 BOM 템플릿을 관리합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 mb-5">
        {[['products','품목 관리'],['bom','BOM 템플릿']].map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab===key?'border-gray-900 text-gray-900':'border-transparent text-gray-400 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 품목 관리 탭 ── */}
      {tab === 'products' && (
        <div className="grid grid-cols-2 gap-5">
          {/* 추가 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">품목 추가</h2>
            <div className="flex gap-2">
              <input value={newProduct} onChange={e=>setNewProduct(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&addProduct()}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                placeholder="새 품목명 입력 (예: SBR로라)" />
              <button onClick={addProduct} disabled={prodSaving||!newProduct.trim()}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40">
                추가
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Enter 또는 추가 버튼으로 등록합니다.</p>
          </div>

          {/* 목록 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">품목 목록 ({products.length}개)</h2>
            </div>
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {products.length ? products.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50">
                  {editingProduct?.id === p.id ? (
                    <>
                      <input value={editingProduct.value}
                        onChange={e=>setEditingProduct({...editingProduct,value:e.target.value})}
                        onKeyDown={e=>e.key==='Enter'&&saveProduct()}
                        className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-gray-500"
                        autoFocus />
                      <button onClick={saveProduct} className="text-xs text-blue-600 hover:underline font-medium">저장</button>
                      <button onClick={()=>setEditingProduct(null)} className="text-xs text-gray-400 hover:underline">취소</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-800">{p.name}</span>
                      <button onClick={()=>setEditingProduct({id:p.id,value:p.name})} className="text-xs text-blue-600 hover:underline">수정</button>
                      <button onClick={()=>deleteProduct(p.id,p.name)} className="text-xs text-red-500 hover:underline">삭제</button>
                    </>
                  )}
                </div>
              )) : (
                <div className="px-5 py-8 text-center text-sm text-gray-300">
                  품목이 없습니다.<br/>왼쪽에서 추가하세요.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BOM 템플릿 탭 ── */}
      {tab === 'bom' && (
        <div>
          {/* BOM 추가/수정 폼 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              {editingBom ? 'BOM 수정' : 'BOM 추가'}
            </h2>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">품목명 *</label>
                <select value={bomForm.product_type} onChange={e=>setBomForm({...bomForm,product_type:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white">
                  <option value="">선택</option>
                  {products.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">부품명 *</label>
                <input value={bomForm.part_name} onChange={e=>setBomForm({...bomForm,part_name:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                  placeholder="예: 파이프" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">기본 규격</label>
                <input value={bomForm.part_spec} onChange={e=>setBomForm({...bomForm,part_spec:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                  placeholder="예: 50.8*1.4T" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">순서</label>
                <input type="number" value={bomForm.sort_order} onChange={e=>setBomForm({...bomForm,sort_order:e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={saveBom} disabled={bomSaving}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
                {bomSaving ? '저장 중...' : editingBom ? '수정 저장' : '추가'}
              </button>
              {editingBom && (
                <button onClick={()=>{setEditingBom(null);setBomForm({product_type:bomFilter||'',part_name:'',part_spec:'',sort_order:0})}}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
              )}
            </div>
          </div>

          {/* BOM 목록 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-4 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-800 shrink-0">BOM 목록 ({filteredBoms.length}건)</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">품목 필터</span>
                <select value={bomFilter} onChange={e=>setBomFilter(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none bg-white">
                  <option value="">전체</option>
                  {productTypes.map(pt=><option key={pt} value={pt}>{pt}</option>)}
                </select>
              </div>
            </div>

            {bomLoading ? (
              <div className="py-10 text-center text-gray-300 text-sm">로딩 중...</div>
            ) : filteredBoms.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                      <th className="px-5 py-2.5 text-left font-medium">품목명</th>
                      <th className="px-4 py-2.5 text-center font-medium w-12">순서</th>
                      <th className="px-4 py-2.5 text-left font-medium">부품명</th>
                      <th className="px-4 py-2.5 text-left font-medium">기본 규격</th>
                      <th className="px-4 py-2.5 text-center font-medium">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBoms.map(bom => (
                      <tr key={bom.id} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-2.5 font-medium text-gray-800">{bom.product_type}</td>
                        <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{bom.sort_order}</td>
                        <td className="px-4 py-2.5 text-gray-700">{bom.part_name}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{bom.part_spec || '—'}</td>
                        <td className="px-4 py-2.5 text-center">
                          <button onClick={()=>openEditBom(bom)} className="text-xs text-blue-600 hover:underline mr-3">수정</button>
                          <button onClick={()=>deleteBom(bom.id,bom.product_type,bom.part_name)} className="text-xs text-red-500 hover:underline">삭제</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-10 text-center text-gray-300 text-sm">BOM 데이터가 없습니다</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
