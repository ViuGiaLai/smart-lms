'use client'

import { useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/empty-state'

export function InternalEnrollment({ courseId }: { courseId: string }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Ghi danh sinh viên nội bộ</h2>
      <form className="flex flex-wrap items-end gap-2" onSubmit={async (event) => {
        event.preventDefault()
        if (busy || !email.trim()) return
        setBusy(true)
        setError('')
        setNotice('')
        try {
          await api.post(`/api/v1/courses/${courseId}/curriculum/enrollments`, { email: email.trim() })
          setNotice('Tài khoản đã có quyền học khóa này.')
          setEmail('')
        } catch (reason) {
          const detail = (reason as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
          setError(typeof detail === 'string' ? detail : 'Chưa thể ghi danh sinh viên.')
        } finally {
          setBusy(false)
        }
      }}>
        <label className="min-w-0 flex-1 text-sm font-medium">Email tài khoản sinh viên
          <input type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} required
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2" />
        </label>
        <Button type="submit" disabled={busy}>{busy ? 'Đang ghi danh…' : 'Ghi danh'}</Button>
      </form>
      {error && <ErrorState message={error} />}
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </section>
  )
}
