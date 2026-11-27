'use client'

import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { authApi } from '@/lib/api'
import axios from 'axios'
import { useAuth } from '@/lib/auth-context'
import { safeReturnPath } from '@/lib/auth-redirect'
import { syncAuthCookieFromStorage } from '@/lib/auth-cookie'

const loginSchema = z.object({
  email: z.string().email('Địa chỉ email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
})

type LoginFormData = z.infer<typeof loginSchema>

// Nút đăng nhập nhanh chỉ hiển thị khi được bật rõ ràng lúc build.
// Backend cũng kiểm tra ALLOW_DEMO_LOGIN nên đây chỉ là lớp UI.
const ALLOW_DEMO_LOGIN = process.env.NEXT_PUBLIC_ALLOW_DEMO_LOGIN === 'true'

const inputClass =
  'w-full rounded-md border border-input bg-card py-2.5 pl-10 pr-4 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30'

export default function LoginForm({ switchHref }: { switchHref: string }) {
  const router = useRouter()
  const { login } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState('')
  const [passwordChanged, setPasswordChanged] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // Trang bị chặn trước đó được giữ trong ?next= để quay lại đúng chỗ.
  const resolveNextPath = () => {
    if (typeof window === 'undefined') return null
    return safeReturnPath(window.location.search)
  }

  useEffect(() => {
    setPasswordChanged(new URLSearchParams(window.location.search).get('passwordChanged') === '1')
  }, [])

  // Phiên cũ chỉ có localStorage (tạo trước khi có middleware) bị đẩy về đây.
  // Đồng bộ cookie rồi quay lại đúng trang bị chặn thay vì bắt đăng nhập lại.
  useEffect(() => {
    if (typeof window === 'undefined' || !localStorage.getItem('accessToken')) return
    syncAuthCookieFromStorage()
    const nextPath = resolveNextPath()
    let role: string | undefined
    try {
      role = JSON.parse(localStorage.getItem('currentUser') || '{}')?.role
    } catch {
      role = undefined
    }
    const fallback =
      role === 'admin'
        ? '/admin-dashboard'
        : role === 'instructor'
        ? '/instructor-dashboard'
        : '/dashboard'
    router.replace(nextPath || fallback)
  }, [router])

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
        login(resData.user as any, accessToken, refreshToken)
        window.dispatchEvent(new Event('auth-change'))
      } else {
        login({ id: '', email: '', role: userRole as any }, accessToken, refreshToken)
        window.dispatchEvent(new Event('auth-change'))
      }

      const nextPath = resolveNextPath()
      if (nextPath) {
        router.push(nextPath)
      } else if (userRole === 'admin') {
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
        login(resData.user as any, accessToken, refreshToken)
        window.dispatchEvent(new Event('auth-change'))
      } else {
        login({ id: '', email: '', role: role as any }, accessToken, refreshToken)
        window.dispatchEvent(new Event('auth-change'))
      }

      // Điều hướng thông minh theo vai trò (ưu tiên trang bị chặn trước đó)
      const nextPath = resolveNextPath()
      if (nextPath) {
        router.push(nextPath)
      } else if (role === 'admin') {
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
    <>
      {/* Khối Tài khoản Trải nghiệm Nhanh (chỉ bật khi ALLOW_DEMO_LOGIN=true) */}
      {ALLOW_DEMO_LOGIN && (
        <div className="mb-6 rounded-lg border border-stone-200/80 bg-stone-50 p-3.5">
          <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-stone-600">
            Chọn nhanh tài khoản thử nghiệm
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleQuickDemoLogin('admin')}
              className="flex flex-col items-center gap-0.5 rounded-lg border border-stone-200 bg-white px-2 py-1.5 font-medium text-stone-700 shadow-sm transition hover:border-brand-400 hover:bg-brand-50/50"
              title="Đăng nhập nhanh tài khoản Quản trị viên"
            >
              <ShieldCheck className="h-4 w-4 text-rose-600" />
              <span className="text-[11px] font-bold">Admin</span>
              <span className="text-[9px] text-stone-400">Quản trị viên</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemoLogin('instructor')}
              className="flex flex-col items-center gap-0.5 rounded-lg border border-stone-200 bg-white px-2 py-1.5 font-medium text-stone-700 shadow-sm transition hover:border-brand-400 hover:bg-brand-50/50"
              title="Đăng nhập nhanh tài khoản Giảng viên"
            >
              <GraduationCap className="h-4 w-4 text-emerald-600" />
              <span className="text-[11px] font-bold">Giảng viên</span>
              <span className="text-[9px] text-stone-400">Giảng viên</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemoLogin('student')}
              className="flex flex-col items-center gap-0.5 rounded-lg border border-stone-200 bg-white px-2 py-1.5 font-medium text-stone-700 shadow-sm transition hover:border-brand-400 hover:bg-brand-50/50"
              title="Đăng nhập nhanh tài khoản Học viên"
            >
              <BookOpen className="h-4 w-4 text-brand-600" />
              <span className="text-[11px] font-bold">Học viên</span>
              <span className="text-[9px] text-stone-400">Học viên</span>
            </button>
          </div>
        </div>
      )}

      {passwordChanged && <p role="status" className="mb-4 rounded-lg bg-muted p-3 text-sm">Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.</p>}
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
        <p className="-mb-0.5 text-xs leading-relaxed text-muted-foreground">
          Dùng email đã đăng ký với hệ thống. Tài khoản của bạn sẽ được đưa về đúng không gian học tập.
        </p>
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
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
              className={inputClass}
              placeholder="vidu@domain.com"
            />
          </div>
          {errors.email && (
            <p id="email-error" role="alert" className="mt-1.5 text-xs text-rose-600">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="block text-xs font-semibold text-stone-700">
              Mật khẩu
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-brand-600 transition hover:text-brand-800"
            >
              Quên mật khẩu?
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
              className={`${inputClass} pr-12`}
              placeholder="••••••••"
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
          {errors.password && (
            <p id="password-error" role="alert" className="mt-1.5 text-xs text-rose-600">
              {errors.password.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang đăng nhập...
            </>
          ) : (
            <>
              Đăng nhập
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-stone-400">
        Bằng việc đăng nhập, bạn đồng ý với{' '}
        <Link href="/terms" className="underline transition hover:text-stone-600">
          Điều khoản
        </Link>{' '}
        và{' '}
        <Link href="/privacy" className="underline transition hover:text-stone-600">
          Chính sách bảo mật
        </Link>{' '}
        của chúng tôi.
      </p>
      <p className="mt-5 border-t border-border pt-4 text-center text-sm text-muted-foreground">
        Chưa có tài khoản?{' '}
        <Link href={switchHref} scroll={false} className="font-semibold text-primary hover:underline">Đăng ký</Link>
      </p>
    </>
  )
}
