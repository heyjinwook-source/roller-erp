'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const STATUS_COLORS = {
  '견적':  'bg-blue-100 text-blue-700',
  '수주':  'bg-green-100 text-green-700',
  '생산':  'bg-amber-100 text-amber-700',
  '완료':  'bg-gray-100 text-gray-600',
  '취소':  'bg-red-100 text-red-500',
}

function calcItem(item) {
  const parts = Array.isArray(item.parts) ? item.parts : []
  const mat = parts.reduce((s, p) => s + (Number(p.qty)||0) * (Number(p.unit_price)||0), 0)
  const lab = Number(item.labor_cost) || 0
  const unitCost = mat + lab              // 개당 총원가
  const qty = Number(item.quantity) || 1
  const amount = unitCost * qty           // 품목단가 (수량 × 개당총원가)
  return { mat, lab, unitCost, amount }
}

export default function QuoteDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [quote, setQuote] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('detail') // detail | final
  const [converting, setConverting] = useState(false)
  const [linkedOrder, setLinkedOrder] = useState(null)

  useEffect(() => {
    if (id) load()
  }, [id])

  async function load() {
    setLoading(true)
    const { data: q } = await supabase
      .from('quotes')
      .select('*, clients(name, phone, email, rep_name)')
      .eq('id', id)
      .single()
    setQuote(q)

    const { data: qi } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', id)
      .order('sort_order')
    setItems(qi || [])

    // 연결된 수주 확인
    const { data: ord } = await supabase
      .from('orders')
      .select('order_no, status')
      .eq('quote_id', id)
      .maybeSingle()
    setLinkedOrder(ord)

    setLoading(false)
  }

  async function convertToOrder() {
    if (!confirm('이 견적을 수주로 전환하시겠습니까?')) return
    setConverting(true)

    // 수주 생성
    const { data: newOrder, error } = await supabase
      .from('orders')
      .insert({
        client_id: quote.client_id,
        quote_id: quote.id,
        order_date: new Date().toISOString().slice(0, 10),
        status: '대기',
      })
      .select()
      .single()

    if (error) { alert('수주 전환 오류: ' + error.message); setConverting(false); return }

    // 수주 품목 생성
    const orderItems = items.map((item, i) => {
      const c = calcItem(item)
      return {
        order_id: newOrder.id,
        product_type: item.product_type,
        spec: item.spec,
        quantity: Number(item.quantity) || 1,
        unit_price: Math.round(c.unitPrice),
        total_price: Math.round(c.amount),
        status: '대기',
        sort_order: i,
      }
    })
    await supabase.from('order_items').insert(orderItems)

    // 견적 상태 → 수주
    await supabase.from('quotes').update({ status: '수주' }).eq('id', id)

    setConverting(false)
    alert(`수주 전환 완료! 수주번호: ${newOrder.order_no}`)
    load()
  }

  async function updateStatus(status) {
    await supabase.from('quotes').update({ status }).eq('id', id)
    load()
  }

  const grandTotal = items.reduce((s, item) => s + calcItem(item).amount, 0)

  function printFinal() {
    window.print()
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">로딩 중...</div>
  if (!quote) return <div className="p-6 text-sm text-gray-400">견적을 찾을 수 없습니다.</div>

  return (
    <div className="p-6 max-w-5xl">
      {/* 헤더 */}
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button onClick={() => router.push('/quotes')}
            className="text-xs text-gray-400 hover:text-gray-700 mb-2 flex items-center gap-1">
            ← 목록으로
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-semibold text-gray-900 font-mono">{quote.quote_no}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[quote.status] || 'bg-gray-100 text-gray-600'}`}>
              {quote.status}
            </span>
            {linkedOrder && (
              <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-mono">
                수주: {linkedOrder.order_no}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {quote.clients?.name} · {quote.quote_date}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {quote.status === '견적' && !linkedOrder && (
            <button onClick={convertToOrder} disabled={converting}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {converting ? '전환 중...' : '수주 전환'}
            </button>
          )}
          {tab === 'final' && (
            <button onClick={printFinal}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              🖨 인쇄
            </button>
          )}
          <select value={quote.status} onChange={e => updateStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none">
            {['견적','수주','생산','완료','취소'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 mb-5">
        {[['detail','세부 내역'], ['final','최종 견적서']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 세부 내역 탭 ── */}
      {tab === 'detail' && (
        <div>
          {items.map((item, idx) => {
            const c = calcItem(item)
            const parts = Array.isArray(item.parts) ? item.parts : []
            return (
              <div key={item.id} className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 flex-wrap">
                  <span className="w-6 h-6 rounded-full bg-gray-800 text-white text-xs flex items-center justify-center font-medium shrink-0">{idx+1}</span>
                  <span className="font-medium text-gray-900">{item.product_type}</span>
                  {item.spec && <span className="text-sm text-gray-500">{item.spec}</span>}
                  <span className="text-xs text-gray-400 ml-auto">판매수량 {Number(item.quantity)}개</span>
                </div>
                <div className="px-5 py-4">
                  {parts.length > 0 ? (
                    <table className="w-full text-sm mb-4">
                      <thead>
                        <tr className="text-xs text-gray-400 border-b border-gray-100">
                          <th className="pb-2 text-left font-medium">부품명</th>
                          <th className="pb-2 text-left font-medium">규격</th>
                          <th className="pb-2 text-right font-medium w-20">수량</th>
                          <th className="pb-2 text-right font-medium w-28">단가</th>
                          <th className="pb-2 text-right font-medium w-28">소계</th>
                          <th className="pb-2 text-center font-medium w-16">출처</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parts.map((p, pi) => {
                          const sub = (Number(p.qty)||0) * (Number(p.unit_price)||0)
                          return (
                            <tr key={pi} className="border-t border-gray-50">
                              <td className="py-1.5 text-gray-800">{p.part_name}</td>
                              <td className="py-1.5 text-gray-500 text-xs">{p.spec}</td>
                              <td className="py-1.5 text-right text-gray-600">{Number(p.qty).toLocaleString()}</td>
                              <td className="py-1.5 text-right font-mono text-xs">{Number(p.unit_price).toLocaleString()}</td>
                              <td className="py-1.5 text-right font-mono text-xs">{sub.toLocaleString()}</td>
                              <td className="py-1.5 text-center">
                                {p.source === 'db'
                                  ? <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">DB</span>
                                  : p.source === 'manual'
                                  ? <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">직접</span>
                                  : <span className="text-xs text-gray-300">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-gray-300 mb-4">부품 내역 없음</p>
                  )}
                  <div className="flex items-center gap-4 pt-3 border-t border-gray-100 text-sm flex-wrap">
                    <div className="text-gray-500">기본원가 <span className="font-medium text-gray-800">{c.mat.toLocaleString()}원</span></div>
                    <span className="text-gray-300">+</span>
                    <div className="text-gray-500">개당 인건비 <span className="font-medium text-gray-800">{c.lab.toLocaleString()}원</span></div>
                    <span className="text-gray-300">=</span>
                    <div className="text-gray-500">개당 단가 <span className="font-semibold text-gray-900">{c.unitCost.toLocaleString()}원</span></div>
                    <span className="text-gray-400 text-sm">× {Number(item.quantity)}개</span>
                    <span className="text-gray-300">=</span>
                    <div className="text-blue-700 font-bold">총단가액 {c.amount.toLocaleString()}원</div>
                  </div>
                </div>
              </div>
            )
          })}
          <div className="bg-gray-50 rounded-xl border border-gray-200 px-5 py-4 flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">합계금액</span>
            <span className="text-xl font-bold text-gray-900">₩{grandTotal.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* ── 최종 견적서 탭 (인쇄용) ── */}
      {tab === 'final' && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 print:shadow-none">
          <style>{`@media print { body * { visibility: hidden; } .print-area, .print-area * { visibility: visible; } .print-area { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
          <div className="print-area">
            <h2 className="text-2xl font-bold text-center tracking-widest mb-6">견 적 서</h2>
            <div className="grid grid-cols-2 gap-8 mb-6">
              <div className="space-y-1.5 text-sm">
                <div className="font-semibold text-gray-700 mb-2">거래처</div>
                <div className="text-lg font-bold text-gray-900">{quote.clients?.name}</div>
                {quote.clients?.rep_name && <div className="text-gray-600">대표: {quote.clients.rep_name}</div>}
                {quote.clients?.phone && <div className="text-gray-600">Tel: {quote.clients.phone}</div>}
                {quote.clients?.email && <div className="text-gray-500 text-xs">{quote.clients.email}</div>}
              </div>
              <div className="space-y-1.5 text-sm text-right">
                <div><span className="text-gray-400">견적번호</span> <span className="font-mono font-semibold">{quote.quote_no}</span></div>
                <div><span className="text-gray-400">견적일자</span> <span>{quote.quote_date}</span></div>
                <div><span className="text-gray-400">합계금액</span> <span className="text-lg font-bold text-gray-900">₩{grandTotal.toLocaleString()}</span></div>
              </div>
            </div>
            <table className="w-full border-collapse text-sm mb-6">
              <thead>
                <tr className="border-b-2 border-gray-900">
                  <th className="py-2.5 text-center font-semibold w-10">No.</th>
                  <th className="py-2.5 text-left font-semibold">품목</th>
                  <th className="py-2.5 text-left font-semibold">규격</th>
                  <th className="py-2.5 text-right font-semibold w-16">수량</th>
                  <th className="py-2.5 text-right font-semibold w-28">단가 (원)</th>
                  <th className="py-2.5 text-right font-semibold w-32">금액 (원)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const c = calcItem(item)
                  return (
                    <tr key={item.id} className="border-b border-gray-200">
                      <td className="py-2.5 text-center text-gray-500">{i+1}</td>
                      <td className="py-2.5 font-medium text-gray-900">{item.product_type}</td>
                      <td className="py-2.5 text-gray-500 text-xs">{item.spec}</td>
                      <td className="py-2.5 text-right">{Number(item.quantity).toLocaleString()}</td>
                      <td className="py-2.5 text-right font-mono">{Math.round(c.unitCost).toLocaleString()}</td>
                      <td className="py-2.5 text-right font-mono font-medium">{Math.round(c.amount).toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-900">
                  <td colSpan={5} className="py-3 text-right font-semibold">합 계</td>
                  <td className="py-3 text-right font-bold text-lg font-mono">₩{grandTotal.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
            <div className="text-xs text-gray-400 text-center mt-8">
              위와 같이 견적합니다.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
