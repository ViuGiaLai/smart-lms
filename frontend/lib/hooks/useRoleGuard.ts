'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export type UserRole = 'student' | 'instructor' | 'admin'

/**
 * Hook kiểm tra phân quyền & bảo vệ tuyến đường (RBAC Route Guard).
 * Sử dụng rolesKey dạng chuỗi để triệt tiêu hoàn toàn vòng lặp re-render (Infinite Re-render Loop).
 */
export function useRoleGuard(allowedRoles?: UserRole[]) {
  const router = useRouter()
  const pathname = usePathname()
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [user, setUser] = useState<{
    id?: string
    name?: string
    fullName?: string
    email?: string
    role?: UserRole
  } | null>(null)

  // Khóa chuỗi ổn định chống re-render vô tận khi truyền mảng mới mỗi lần render
  const rolesKey = allowedRoles && allowedRoles.length > 0 ? allowedRoles.slice().sort().join(',') : ''

  useEffect(() => {
    if (typeof window === 'undefined') return

    const userStr = localStorage.getItem('currentUser')
    const token = localStorage.getItem('accessToken')

    let currentUser: any = null
    if (userStr && token) {
      try {
        currentUser = JSON.parse(userStr)
      } catch {
        currentUser = null
      }
    }

    // Nếu chưa có phiên đăng nhập hợp lệ
    if (!currentUser || !token) {
      setIsAuthorized((prev) => (prev ? false : prev))
      setUser((prev) => (prev === null ? prev : null))
      if (rolesKey && pathname !== '/login') {
        router.replace('/login')
      }
      return
    }

    const currentRole: UserRole = currentUser.role || 'student'

    // Kiểm tra nếu trang có quy định vai trò được phép truy cập
    if (rolesKey) {
      const allowed = rolesKey.split(',') as UserRole[]
      if (!allowed.includes(currentRole)) {
        setIsAuthorized((prev) => (prev ? false : prev))
        if (currentRole === 'admin' && pathname !== '/admin-dashboard') {
          router.replace('/admin-dashboard')
        } else if (currentRole === 'instructor' && pathname !== '/instructor-dashboard') {
          router.replace('/instructor-dashboard')
        } else if (currentRole === 'student' && pathname !== '/dashboard') {
          router.replace('/dashboard')
        }
        return
      }
    }

    // Chỉ cập nhật state nếu thực sự thay đổi để chặn re-render bão táp
    setUser((prev) => {
      if (
        prev &&
        prev.id === currentUser.id &&
        prev.role === currentUser.role &&
        prev.email === currentUser.email &&
        (prev.name === currentUser.name || prev.fullName === currentUser.fullName)
      ) {
        return prev
      }
      return currentUser
    })

    setIsAuthorized((prev) => (prev ? prev : true))
  }, [router, pathname, rolesKey])

  return { isAuthorized, user }
}

