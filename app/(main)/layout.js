'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const NAV = [
  { href: '/dashboard', label: '대시보드',  icon: '▦' },
  { href: '/clients',   label: '거래처 관리', icon: '⊙' },
  { href: '/price-db',  label: '단가 DB',    icon: '≡' },
  { href: '/quotes',    label: '견적 관리',   icon: '◻' },
  { href: '/orders',    label: '수주현황',    icon: '◈' },
]

const ROLE_LABEL = { admin: '관리자', db_manager: '단가 담당', sales: '견적 담당' }
const ROLE_COLOR = { admin: 'bg-purple-100 text-purple-700', db_manager: 'bg-amber-100 text-amber-700', sales: 'bg-green-100 text-green-700' }

export default function MainLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState(null)
  const [userEmail, setUserEmail] = useState('')
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email)
      const { data } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
      setProfile(data)
    }
    load()
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href) => pathname === href || pathname.startsWith(href + '/')

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* 사이드바 */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* 로고 */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="font-semibold text-gray-900 text-sm">로라 ERP</div>
          <div className="text-xs text-gray-400 mt-0.5">견적·수주 관리 시스템</div>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(item => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                isActive(item.href)
                  ? 'bg-gray-900 text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="text-sm opacity-80">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* 사용자 정보 */}
        <div className="p-3 border-t border-gray-100">
          <div className="px-3 py-2 mb-1">
            <div className="text-xs font-medium text-gray-800 truncate">
              {profile?.name || userEmail}
            </div>
            {profile?.role && (
              <span className={`text-xs px-1.5 py-0.5 rounded mt-1 inline-block ${ROLE_COLOR[profile.role] || 'bg-gray-100 text-gray-600'}`}>
                {ROLE_LABEL[profile.role] || profile.role}
              </span>
            )}
          </div>
          <button onClick={logout}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
