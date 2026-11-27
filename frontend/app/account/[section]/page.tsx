'use client'

import Link from 'next/link'
import { notFound, useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { UserAvatar } from '@/components/layout/AccountActions'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'

const input = 'mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-base'
const sections = { profile: 'Thông tin cá nhân', settings: 'Cài đặt và bảo mật', notifications: 'Thông báo' } as const

function message(error: unknown) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : 'Chưa thể thực hiện thao tác. Kiểm tra thông tin và thử lại.'
}

function Profile() {
  const { user, refreshUser } = useAuth()
  const [draft, setDraft] = useState({ name: '', avatarUrl: '', university: '', field: '', bio: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api.get('/api/v1/auth/profile').then(({ data }) => {
      if (!active) return
      const user = data.data
      setDraft({ name: user.name ?? '', avatarUrl: user.avatarUrl ?? '', university: user.profile?.university ?? '',
        field: user.profile?.field ?? '', bio: user.profile?.bio ?? '' })
    }).catch((error) => { if (active) setError(message(error)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt])
  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api.patch('/api/v1/auth/profile', { ...draft, avatarUrl: draft.avatarUrl.trim() || null,
        ...(user?.role === 'admin' && { university: '', field: '' }) })
      await refreshUser()
      setNotice('Đã lưu hồ sơ cá nhân.')
    } catch (error) {
      setError(message(error))
    } finally {
      setBusy(false)
    }
  }
  if (loading) return <p role="status">Đang tải hồ sơ…</p>
  return (
    <form onSubmit={save} className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      {user && <div className="flex items-center gap-3"><UserAvatar user={user} className="h-14 w-14" /><div className="min-w-0"><p className="break-words font-semibold">{user.fullName || user.name}</p><p className="break-all text-sm text-muted-foreground">{user.email}</p></div></div>}
      {error && <ErrorState message={error} />}
      {notice && <p role="status">{notice}</p>}
      <label className="block text-sm">Họ và tên<input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required minLength={2} maxLength={120} autoComplete="name" /></label>
      <label className="block text-sm">Liên kết ảnh đại diện (HTTPS)<input type="url" className={input} value={draft.avatarUrl} onChange={(e) => setDraft({ ...draft, avatarUrl: e.target.value })} maxLength={512} /></label>
      {user?.role !== 'admin' && <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Trường hoặc đơn vị<input className={input} value={draft.university} onChange={(e) => setDraft({ ...draft, university: e.target.value })} maxLength={160} /></label>
        <label className="block text-sm">{user?.role === 'instructor' ? 'Chuyên môn' : 'Ngành học'}<input className={input} value={draft.field} onChange={(e) => setDraft({ ...draft, field: e.target.value })} maxLength={160} /></label>
      </div>}
      <label className="block text-sm">Giới thiệu<textarea className={input} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} rows={4} maxLength={500} /></label>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !draft.name.trim()}>Lưu hồ sơ</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setNotice(''); setAttempt((n) => n + 1) }}>Tải lại thông tin</Button></div>
    </form>
  )
}

function Security() {
  const { logout } = useAuth()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <form className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6" onSubmit={async (event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      setError('')
      if (data.get('newPassword') !== data.get('confirm')) { setError('Mật khẩu xác nhận không khớp.'); return }
      setBusy(true)
      try {
        await api.post('/api/v1/auth/change-password', { currentPassword: data.get('current'), newPassword: data.get('newPassword') })
        await logout()
        router.replace('/?auth=login&passwordChanged=1')
      } catch (error) {
        setError(message(error))
      } finally {
        setBusy(false)
      }
    }}>
      <h2 className="text-lg font-semibold">Đổi mật khẩu</h2>
      <p className="text-sm text-muted-foreground">Sau khi đổi mật khẩu, bạn cần đăng nhập lại trên các thiết bị.</p>
      {error && <ErrorState message={error} />}
      <label className="block text-sm">Mật khẩu hiện tại<input name="current" type="password" className={input} required maxLength={128} autoComplete="current-password" /></label>
      <label className="block text-sm">Mật khẩu mới<input name="newPassword" type="password" className={input} required minLength={8} maxLength={72} autoComplete="new-password" /></label>
      <label className="block text-sm">Xác nhận mật khẩu mới<input name="confirm" type="password" className={input} required autoComplete="new-password" /></label>
      <Button disabled={busy}>{busy ? 'Đang lưu…' : 'Đổi mật khẩu'}</Button>
      <Link href="/privacy" className="block text-sm underline">Chính sách quyền riêng tư</Link>
    </form>
  )
}

interface Notice { id: number; title: string; href: string; read: boolean; createdAt: string }

function Inbox() {
  const [items, setItems] = useState<Notice[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const query = useQueryClient()
  const router = useRouter()
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try { await action() } catch (error) { setError(message(error)) } finally { setBusy(false) }
  }, [])
  const load = useCallback((before?: number) => run(async () => {
    const { data } = await api.get('/api/v1/notifications', { params: { before } })
    setItems((existing) => before ? [...existing, ...data.data] : data.data)
    setNext(data.nextBefore)
  }), [run])
  useEffect(() => { void load() }, [load])
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-6">
      <Button variant="outline" disabled={busy || !items.length} onClick={() => void run(async () => {
        await api.post('/api/v1/notifications/read-all')
        setItems((items) => items.map((item) => ({ ...item, read: true })))
        void query.invalidateQueries({ queryKey: ['notifications'] })
      })}>Đánh dấu tất cả đã đọc</Button>
      {error && <ErrorState message={error} actionLabel="Tải lại" onAction={() => void load()} />}
      {busy && !items.length && <p role="status">Đang tải thông báo…</p>}
      {!busy && !error && !items.length && <p>Chưa có thông báo.</p>}
      <ul className="divide-y divide-border">
        {items.map((item) => <li key={item.id} className="py-3">
          <button type="button" disabled={busy} className="text-left font-medium text-primary hover:underline" onClick={() => void run(async () => {
            if (!item.read) {
              await api.patch(`/api/v1/notifications/${item.id}/read`)
              setItems((items) => items.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry))
              void query.invalidateQueries({ queryKey: ['notifications'] })
            }
            router.push(item.href)
          })}>{item.read ? '' : '• '}{item.title}</button>
          <p className="text-xs text-muted-foreground"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('vi-VN')}</time></p>
        </li>)}
      </ul>
      {next !== null && <Button variant="outline" disabled={busy} onClick={() => void load(next)}>Tải thêm</Button>}
    </section>
  )
}

export default function AccountPage() {
  const { section } = useParams<{ section: string }>()
  if (section !== 'profile' && section !== 'settings' && section !== 'notifications') notFound()
  return <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
    <PageHeader title={sections[section]} />
    <nav aria-label="Tài khoản" className="flex flex-wrap gap-2">
      {Object.entries(sections).map(([page, label]) => <Button key={page} asChild variant={page === section ? 'default' : 'outline'}>
        <Link href={`/account/${page}`} aria-current={page === section ? 'page' : undefined}>{label}</Link>
      </Button>)}
    </nav>
    {section === 'profile' ? <Profile /> : section === 'settings' ? <Security /> : <Inbox />}
  </div>
}
