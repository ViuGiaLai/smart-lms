'use client'

import { useEffect, useState, type FormEvent } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/empty-state'

interface Assignment {
  id: number
  title: string
  instructions: string
  due_at: string | null
  max_attempts: number
  max_score: number
}
interface Submission {
  id: number
  attempt: number
  content: string | null
  repository_url: string | null
  student_name: string
  submitted_at: string
  score: number | null
  feedback: string | null
}

const field = 'mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
const date = (value: string) => new Date(value).toLocaleString('vi-VN')

function readError(error: unknown) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : 'Chưa thực hiện được thao tác. Kiểm tra dữ liệu và thử lại.'
}

export function AssignmentsPanel({ courseId, teaching = false, locked = false, initialAssignmentId }: { courseId: string; teaching?: boolean; locked?: boolean; initialAssignmentId?: number }) {
  const [items, setItems] = useState<Assignment[]>([])
  const [activeId, setActiveId] = useState<number | null>(initialAssignmentId ?? null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [nextBefore, setNextBefore] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const url = `/api/v1/courses/${courseId}/assignments`
  const current = items.find((item) => item.id === activeId)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api.get(url).then(({ data }) => {
      if (active) setItems(data.data)
    }).catch((reason) => { if (active) setError(readError(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [url, reload])

  useEffect(() => {
    if (activeId === null) return
    let active = true
    setSubmissions([])
    setNextBefore(null)
    setSubmissionsLoading(true)
    api.get(`${url}/${activeId}/submissions`).then(({ data }) => {
      if (active) {
        setSubmissions(data.data)
        setNextBefore(data.nextBefore)
      }
    }).catch((reason) => { if (active) setError(readError(reason)) })
      .finally(() => { if (active) setSubmissionsLoading(false) })
    return () => { active = false }
  }, [url, activeId])

  async function run(action: () => Promise<void>, success = '') {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(success)
    } catch (reason) {
      setError(readError(reason))
    } finally {
      setBusy(false)
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const input = new FormData(form)
    void run(async () => {
      const due = input.get('due_at')
      const { data } = await api.post<Assignment>(url, {
        title: input.get('title'), instructions: input.get('instructions'),
        due_at: due ? new Date(String(due)).toISOString() : null,
        max_attempts: Number(input.get('max_attempts')), max_score: Number(input.get('max_score')),
      })
      setItems((previous) => [...previous, data])
      setActiveId(data.id)
      form.reset()
    }, 'Đã giao bài tập.')
  }

  return (
    <section id="assignments" className="scroll-mt-20 space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-6">
      <h2 className="text-lg font-semibold">Bài tập thực hành</h2>
      {error && <ErrorState message={error} actionLabel={!items.length ? 'Thử lại' : undefined} onAction={() => setReload((value) => value + 1)} />}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {teaching && !locked && (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer font-medium">Giao bài tập</summary>
          <form className="mt-3 space-y-3" onSubmit={create}>
            <label className="block text-sm">Tiêu đề<input className={field} name="title" required maxLength={180} /></label>
            <label className="block text-sm">Đề bài và tiêu chí chấm<textarea className={field} name="instructions" required rows={4} maxLength={12000} /></label>
            <label className="block text-sm">Hạn nộp theo giờ thiết bị<input className={field} name="due_at" type="datetime-local" /></label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-sm">Số lần nộp<input className={field} type="number" name="max_attempts" defaultValue={1} min={1} max={10} required /></label>
              <label className="block text-sm">Điểm tối đa<input className={field} type="number" name="max_score" defaultValue={100} min={1} max={1000} required /></label>
            </div>
            <Button type="submit" disabled={busy}>Giao bài</Button>
          </form>
        </details>
      )}
      {loading ? <p role="status" className="text-sm">Đang tải bài tập…</p> : !error && items.length === 0 && <p className="text-sm text-muted-foreground">Khóa học chưa có bài tập.</p>}
      {items.length > 0 && (
        <label className="block text-sm">Chọn bài tập
          <select className={field} disabled={busy} value={activeId ?? ''} onChange={(event) => { setActiveId(Number(event.target.value)); setError(''); setNotice('') }}>
            <option value="" disabled>Chọn bài để xem yêu cầu</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
      )}
      {current && (
        <div className="space-y-4">
          <p className="whitespace-pre-wrap break-words text-sm">{current.instructions}</p>
          <p className="text-sm text-muted-foreground">{current.due_at ? `Hạn nộp ${date(current.due_at)}` : 'Không đặt hạn nộp'} · ${current.max_attempts} lượt · ${current.max_score} điểm</p>
          {!teaching && !submissionsLoading && submissions.length < current.max_attempts && (!current.due_at || Date.parse(current.due_at) > Date.now()) && (
            <form key={current.id} className="space-y-3" onSubmit={(event) => {
              event.preventDefault()
              const form = event.currentTarget
              const input = new FormData(form)
              void run(async () => {
                const { data } = await api.post<Submission>(`${url}/${current.id}/submissions`, {
                  content: input.get('content') || null, repository_url: input.get('repository_url') || null,
                })
                setSubmissions((previous) => [data, ...previous])
                form.reset()
              }, 'Đã nộp bài.')
            }}>
              <label className="block text-sm">Nội dung bài nộp<textarea className={field} rows={3} name="content" maxLength={12000} /></label>
              <label className="block text-sm">Liên kết mã nguồn (HTTPS)<input className={field} name="repository_url" type="url" maxLength={1024} /></label>
              <Button type="submit" disabled={busy}>Nộp bài</Button>
            </form>
          )}
          {submissionsLoading ? <p role="status" className="text-sm">Đang tải bài nộp…</p> : submissions.length === 0 && <p className="text-sm text-muted-foreground">Chưa có bài nộp.</p>}
          {submissions.map((submission) => (
            <article key={submission.id} className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <h3 className="font-semibold">{teaching ? `${submission.student_name} · ` : ''}Lần ${submission.attempt} · ${date(submission.submitted_at)}</h3>
              {submission.content && <p className="whitespace-pre-wrap break-words">{submission.content}</p>}
              {submission.repository_url && <a href={submission.repository_url} target="_blank" rel="noopener noreferrer" className="break-all underline">Mở liên kết mã nguồn</a>}
              <p>{submission.score === null ? 'Chờ chấm' : `Điểm ${submission.score}/${current.max_score}`}</p>
              {submission.feedback && <p className="whitespace-pre-wrap break-words">{submission.feedback}</p>}
              {teaching && !locked && <form className="space-y-2" onSubmit={(event) => {
                event.preventDefault()
                const input = new FormData(event.currentTarget)
                void run(async () => {
                  const { data } = await api.put<Submission>(`${url}/${current.id}/submissions/${submission.id}/grade`, {
                    score: Number(input.get('score')), feedback: input.get('feedback'),
                  })
                  setSubmissions((previous) => previous.map((item) => item.id === data.id ? { ...item, ...data } : item))
                }, 'Đã lưu điểm và nhận xét.')
              }}>
                <label className="block">Điểm<input className={field} name="score" type="number" min={0} max={current.max_score} defaultValue={submission.score ?? ''} required /></label>
                <label className="block">Nhận xét<textarea name="feedback" defaultValue={submission.feedback ?? ''} className={field} maxLength={12000} /></label>
                <Button type="submit" disabled={busy} variant="outline">Lưu điểm</Button>
              </form>}
            </article>
          ))}
          {nextBefore !== null && <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
            const { data } = await api.get(`${url}/${current.id}/submissions`, { params: { before: nextBefore } })
            setSubmissions((previous) => [...previous, ...data.data])
            setNextBefore(data.nextBefore)
          })}>Tải thêm bài nộp</Button>}
        </div>
      )}
    </section>
  )
}
