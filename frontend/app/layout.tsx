import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/toaster'


export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: {
    default: 'Smart LMS - Nền tảng Học tập Thông minh Tích hợp Trợ lý AI',
    template: '%s | Smart LMS',
  },
  description:
    'Học tập thông minh hơn với hệ thống bài giảng tương tác, Trợ lý Gia sư AI giải đáp thời gian thực theo đúng ngữ cảnh slide và video.',
  keywords: ['LMS', 'e-learning', 'học trực tuyến', 'gia sư AI', 'khóa học online', 'giáo dục số'],
  authors: [{ name: 'Nhóm Phát triển Smart LMS' }],
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    url: 'https://smartlms.example.com',
    siteName: 'Smart LMS',
    title: 'Smart LMS - Nền tảng Học tập Thông minh Tích hợp Trợ lý AI',
    description: 'Học tập thông minh hơn với hệ thống bài giảng tương tác và Trợ lý AI đồng hành 24/7.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Smart LMS',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="font-sans antialiased text-slate-800 bg-slate-50">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  )
}
