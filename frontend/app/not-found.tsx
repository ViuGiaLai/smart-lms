import Link from 'next/link'
import { ArrowLeft, BookOpen, Compass, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-lg text-center">
        <p
          aria-hidden
          className="select-none font-serif text-[6rem] leading-none tracking-tight text-border sm:text-[8rem]"
        >
          404
        </p>

        <div className="-mt-6 flex flex-col items-center sm:-mt-10">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-card text-brand-700">
            <Compass className="h-6 w-6" />
          </span>
          <h1 className="text-2xl tracking-tight text-foreground sm:text-3xl">
            Không tìm thấy trang
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-500">
            Đường dẫn bạn truy cập không tồn tại, đã được đổi địa chỉ hoặc nội dung đang được cập nhật.
          </p>

          <div className="mt-7 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
            <Link
              href="/"
              className="flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Home className="h-4 w-4" />
              Về trang chủ
            </Link>
            <Link
              href="/courses"
              className="flex items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-brand-300 hover:text-brand-700"
            >
              <BookOpen className="h-4 w-4" />
              Khám phá khóa học
            </Link>
          </div>

          <Link
            href="/dashboard"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 transition hover:text-brand-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Về bảng điều khiển của tôi
          </Link>
        </div>

        <p className="mt-12 text-[11px] text-stone-400">
          Smart LMS · Nền tảng học tập thông minh tích hợp Trợ lý AI
        </p>
      </div>
    </div>
  )
}
