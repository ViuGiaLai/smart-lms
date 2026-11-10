/**
 * Ghi nhận sự kiện học tập nhẹ, không chặn thao tác của người học.
 *
 * Sự kiện được gom theo lô ngắn rồi gửi tới `POST /api/v1/events`. Nếu mất
 * mạng, sự kiện bị bỏ qua thay vì xếp hàng vô hạn; đây là dữ liệu phân tích,
 * không phải dữ liệu nghiệp vụ bắt buộc.
 */

export type LearningEventType =
  | 'course_view'
  | 'lesson_view'
  | 'video_play'
  | 'video_pause'
  | 'video_complete'
  | 'material_open'
  | 'quiz_start'
  | 'quiz_submit'
  | 'ai_chat'
  | 'ai_feedback'

export interface LearningEventInput {
  event_type: LearningEventType
  course_id?: string | number | null
  lesson_id?: string | number | null
  duration_seconds?: number | null
  metadata?: Record<string, string | number | boolean | null>
}

const MAX_QUEUE = 50
const FLUSH_DELAY_MS = 1200

let queue: LearningEventInput[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let listening = false

function toId(value: string | number | null | undefined): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
}

function getAccessToken(): string | null {
  try {
    return window.localStorage.getItem('accessToken')
  } catch {
    return null
  }
}

async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (queue.length === 0 || typeof window === 'undefined') return

  const batch = queue.slice(0, MAX_QUEUE)
  queue = queue.slice(batch.length)
  const token = getAccessToken()
  if (!token) return

  const payload = batch.map((event) => ({
    event_type: event.event_type,
    course_id: toId(event.course_id),
    lesson_id: toId(event.lesson_id),
    duration_seconds:
      typeof event.duration_seconds === 'number' && event.duration_seconds >= 0
        ? Math.round(event.duration_seconds)
        : null,
    metadata: event.metadata ?? null,
  }))

  try {
    await fetch(`${getApiBaseUrl()}/api/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ events: payload }),
      keepalive: true,
    })
  } catch {
    // Phân tích không được làm gián đoạn việc học; bỏ lô hiện tại.
  }
}

function schedule(): void {
  if (timer || typeof window === 'undefined') return
  timer = setTimeout(() => {
    void flush()
  }, FLUSH_DELAY_MS)
}

function ensureLifecycleListeners(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  // Đóng tab/chuyển trang: cố gắng gửi nốt lô đang chờ.
  window.addEventListener('pagehide', () => {
    void flush()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
}

export function trackLearningEvent(event: LearningEventInput): void {
  if (typeof window === 'undefined') return
  ensureLifecycleListeners()
  // Không để một vòng lặp lỗi làm phình bộ nhớ.
  if (queue.length >= MAX_QUEUE) {
    void flush()
  }
  queue.push(event)
  schedule()
}

export function flushLearningEvents(): Promise<void> {
  return flush()
}
