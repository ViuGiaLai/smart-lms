'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Link2Off,
  Loader2,
  Lock,
} from 'lucide-react'
import axios from 'axios'

import { authApi } from '@/lib/api'
import { AuthShell } from '@/components/auth/AuthShell'

const inputClass =
  'w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-10 pr-12 text-sm text-stone-900 transition-all placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30'

export function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const strength = (() => {
    if (!password) return 0
    let score = 0
    if (password.length >= 8) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    return score
  })()
  const strengthLabels = ['', 'Yếu', 'Trung bình', 'Khá', 'Mạnh']
  const strengthColors = ['', 'bg-rose-500', 'bg-amber-500', 'bg-sky-500', 'bg-emerald-500']

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.')
      return
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không trùng khớp.')
      return
    }

    setIsSubmitting(true)
    try {
      await authApi.resetPassword(token, password)
      // Mật khẩu đổi -> mọi phiên cũ bị thu hồi; xóa phiên cục bộ nếu có.
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('currentUser')
      window.dispatchEvent(new Event('auth-change'))
      setDone(true)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(
          err.response?.data?.detail ||
            err.response?.data?.message ||
            'Không thể đặt lại mật khẩu. Vui lòng thử lại.',
        )
      } else {
        setError('Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!token) {
    return (
      <AuthShell
        eyebrow="Liên kết không hợp lệ"
        title="Thiếu mã đặt lại"
        subtitle="Liên kết bạn mở không có mã xác thực. Hãy yêu cầu một liên kết mới."
        footer={
          <Link
            href="/forgot-password"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Yêu cầu liên kết mới
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-rose-600 shadow-sm">
            <Link2Off className="h-6 w-6" />
          </span>
          <p className="text-xs leading-relaxed text-rose-700">
            Mã đặt lại chỉ được gửi qua email và đi kèm trong liên kết. Vui lòng kiểm tra lại hộp thư của bạn.
          </p>
        </div>
      </AuthShell>
    )
  }

  if (done) {
    return (
      <AuthShell
        eyebrow="Hoàn tất"
        title="Mật khẩu đã được cập nhật"
        subtitle="Vì lý do bảo mật, tất cả phiên đăng nhập cũ đã bị thu hồi."
        footer={
          <Link
            href="/login"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Đăng nhập bằng mật khẩu mới
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <p className="text-xs leading-relaxed text-emerald-800">
            Bạn có thể đăng nhập ngay trên mọi thiết bị bằng mật khẩu vừa tạo.
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="Đặt lại mật khẩu"
      title="Tạo mật khẩu mới"
      subtitle="Chọn mật khẩu mạnh, không dùng lại mật khẩu ở các dịch vụ khác."
      backHref="/login"
      backLabel="Quay lại đăng nhập"
    >
      <div className="mb-5 flex items-start gap-2 rounded-lg border border-brand-100 bg-brand-50/70 px-3.5 py-3 text-xs leading-relaxed text-brand-900">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <span>Liên kết này chỉ dùng được một lần và hết hạn sau 30 phút.</span>
      </div>

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
          <label htmlFor="new-password" className="mb-1.5 block text-xs font-semibold text-stone-700">
            Mật khẩu mới
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-stone-400 transition-colors hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      i <= strength ? strengthColors[strength] : 'bg-stone-200'
                    }`}
                  />
                ))}
              </div>
              <p className="mt-1 text-[11px] text-stone-500">
                Độ mạnh mật khẩu: <span className="font-semibold">{strengthLabels[strength]}</span>
              </p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="confirm-password" className="mb-1.5 block text-xs font-semibold text-stone-700">
            Xác nhận mật khẩu mới
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              className={inputClass}
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
              Đang cập nhật...
            </>
          ) : (
            <>
              Cập nhật mật khẩu
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  )
}
