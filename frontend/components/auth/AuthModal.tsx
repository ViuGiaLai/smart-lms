'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import LoginForm from './LoginForm'
import RegisterForm from './RegisterForm'

export function AuthModal() {
  const search = useSearchParams()
  const path = usePathname()
  const router = useRouter()
  const mode = search.get('auth')
  if (mode !== 'login' && mode !== 'register') return null
  const registering = mode === 'register'
  const switchParams = new URLSearchParams(search.toString())
  switchParams.set('auth', registering ? 'login' : 'register')
  switchParams.delete('passwordChanged')

  return (
    <Dialog open onOpenChange={(open) => {
      if (open) return
      const params = new URLSearchParams(search.toString())
      for (const field of ['auth', 'next', 'redirect', 'passwordChanged']) params.delete(field)
      router.replace(params.size ? `${path}?${params}` : path, { scroll: false })
    }}>
      <DialogContent className="max-w-md">
        <DialogTitle className="pr-8 text-xl">{registering ? 'Tạo tài khoản học viên' : 'Đăng nhập'}</DialogTitle>
        <DialogDescription className="text-sm">
          {registering ? 'Lưu tiến độ, làm bài tập và học với Gia sư AI.' : 'Dùng tài khoản SmartTutor LMS để tiếp tục học.'}
        </DialogDescription>
        {registering ? <RegisterForm switchHref={`${path}?${switchParams}`} /> : <LoginForm switchHref={`${path}?${switchParams}`} />}
      </DialogContent>
    </Dialog>
  )
}
