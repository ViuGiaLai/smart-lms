'use client'

import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'
import { authApi } from '@/lib/api'
import axios from 'axios'

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
    role: z.enum(['student', 'instructor']),
    agreeToTerms: z.boolean().refine((val) => val === true, {
      message: 'Bạn phải đồng ý với Điều khoản dịch vụ và Chính sách quyền riêng tư',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không trùng khớp',
    path: ['confirmPassword'],
  })

type RegisterFormData = z.infer<typeof registerSchema>

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
    defaultValues: { role: 'student' },
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
  const strengthColors = ['', 'bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500']

  const onSubmit = async (data: RegisterFormData) => {
    setServerError('')
    try {
      const response = await authApi.register({
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        role: data.role,
      })
      const resData = response.data.data || response.data
      const accessToken = resData.accessToken || resData.access_token
      const refreshToken = resData.refreshToken || resData.refresh_token
      const user = resData.user || { name: data.fullName, email: data.email, role: data.role }

      if (accessToken) localStorage.setItem('accessToken', accessToken)
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
      localStorage.setItem('currentUser', JSON.stringify(user))
      window.dispatchEvent(new Event('auth-change'))

      if (data.role === 'instructor') {
        router.push('/instructor-dashboard')
      } else {
        router.push('/dashboard')
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setServerError(err.response?.data?.message || 'Đăng ký không thành công. Vui lòng thử lại.')
      } else {
        setServerError('Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.')
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/80 flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Sparkles className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Smart LMS
            </span>
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900 text-center mb-1">
            Đăng ký tài khoản
          </h1>
          <p className="text-slate-500 text-sm text-center mb-6">
            Khám phá trải nghiệm học tập thông minh cùng Trợ lý AI
          </p>

          {serverError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl mb-6 text-xs">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Role Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Tôi muốn tham gia với vai trò:
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(['student', 'instructor'] as const).map((role) => (
                  <label
                    key={role}
                    className="relative cursor-pointer"
                  >
                    <input
                      type="radio"
                      value={role}
                      {...register('role')}
                      className="peer sr-only"
                    />
                    <div className="border-2 border-slate-200 rounded-xl p-3 text-center peer-checked:border-indigo-600 peer-checked:bg-indigo-50/70 transition-all">
                      <span className="text-xs font-bold text-slate-800 peer-checked:text-indigo-700 block">
                        {role === 'student' ? '📚 Học viên' : '🎓 Giảng viên'}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {role === 'student' ? 'Học & Tương tác AI' : 'Tạo & Quản lý khóa học'}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Họ và tên */}
            <div>
              <label htmlFor="fullName" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Họ và tên
              </label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                {...register('fullName')}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                placeholder="Nguyễn Văn A"
              />
              {errors.fullName && (
                <p className="mt-1 text-xs text-rose-600">{errors.fullName.message}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Địa chỉ Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                {...register('email')}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                placeholder="vidu@domain.com"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  {...register('password')}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all pr-12 placeholder:text-slate-400"
                  placeholder="Tối thiểu 8 ký tự, có chữ hoa & số"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Password Strength */}
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all ${
                          i <= passwordStrength ? strengthColors[passwordStrength] : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Độ mạnh mật khẩu: <span className="font-semibold">{strengthLabels[passwordStrength]}</span>
                  </p>
                </div>
              )}
              {errors.password && (
                <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>
              )}
            </div>

            {/* Xác nhận mật khẩu */}
            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Xác nhận mật khẩu
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  {...register('confirmPassword')}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all pr-12 placeholder:text-slate-400"
                  placeholder="Nhập lại mật khẩu vừa đặt"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-rose-600">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Terms */}
            <div className="flex items-start gap-2.5 pt-1">
              <input
                id="agreeToTerms"
                type="checkbox"
                {...register('agreeToTerms')}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="agreeToTerms" className="text-xs text-slate-600 cursor-pointer leading-tight">
                Tôi đồng ý với{' '}
                <Link href="/terms" className="text-indigo-600 font-medium hover:underline">
                  Điều khoản dịch vụ
                </Link>{' '}
                và{' '}
                <Link href="/privacy" className="text-indigo-600 font-medium hover:underline">
                  Chính sách quyền riêng tư
                </Link>
              </label>
            </div>
            {errors.agreeToTerms && (
              <p className="text-xs text-rose-600">{errors.agreeToTerms.message}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2 text-sm mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang khởi tạo tài khoản...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Đăng ký tài khoản
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-600 text-xs">
              Đã có tài khoản?{' '}
              <Link href="/login" className="text-indigo-600 font-bold hover:underline">
                Đăng nhập ngay
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
