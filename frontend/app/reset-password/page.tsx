import { Suspense } from 'react'

import { ResetPasswordForm } from './ResetPasswordForm'

export const metadata = {
  title: 'Đặt lại mật khẩu',
  description: 'Tạo mật khẩu mới cho tài khoản Smart LMS bằng liên kết dùng một lần.',
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-stone-50">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
