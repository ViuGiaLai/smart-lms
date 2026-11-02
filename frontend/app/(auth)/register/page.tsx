'use client'

import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  Lock,
  Mail,
  User,
} from 'lucide-react'
import { authApi } from '@/lib/api'
import axios from 'axios'
import { AuthShell } from '@/components/auth/AuthShell'

const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Họ và tên phải có ít nhất 2 ký tự'),
    email: z.string().email('Địa chỉ email không hợp lệ'),
    password: z
      .string()
      .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
      .regex(/[A-Z]/, 'Mật khẩu phải chứa ít nhất một chữ cái in hoa')
      .regex(/[0-9]/, 'Mật khẩu phải chứa ít nhất một chữ số'),
    confirmPassword: z.string(),
    agreeToTerms: z.boolean().refine((val) => val === true, {
      message: 'Bạn phải đồng ý với Điều khoản dịch vụ và Chính sách quyền riêng tư',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không trùng khớp',
    path: ['confirmPassword'],
  })

type RegisterFormData = z.infer<typeof registerSchema>

const inputClass =
  'w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-10 pr-4 text-sm text-stone-900 transition-all placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30'

export default function RegisterPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  })

  const password = watch('password', '')

  const passwordStrength = (() => {
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

  const onSubmit = async (data: RegisterFormData) => {
    setServerError('')
    try {
      const response = await authApi.register({
        email: data.email,
        password: data.password,
        fullName: data.fullName,
      })
      const resData = response.data.data || response.data
      const accessToken = resData.accessToken || resData.access_token
      const refreshToken = resData.refreshToken || resData.refresh_token
      // Quyền do máy chủ quyết định (luôn là Học viên khi tự đăng ký).
      const user = resData.user || { name: data.fullName, email: data.email, role: 'student' }

      if (accessToken) localStorage.setItem('accessToken', accessToken)
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
      localStorage.setItem('currentUser', JSON.stringify(user))
      window.dispatchEvent(new Event('auth-change'))

      if (user.role === 'instructor' || user.role === 'admin') {
        router.push('/instructor-dashboard')
      } else {
        router.push('/dashboard')
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setServerError(
          err.response?.data?.detail ||
            err.response?.data?.message ||
            'Đăng ký không thành công. Vui lòng thử lại.',
        )
      } else {
        setServerError('Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.')
      }
    }
  }

  return (
    <AuthShell
      eyebrow="Tạo tài khoản"
      title="Bắt đầu hành trình học tập"
      subtitle="Miễn phí, không cần thẻ tín dụng. Tài khoản mới bắt đầu với quyền Học viên."
      footer={
        <p className="text-center text-xs text-stone-600">
          Đã có tài khoản?{' '}
          <Link href="/login" className="font-bold text-brand-600 hover:underline">
            Đăng nhập ngay
          </Link>
        </p>
      }
    >
      {serverError && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs leading-relaxed text-rose-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* Vai trò do hệ thống cấp — không cho tự chọn để tránh tự nâng quyền */}
        <div className="flex items-start gap-2.5 rounded-lg border border-brand-100 bg-brand-50/70 px-3.5 py-3">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <p className="text-[11px] leading-relaxed text-brand-900">
            <strong className="font-bold">Vai trò Học viên được cấp tự động.</strong> Cần quyền
            Giảng viên để tạo và quản lý khóa học? Hãy gửi yêu cầu tới quản trị viên sau khi đăng ký.
          </p>
        </div>

        {/* Họ và tên */}
        <div>
          <label htmlFor="fullName" className="mb-1.5 block text-xs font-semibold text-stone-700">
            Họ và tên
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              aria-invalid={Boolean(errors.fullName)}
              {...register('fullName')}
              className={inputClass}
              placeholder="Nguyễn Văn A"
            />
          </div>
          {errors.fullName && <p className="mt-1.5 text-xs text-rose-600">{errors.fullName.message}</p>}
        </div>

        {/* Email */}
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
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
              className={inputClass}
              placeholder="vidu@domain.com"
            />
          </div>
          {errors.email && <p className="mt-1.5 text-xs text-rose-600">{errors.email.message}</p>}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-stone-700">
            Mật khẩu
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
              className={`${inputClass} pr-12`}
              placeholder="Tối thiểu 8 ký tự, có chữ hoa & số"
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
                      i <= passwordStrength ? strengthColors[passwordStrength] : 'bg-stone-200'
                    }`}
                  />
                ))}
              </div>
              <p className="mt-1 text-[11px] text-stone-500">
                Độ mạnh mật khẩu: <span className="font-semibold">{strengthLabels[passwordStrength]}</span>
              </p>
            </div>
          )}
          {errors.password && <p className="mt-1.5 text-xs text-rose-600">{errors.password.message}</p>}
        </div>

        {/* Xác nhận mật khẩu */}
        <div>
          <label htmlFor="confirmPassword" className="mb-1.5 block text-xs font-semibold text-stone-700">
            Xác nhận mật khẩu
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register('confirmPassword')}
              className={`${inputClass} pr-12`}
              placeholder="Nhập lại mật khẩu vừa đặt"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-stone-400 transition-colors hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="mt-1.5 text-xs text-rose-600">{errors.confirmPassword.message}</p>
          )}
        </div>

        {/* Terms */}
        <div className="flex items-start gap-2.5 pt-1">
          <input
            id="agreeToTerms"
            type="checkbox"
            {...register('agreeToTerms')}
            className="mt-0.5 h-4 w-4 cursor-pointer rounded border-stone-300 text-brand-600 focus:ring-brand-500"
          />
          <label htmlFor="agreeToTerms" className="cursor-pointer text-xs leading-tight text-stone-600">
            Tôi đồng ý với{' '}
            <Link href="/terms" className="font-medium text-brand-600 hover:underline">
              Điều khoản dịch vụ
            </Link>{' '}
            và{' '}
            <Link href="/privacy" className="font-medium text-brand-600 hover:underline">
              Chính sách quyền riêng tư
            </Link>
          </label>
        </div>
        {errors.agreeToTerms && <p className="text-xs text-rose-600">{errors.agreeToTerms.message}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang khởi tạo tài khoản...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Tạo tài khoản
            </>
          )}
        </button>
      </form>
    </AuthShell>
  )
}
