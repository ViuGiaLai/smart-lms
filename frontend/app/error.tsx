'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'

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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
          <AlertTriangle className="w-9 h-9" />
        </div>
        <span className="inline-block text-xs font-bold uppercase tracking-wider text-red-700 bg-red-50 px-3 py-1 rounded-full mb-3">
          Lỗi Hệ Thống
        </span>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">
          Đã xảy ra sự cố
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed mb-6">
          Hệ thống gặp sự cố không mong muốn trong quá trình xử lý yêu cầu. Vui lòng thử tải lại trang hoặc quay về trang chủ.
        </p>

        {error.message && (
          <div className="bg-slate-50 rounded-lg p-3 text-left mb-6 border border-slate-200/80">
            <p className="text-xs font-mono text-slate-600 break-all line-clamp-3">
              {error.message}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => reset()}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors shadow-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Thử Tải Lại
          </button>
          <Link
            href="/"
            className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2.5 px-4 rounded-xl transition-colors"
          >
            <Home className="w-4 h-4" />
            Về Trang Chủ
          </Link>
        </div>
      </div>
    </div>
  )
}
