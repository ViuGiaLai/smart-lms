'use client'

import { useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/empty-state'

export interface CourseSection { id: number; title: string }
interface CurriculumLesson { id: string | number; title: string; section_id?: number | null }
interface Placement { sectionId: number | null; lessonIds: number[] }

interface Props {
  courseId: string
  sections: CourseSection[]
  lessons: CurriculumLesson[]
  onChange: (sections: CourseSection[], placements?: Placement[]) => void
}

function move<T>(items: T[], index: number, direction: number): T[] {
  const copy = [...items]
  const [item] = copy.splice(index, 1)
  copy.splice(index + direction, 0, item)
  return copy
}

export function CurriculumEditor({ courseId, sections, lessons, onChange }: Props) {
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const url = `/api/v1/courses/${courseId}/curriculum`
  const groups = [...sections, { id: null, title: 'Chưa xếp chương' }]
  const placements = groups.map((group) => ({
    sectionId: group.id,
    lessonIds: lessons.filter((lesson) => (lesson.section_id ?? null) === group.id).map((lesson) => Number(lesson.id)),
  }))
  const lessonNames = new Map(lessons.map((lesson) => [Number(lesson.id), lesson.title]))

  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice('Đã lưu giáo trình.')
    } catch (reason) {
      const detail = (reason as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Chưa lưu được giáo trình.')
    } finally {
      setBusy(false)
    }
  }

  const saveOrder = (layout: Placement[], nextSections = sections) => run(async () => {
    await api.put(`${url}/order`, { sections: layout })
    onChange(nextSections, layout)
  })

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Chương và thứ tự bài học</h2>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
        event.preventDefault()
        if (!title.trim()) return
        void run(async () => {
          const { data } = editing === null
            ? await api.post<CourseSection>(`${url}/sections`, { title })
            : await api.put<CourseSection>(`${url}/sections/${editing}`, { title })
          onChange(editing === null ? [...sections, data] : sections.map((section) => section.id === editing ? data : section))
          setTitle('')
          setEditing(null)
        })
      }}>
        <label className="min-w-0 flex-1 text-sm font-medium">
          {editing === null ? 'Tên chương mới' : 'Đổi tên chương'}
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2" />
        </label>
        <Button type="submit" disabled={busy || !title.trim()}>{editing === null ? 'Thêm chương' : 'Lưu tên'}</Button>
        {editing !== null && <Button type="button" variant="ghost" onClick={() => { setEditing(null); setTitle('') }}>Hủy</Button>}
      </form>
      {error && <ErrorState message={error} />}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {groups.map((group, groupIndex) => (
        <div key={group.id ?? 'unassigned'} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 flex-1 break-words font-semibold">{group.title}</h3>
            {group.id !== null && <>
              {[-1, 1].map((direction) => (
                <Button key={direction} size="sm" variant="outline" disabled={busy || groupIndex + direction < 0 || groupIndex + direction >= sections.length}
                  aria-label={`${direction < 0 ? 'Đưa lên' : 'Đưa xuống'} chương ${group.title}`}
                  onClick={() => void saveOrder(move(placements, groupIndex, direction), move(sections, groupIndex, direction))}>
                  {direction < 0 ? '↑' : '↓'}
                </Button>
              ))}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(group.id); setTitle(group.title) }}>Đổi tên</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
                if (!window.confirm(`Bỏ chương “${group.title}”? Các bài học sẽ chuyển về nhóm chưa xếp chương.`)) return
                void run(async () => {
                  await api.delete(`${url}/sections/${group.id}`)
                  const remaining = placements.filter((item) => item.sectionId !== group.id)
                  remaining[remaining.length - 1].lessonIds.push(...placements[groupIndex].lessonIds)
                  onChange(sections.filter((item) => item.id !== group.id), remaining)
                })
              }}>Bỏ chương</Button>
            </>}
          </div>
          {placements[groupIndex].lessonIds.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Chưa có bài học.</p> : (
            <ul className="mt-2 divide-y divide-border">
              {placements[groupIndex].lessonIds.map((id, index, items) => (
                <li key={id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 basis-full break-words text-sm sm:basis-auto">{lessonNames.get(id)}</span>
                  {[-1, 1].map((direction) => (
                    <Button size="sm" variant="outline" key={direction} disabled={busy || index + direction < 0 || index + direction >= items.length}
                      aria-label={`${direction < 0 ? 'Đưa lên' : 'Đưa xuống'} bài ${lessonNames.get(id)}`}
                      onClick={() => void saveOrder(placements.map((entry, position) => position === groupIndex ? { ...entry, lessonIds: move(items, index, direction) } : entry))}>
                      {direction < 0 ? '↑' : '↓'}
                    </Button>
                  ))}
                  <select className="max-w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={group.id ?? ''} disabled={busy}
                    aria-label={`Chương của bài ${lessonNames.get(id)}`}
                    onChange={(event) => {
                      const target = event.target.value === '' ? null : Number(event.target.value)
                      void saveOrder(placements.map((entry) => ({
                        ...entry, lessonIds: entry.sectionId === target ? [...entry.lessonIds, id] : entry.lessonIds.filter((value) => value !== id),
                      })))
                    }}>
                    {groups.map((entry) => <option key={entry.id ?? 'unassigned'} value={entry.id ?? ''}>{entry.title}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  )
}
