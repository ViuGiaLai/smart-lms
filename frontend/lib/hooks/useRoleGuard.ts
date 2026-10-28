'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export type UserRole = 'student' | 'instructor' | 'admin'

/**
 * Hook kiểm tra phân quyền & bảo vệ tuyến đường (RBAC Route Guard).
 *
 * Trạng thái đăng nhập được đọc đồng bộ từ AuthProvider (useSyncExternalStore),
 * nên khi chuyển trang trong app không còn màn hình "Đang kiểm tra quyền..."
 * nhấp nháy nữa. Việc điều hướng chỉ chạy trong useEffect — không chặn render.
 */
export function useRoleGuard(allowedRoles?: UserRole[]) {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()

  // `useSyncExternalStore` dùng server snapshot (rỗng) trong lần render hydrate
  // đầu tiên. Nếu điều hướng ngay lúc đó, F5 trên trang cần đăng nhập sẽ bị đá
  // về /login. Chờ thêm 1 nhịp mount để store đọc xong localStorage.
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Khóa chuỗi ổn định chống re-render vô tận khi truyền mảng mới mỗi lần render
  const rolesKey = allowedRoles && allowedRoles.length > 0 ? allowedRoles.slice().sort().join(',') : ''

  const currentRole = (user?.role as UserRole | undefined) ?? null
  const isAuthorized =
    !!user && (!rolesKey || (currentRole !== null && rolesKey.split(',').includes(currentRole)))

  useEffect(() => {
    // Trang công khai (không khai báo role) thì không điều hướng gì cả.
    if (!rolesKey || !isMounted) return

    if (!user) {
      // Chỉ đăng xuất khi thực sự không còn phiên trong localStorage.
      let hasSession = false
      try {
        hasSession = !!localStorage.getItem('accessToken')
      } catch {
        hasSession = false
      }
      if (!hasSession && pathname !== '/login') router.replace('/login')
      return
    }

    if (isAuthorized) return

    if (currentRole === 'admin' && pathname !== '/admin-dashboard') {
      router.replace('/admin-dashboard')
    } else if (currentRole === 'instructor' && pathname !== '/instructor-dashboard') {
      router.replace('/instructor-dashboard')
    } else if (currentRole === 'student' && pathname !== '/dashboard') {
      router.replace('/dashboard')
    }
  }, [user, currentRole, isAuthorized, rolesKey, pathname, router, isMounted])

  return { isAuthorized, user }
}
