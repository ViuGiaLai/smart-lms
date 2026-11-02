'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Mail, MailCheck } from 'lucide-react'
import axios from 'axios'

import { authApi } from '@/lib/api'
import { AuthShell } from '@/components/auth/AuthShell'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!email.trim()) {
      setError('Vui lòng nhập địa chỉ email.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await authApi.forgotPassword(email.trim())
      const data = res.data?.data ?? {}
      setSentTo(email.trim())
      setDevResetUrl(data.devResetUrl ?? null)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(
          err.response?.data?.detail ||
            err.response?.data?.message ||
            'Không thể gửi yêu cầu. Vui lòng thử lại sau.',
        )
      } else {
        setError('Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <AuthShell
        eyebrow="Kiểm tra hộp thư"
        title="Đã gửi liên kết đặt lại"
        subtitle="Nếu email này tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn trong ít phút."
        backHref="/login"
        backLabel="Quay lại đăng nhập"
        footer={
          <p className="text-center text-xs text-stone-600">
            Chưa nhận được email?{' '}
            <button
              type="button"
              onClick={() => {
                setSentTo(null)
                setDevResetUrl(null)
              }}
              className="font-bold text-brand-600 hover:underline"
            >
              Gửi lại
            </button>
          </p>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm">
              <MailCheck className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-bold text-emerald-900">Email đã được gửi tới</p>
              <p className="mt-0.5 break-all text-xs text-emerald-700">{sentTo}</p>
            </div>
          </div>

          <ul className="space-y-2 text-xs leading-relaxed text-stone-500">
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
              Liên kết chỉ dùng được một lần và hết hạn sau 30 phút.
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
              Không thấy email? Hãy kiểm tra thư mục Spam hoặc Quảng cáo.
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
              Vì lý do bảo mật, chúng tôi không cho biết email có tồn tại hay không.
            </li>
          </ul>

          {devResetUrl && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
              <p className="mb-1.5 font-bold">Chế độ phát triển (chưa cấu hình SMTP)</p>
              <p className="mb-2 leading-relaxed">
                Máy chủ chưa gửi email thật. Dùng liên kết bên dưới để đặt lại mật khẩu ngay.
              </p>
              <Link
                href={devResetUrl}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-amber-700"
              >
                Mở liên kết đặt lại
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="Khôi phục tài khoản"
      title="Quên mật khẩu?"
      subtitle="Nhập email đăng nhập, chúng tôi sẽ gửi liên kết an toàn để bạn tạo mật khẩu mới."
      backHref="/login"
      backLabel="Quay lại đăng nhập"
    >
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs leading-relaxed text-rose-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-stone-700">
            Địa chỉ Email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vidu@domain.com"
              className="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-10 pr-4 text-sm text-stone-900 transition-all placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang gửi liên kết...
            </>
          ) : (
            <>
              Gửi liên kết đặt lại
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-stone-400">
        Nếu không thể đăng nhập hoặc cần hỗ trợ thêm, vui lòng liên hệ Ban quản trị qua{' '}
        <a href="mailto:admin@donga.edu.vn" className="underline transition hover:text-stone-600">
          admin@donga.edu.vn
        </a>
        .
      </p>
    </AuthShell>
  )
}
