import './globals.css'

export const metadata = {
  title: '로라 ERP',
  description: '견적·수주 관리 시스템',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
