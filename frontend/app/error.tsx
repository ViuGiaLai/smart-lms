'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled runtime error:', error)
  }, [error])

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="relative w-full max-w-md rounded-lg border border-stone-200/80 bg-white/95 p-8 text-center shadow-xl shadow-stone-900/5 backdrop-blur">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
          <AlertTriangle className="h-7 w-7" />
        </span>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-rose-600">
          Lỗi hệ thống
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Đã xảy ra sự cố
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-500">
          Yêu cầu của bạn chưa xử lý xong. Bạn có thể thử lại — nếu lỗi lặp lại, vui lòng quay về
          trang chủ.
        </p>

        <div className="mt-7 space-y-2.5">
          <button
            onClick={() => reset()}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <RotateCcw className="h-4 w-4" />
            Thử lại
          </button>
          <Link
            href="/"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40"
          >
            <Home className="h-4 w-4" />
            Về trang chủ
          </Link>
        </div>

        {error.message && (
          <details className="mt-6 rounded-md border border-border bg-muted/50 px-3.5 py-2.5 text-left">
            <summary className="cursor-pointer text-[11px] font-semibold text-stone-500">
              Chi tiết kỹ thuật
            </summary>
            <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-stone-500">
              {error.message}
            </p>
            {error.digest && (
              <p className="mt-1 font-mono text-[10px] text-stone-400">Mã lỗi: {error.digest}</p>
            )}
          </details>
        )}
      </div>
    </div>
  )
}
