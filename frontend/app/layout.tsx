import type { Metadata } from 'next'
import { Be_Vietnam_Pro, Lora } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/toaster'

// Bộ chữ: sans Việt hoá cho giao diện, serif cho tiêu đề trang.
const sans = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

const serif = Lora({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
})


export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: {
    default: 'SmartTutor LMS · Nền tảng học tập số ',
    template: '%s | SmartTutor LMS',
  },
  description:
    'Giáo trình số, bài luyện trắc nghiệm và trợ lý học tập giới hạn theo từng bài giảng — câu trả lời kèm trích dẫn để người học kiểm chứng.',
  keywords: ['LMS', 'e-learning', 'học trực tuyến', 'khóa học online', 'giáo dục số', ''],
  authors: [{ name: 'Nhóm Phát triển SmartTutor LMS' }],
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    url: 'https://smartlms.example.com',
    siteName: 'SmartTutor LMS',
    title: 'SmartTutor LMS · Nền tảng học tập số ',
    description: 'Giáo trình số, bài luyện trắc nghiệm và trợ lý học tập theo từng bài giảng.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'SmartTutor LMS',
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
      <body className={`${sans.variable} ${serif.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  )
}
