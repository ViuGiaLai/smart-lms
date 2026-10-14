'use client'

import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Eye, EyeOff, Loader2, ShieldCheck, GraduationCap, BookOpen } from 'lucide-react'
import { authApi } from '@/lib/api'
import axios from 'axios'

const loginSchema = z.object({
  email: z.string().email('Địa chỉ email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
})

type LoginFormData = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // Đăng nhập nhanh an toàn qua Demo API phía server (không lộ password)
  const handleQuickDemoLogin = async (role: 'student' | 'instructor' | 'admin') => {
    setServerError('')
    try {
      const response = await authApi.demoLogin(role)
      const resData = response.data.data || response.data
      const accessToken = resData.accessToken || resData.access_token
      const refreshToken = resData.refreshToken || resData.refresh_token
      const userRole = resData.user?.role || role

      if (accessToken) localStorage.setItem('accessToken', accessToken)
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
      if (resData.user) {
        localStorage.setItem('currentUser', JSON.stringify(resData.user))
        window.dispatchEvent(new Event('auth-change'))
      }

      if (userRole === 'admin') {
        router.push('/admin-dashboard')
      } else if (userRole === 'instructor') {
        router.push('/instructor-dashboard')
      } else {
        router.push('/dashboard')
      }
    } catch {
      setServerError('Không thể xác thực nhanh tài khoản. Bạn vui lòng nhập email và mật khẩu bên dưới.')
    }
  }

  const onSubmit = async (data: LoginFormData) => {
    setServerError('')
    try {
      const response = await authApi.login(data.email, data.password)
      const resData = response.data.data || response.data
      const accessToken = resData.accessToken || resData.access_token
      const refreshToken = resData.refreshToken || resData.refresh_token
      const role = resData.user?.role || 'student'

      if (accessToken) localStorage.setItem('accessToken', accessToken)
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
      if (resData.user) {
        localStorage.setItem('currentUser', JSON.stringify(resData.user))
        window.dispatchEvent(new Event('auth-change'))
      }

      // Điều hướng thông minh theo vai trò
      if (role === 'admin') {
        router.push('/admin-dashboard')
      } else if (role === 'instructor') {
        router.push('/instructor-dashboard')
      } else {
        router.push('/dashboard')
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setServerError(
          err.response?.data?.detail ||
          err.response?.data?.message ||
          'Đăng nhập thất bại. Vui lòng kiểm tra lại email hoặc mật khẩu.'
        )
      } else {
        setServerError('Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.')
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/80 flex items-center justify-center p-4 py-8">
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
            Chào mừng trở lại!
          </h1>
          <p className="text-slate-500 text-sm text-center mb-6">
            Đăng nhập để trải nghiệm hệ thống và Trợ lý AI
          </p>

          {/* Khối Tài khoản Trải nghiệm Nhanh */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 mb-6">
            <p className="text-[11px] font-semibold text-slate-600 mb-2 uppercase tracking-wider text-center">
              Chọn nhanh tài khoản thử nghiệm:
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickDemoLogin('admin')}
                className="py-1.5 px-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-slate-700 font-medium transition flex flex-col items-center gap-0.5 shadow-2xs"
                title="Đăng nhập nhanh tài khoản Quản trị viên"
              >
                <ShieldCheck className="w-4 h-4 text-rose-600" />
                <span className="font-bold text-[11px]">Admin</span>
                <span className="text-[9px] text-slate-400">Quản trị viên</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoLogin('instructor')}
                className="py-1.5 px-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-slate-700 font-medium transition flex flex-col items-center gap-0.5 shadow-2xs"
                title="Đăng nhập nhanh tài khoản Giảng viên"
              >
                <GraduationCap className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-[11px]">Giảng viên</span>
                <span className="text-[9px] text-slate-400">Giảng viên</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoLogin('student')}
                className="py-1.5 px-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-slate-700 font-medium transition flex flex-col items-center gap-0.5 shadow-2xs"
                title="Đăng nhập nhanh tài khoản Học viên"
              >
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span className="font-bold text-[11px]">Học viên</span>
                <span className="text-[9px] text-slate-400">Học viên</span>
              </button>
            </div>
          </div>

          {serverError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl mb-6 text-xs">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Địa chỉ Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                {...register('email')}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-900 placeholder:text-slate-400"
                placeholder="vidu@domain.com"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
                  Mật khẩu
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Quên mật khẩu?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  {...register('password')}
                  className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-900 placeholder:text-slate-400 pr-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2 text-sm mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang đăng nhập...
                </>
              ) : (
                'Đăng nhập'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-600 text-xs">
              Chưa có tài khoản?{' '}
              <Link href="/register" className="text-indigo-600 font-bold hover:underline">
                Đăng ký ngay miễn phí
              </Link>
            </p>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-[11px] text-center text-slate-400">
              Bằng việc đăng nhập, bạn đồng ý với{' '}
              <Link href="/terms" className="underline hover:text-slate-600">Điều khoản</Link> và{' '}
              <Link href="/privacy" className="underline hover:text-slate-600">Chính sách bảo mật</Link> của chúng tôi.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
