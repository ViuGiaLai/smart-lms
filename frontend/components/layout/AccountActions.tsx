'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuth, type AuthUser } from '@/lib/auth-context'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export function UserAvatar({ user, className }: { user: AuthUser; className?: string }) {
  const initials = (user.fullName || user.name || 'Tài khoản').trim().split(/\s+/).slice(-2).map((word) => word[0]).join('').toUpperCase()
  return (
    <Avatar className={className}>
      <AvatarImage src={user.avatarUrl || undefined} alt="" referrerPolicy="no-referrer" />
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  )
}

export function AccountActions() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const unread = useQuery({
    queryKey: ['notifications', user?.id, 'count'],
    enabled: !!user,
    queryFn: async () => (await api.get<{ count: number }>('/api/v1/notifications/unread-count')).data.count,
    refetchInterval: 60_000,
  }).data ?? 0
  if (!user) return null

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link href="/account/notifications" className="relative rounded-lg p-2 hover:bg-muted"
        title="Thông báo" aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}>
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && <span aria-hidden className="absolute -right-1 top-0 rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{unread > 99 ? '99+' : unread}</span>}
      </Link>
      <details className="relative" onKeyDown={(event) => {
        if (event.key === 'Escape' && event.currentTarget.open) {
          event.currentTarget.open = false
          event.currentTarget.querySelector('summary')?.focus()
        }
      }}>
        <summary className="cursor-pointer list-none rounded-full [&::-webkit-details-marker]:hidden" aria-label="Menu tài khoản" title="Menu tài khoản">
          <UserAvatar user={user} className="h-9 w-9" />
        </summary>
        <div className="absolute right-0 z-40 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-2 text-sm shadow-lg">
          <p className="break-words px-2 pt-2 font-semibold">{user.fullName || user.name}</p>
          <p className="break-all px-2 pb-2 text-xs text-muted-foreground">{user.email}</p>
          {[
            ['/account/profile', 'Thông tin cá nhân'],
            ['/account/settings', 'Cài đặt và bảo mật'],
            ['/account/notifications', 'Thông báo'],
            ['/', 'Về trang chủ'],
          ].map(([href, label]) => (
            <Link key={href} href={href} onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')} className="block rounded-md px-2 py-2 hover:bg-muted">{label}</Link>
          ))}
          <button type="button" className="w-full rounded-md px-2 py-2 text-left text-destructive hover:bg-muted" onClick={async () => { await logout(); router.replace('/?auth=login') }}>Đăng xuất</button>
        </div>
      </details>
    </div>
  )
}
