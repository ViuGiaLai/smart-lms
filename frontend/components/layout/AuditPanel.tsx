'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/empty-state'

interface Entry {
  id: number
  actorId: number | null
  action: string
  targetType: string
  targetId: string
  details: Record<string, unknown>
  createdAt: string
}

const labels: Record<string, string> = {
  'account.status': 'Đổi trạng thái tài khoản',
  'account.role': 'Đổi vai trò',
  'account.password': 'Đổi mật khẩu',
  'course.price': 'Đổi học phí',
  'course.status': 'Đổi trạng thái khóa học',
  'course.enroll': 'Ghi danh nội bộ',
  'checkout.demo': 'Giao dịch mô phỏng',
  'assignment.grade': 'Chấm bài thực hành',
  'material.delete': 'Xóa học liệu',
}

export function AuditPanel() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  async function load(before?: number) {
    setBusy(true)
    setError('')
    try {
      const { data } = await api.get('/api/v1/admin/audit-logs', { params: { before } })
      setEntries((previous) => before ? [...previous, ...data.data] : data.data)
      setNext(data.nextBefore)
    } catch {
      setError('Chưa tải được nhật ký hoạt động.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void load() }, [])

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-6" aria-busy={busy}>
      {error && <ErrorState message={error} actionLabel="Thử lại" onAction={() => void load()} />}
      {busy && entries.length === 0 && <p role="status">Đang tải nhật ký…</p>}
      {!busy && !error && entries.length === 0 && <p>Chưa có thao tác được ghi nhận.</p>}
      <ul className="divide-y divide-border">
        {entries.map((entry) => (
          <li key={entry.id} className="space-y-1 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold">{labels[entry.action] ?? entry.action}</span>
              <time dateTime={entry.createdAt} className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString('vi-VN')}</time>
            </div>
            <p className="break-all text-muted-foreground">Người thực hiện {entry.actorId ? `#${entry.actorId}` : 'đã xóa'} · {entry.targetType} #{entry.targetId}</p>
            <details className="mt-1">
              <summary className="cursor-pointer text-primary">Chi tiết</summary>
              <pre className="whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{JSON.stringify(entry.details, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ul>
      {next && <Button variant="outline" disabled={busy} onClick={() => void load(next)}>Tải thêm</Button>}
    </section>
  )
}
