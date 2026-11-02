import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Main API instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ===== Request Interceptor =====
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Attach access token from localStorage
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ===== Response Interceptor =====
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value: string) => void
  reject: (reason?: unknown) => void
}> = []

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token!)
    }
  })
  failedQueue = []
}

// FastAPI trả `detail` dạng MẢNG object cho lỗi 422 (validation). Render thẳng
// giá trị đó làm React ném "Objects are not valid as a React child" và trắng trang.
// Chuẩn hoá ngay tại tầng axios để mọi component chỉ nhận về chuỗi.
function formatApiDetail(detail: unknown): string | null {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const record = item as { msg?: unknown; loc?: unknown }
          const msg = typeof record.msg === 'string' ? record.msg : ''
          const loc = Array.isArray(record.loc) ? record.loc.filter((part) => part !== 'body') : []
          const field = loc.length ? String(loc[loc.length - 1]) : ''
          return [field, msg].filter(Boolean).join(': ')
        }
        return ''
      })
      .filter(Boolean)
    return parts.length ? parts.join('; ') : null
  }
  if (detail && typeof detail === 'object') {
    const msg = (detail as { msg?: unknown }).msg
    if (typeof msg === 'string' && msg) return msg
    try {
      return JSON.stringify(detail)
    } catch {
      return null
    }
  }
  return null
}

function normalizeApiError(error: AxiosError) {
  const data = error.response?.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const record = data as { detail?: unknown }
    const text = formatApiDetail(record.detail)
    if (text) record.detail = text
  }
  return error
}

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    normalizeApiError(error)
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Không kích hoạt cơ chế refresh token đối với các API đăng nhập, đăng ký, làm mới phiên
    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/refresh')

    if (isAuthEndpoint) {
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return api(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null

      if (!refreshToken) {
        isRefreshing = false
        // Chỉ điều hướng về trang đăng nhập nếu người dùng đang ở trang khác
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          if (window.location.pathname !== '/login') {
            window.location.href = '/login'
          }
        }
        return Promise.reject(error)
      }

      try {
        const response = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
          refreshToken,
        })

        const resData = response.data.data || response.data
        const accessToken = resData.accessToken || resData.access_token
        localStorage.setItem('accessToken', accessToken)
        api.defaults.headers.common.Authorization = `Bearer ${accessToken}`
        processQueue(null, accessToken)

        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError as Error, null)
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

// ===== API Service Methods (Chuẩn mực RESTful API /api/v1) =====

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/api/v1/auth/login', { email, password }),

  demoLogin: (role: 'student' | 'instructor' | 'admin') =>
    api.post('/api/v1/auth/demo-login', { role }),

  register: (data: { email: string; password: string; fullName: string; role?: string }) =>
    api.post('/api/v1/auth/register', data),

  logout: () => api.post('/api/v1/auth/logout'),

  forgotPassword: (email: string) =>
    api.post('/api/v1/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post('/api/v1/auth/reset-password', { token, newPassword }),

  refreshToken: (refreshToken: string) =>
    api.post('/api/v1/auth/refresh', { refreshToken }),

  getProfile: () => api.get('/api/v1/auth/profile'),
}

// Courses
export const coursesApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/api/v1/courses', { params }),

  getAll: (params?: Record<string, unknown>) =>
    api.get('/api/v1/courses', { params }),

  createCourse: (data: any) =>
    api.post('/api/v1/courses', data),

  // Tải ảnh bìa khóa học lên Cloudinary qua backend (ký phía máy chủ).
  uploadImage: (formData: FormData) =>
    api.post('/api/v1/uploads/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  getBySlug: (slug: string) =>
    api.get(`/api/v1/courses/slug/${encodeURIComponent(slug)}`),

  getCategories: (params?: { status?: 'published' | 'draft' | 'archived' | 'all' }) =>
    api.get('/api/v1/courses/categories', { params }),

  getById: (id: string) =>
    api.get(`/api/v1/courses/id/${id}`),

  enroll: (courseId: string) =>
    api.post(`/api/v1/courses/${courseId}/enroll`),

  getProgress: (courseId: string) =>
    api.get(`/api/v1/courses/${courseId}/progress`),

  markLessonComplete: (courseId: string, lessonId: string, watchedSeconds: number) =>
    api.post(`/api/v1/courses/${courseId}/lessons/${lessonId}/complete`, { watchedSeconds }),

  // Lưu tiến độ xem dở của từng bài (progress.percent_complete trong PostgreSQL).
  saveLessonProgress: (lessonId: string | number, percentComplete: number, lastPosition = 0) =>
    api.put(`/api/v1/progress/lessons/${lessonId}`, {
      percent_complete: Math.max(0, Math.min(100, percentComplete)),
      last_position: Math.max(0, Math.round(lastPosition)),
    }),

  getEnrolled: () =>
    api.get('/api/v1/courses/enrolled'),

  search: (query: string) =>
    api.get('/api/v1/courses/search', { params: { q: query } }),
}

// Instructor
export const instructorApi = {
  createCourse: (data: Record<string, unknown>) =>
    api.post('/api/v1/instructor/courses', data),

  updateCourse: (courseId: string, data: Record<string, unknown>) =>
    api.patch(`/api/v1/instructor/courses/${courseId}`, data),

  deleteCourse: (courseId: string) =>
    api.delete(`/api/v1/instructor/courses/${courseId}`),

  publishCourse: (courseId: string) =>
    api.post(`/api/v1/instructor/courses/${courseId}/publish`),

  getCourses: () =>
    api.get('/api/v1/instructor/courses'),

  getDashboardStats: () =>
    api.get('/api/v1/instructor/dashboard'),

  getQuizzes: () =>
    api.get('/api/v1/instructor/quizzes'),

  deleteQuiz: (courseId: string | number, quizId: string | number) =>
    api.delete(`/api/v1/courses/${courseId}/quizzes/${quizId}`),

  // Danh sách học viên thực tế đã ghi danh vào các khóa học của giảng viên
  getStudents: () =>
    api.get('/api/v1/instructor/students'),

  // Bài nộp & kết quả trắc nghiệm thuộc các khóa học giảng viên phụ trách
  getSubmissions: () =>
    api.get('/api/v1/instructor/submissions'),

  // Chương/bài học & trạng thái học liệu RAG của các khóa học giảng viên phụ trách
  getMaterials: () =>
    api.get('/api/v1/instructor/materials'),

  // Tải PDF/DOCX gắn đúng khóa học/bài học để AI Tutor dùng cho RAG
  uploadLessonDocument: (courseId: string | number, lessonId: string | number, formData: FormData) =>
    api.post(`/api/v1/courses/${courseId}/lessons/${lessonId}/documents/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  uploadImage: (formData: FormData) =>
    api.post('/api/v1/uploads/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
}

// AI Chat
// Trợ lý AI chỉ có một endpoint streaming thật: POST /api/v1/ai-tutor/chat (SSE),
// được gọi trong `lib/hooks/useAIChat.ts` vì phải đọc stream bằng ReadableStream.
// Trước đây file này còn khai báo các route `/api/v1/ai/sessions*` không tồn tại ở
// backend nên đã được bỏ để không ai gọi nhầm.

// Student
export const studentApi = {
  getDashboardStats: () =>
    api.get('/api/v1/student/dashboard'),

  getMastery: () =>
    api.get('/api/v1/student/mastery'),

  // Tổng hợp 1 request: thay cho vòng lặp enrollments -> quizzes -> submissions
  getQuizzes: () =>
    api.get('/api/v1/student/quizzes'),

  getResults: () =>
    api.get('/api/v1/student/results'),

  getNotifications: () =>
    api.get('/api/v1/student/notifications'),

  getCertificate: (courseId: string) =>
    api.get(`/api/v1/student/certificates/${courseId}`),
}

export const quizApi = {
  listByCourse: (courseId: string | number) =>
    api.get(`/api/v1/courses/${courseId}/quizzes`),

  get: (quizId: string | number) =>
    api.get(`/api/v1/quizzes/${quizId}`),

  submit: (quizId: string | number, answers: Record<string | number, string>, timeSpent: number) =>
    api.post(`/api/v1/quizzes/${quizId}/submit`, {
      answers,
      time_spent: timeSpent,
    }),

  getSubmissions: (quizId: string | number) =>
    api.get(`/api/v1/quizzes/${quizId}/submissions`),
}

// YouTube Import (admin/giảng viên)
export const youtubeApi = {
  getStatus: () =>
    api.get('/api/v1/youtube/status'),

  analyze: (url: string) =>
    api.post('/api/v1/youtube/analyze', { url }),

  importVideo: (courseId: string | number, videoId: string) =>
    api.post('/api/v1/youtube/import', {
      course_id: Number(courseId),
      video_id: videoId,
    }),

  getCourseLessons: (courseId: string | number) =>
    api.get(`/api/v1/youtube/courses/${courseId}/lessons`),

  fetchSubtitle: (lessonId: string | number) =>
    api.post(`/api/v1/youtube/lessons/${lessonId}/subtitle/fetch`),

  uploadSubtitle: (lessonId: string | number, formData: FormData) =>
    api.post(`/api/v1/youtube/lessons/${lessonId}/subtitle/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    }),

  reingestSubtitle: (lessonId: string | number) =>
    api.post(`/api/v1/youtube/lessons/${lessonId}/subtitle/reingest`),
}

// Public (không cần xác thực)
export const publicApi = {
  getStats: () =>
    api.get('/api/v1/public/stats'),
}

// Admin
export const adminApi = {
  getStats: () =>
    api.get('/api/v1/admin/stats'),

  getAIMonitoring: () =>
    api.get('/api/v1/admin/ai-monitoring'),

  getUsers: (params?: { role?: string; search?: string }) =>
    api.get('/api/v1/admin/users', { params }),

  toggleUserStatus: (userId: string | number) =>
    api.patch(`/api/v1/admin/users/${userId}/status`),

  changeUserRole: (userId: string | number, newRole: string) =>
    api.patch(`/api/v1/admin/users/${userId}/role`, null, { params: { new_role: newRole } }),

  getCourses: () =>
    api.get('/api/v1/admin/courses'),

  changeCourseStatus: (courseId: string | number, newStatus: 'draft' | 'published' | 'archived') =>
    api.patch(`/api/v1/admin/courses/${courseId}/status`, null, { params: { new_status: newStatus } }),
}

// Danh mục Lĩnh vực & Môn học (Master Spec Section III)
export const categoriesApi = {
  getTree: (includeInactive = false) =>
    api.get('/api/v1/categories', { params: { include_inactive: includeInactive } }),

  create: (data: { name: string; slug?: string; description?: string; icon?: string; parent_id?: number | null; order_index?: number; is_active?: boolean }) =>
    api.post('/api/v1/admin/categories', data),

  update: (id: number | string, data: Record<string, unknown>) =>
    api.put(`/api/v1/admin/categories/${id}`, data),

  delete: (id: number | string) =>
    api.delete(`/api/v1/admin/categories/${id}`),
}

// Cấp học & Trình độ Đào tạo
export const educationLevelsApi = {
  getAll: (includeInactive = false) =>
    api.get('/api/v1/education-levels', { params: { include_inactive: includeInactive } }),

  create: (data: { name: string; code: string; description?: string; order_index?: number; is_active?: boolean }) =>
    api.post('/api/v1/admin/education-levels', data),

  update: (id: number | string, data: Record<string, unknown>) =>
    api.put(`/api/v1/admin/education-levels/${id}`, data),
}

// AI Discovery Service (Master Spec Section Bổ sung)
export const aiDiscoveryApi = {
  discover: (data: { topic: string; target_level?: string; domain_category?: string; target_audience?: string }) =>
    api.post('/api/v1/ai-discovery/discover', data),

  getJobs: () =>
    api.get('/api/v1/ai-discovery/jobs'),

  getJob: (id: number | string) =>
    api.get(`/api/v1/ai-discovery/jobs/${id}`),

  approve: (id: number | string) =>
    api.post(`/api/v1/ai-discovery/jobs/${id}/approve`),

  convertToCourse: (id: number | string, data?: { title?: string; price?: number; auto_publish?: boolean }) =>
    api.post(`/api/v1/ai-discovery/jobs/${id}/convert-to-course`, data || {}),
}

export default api
