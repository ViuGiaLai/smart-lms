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

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
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

  refreshToken: (refreshToken: string) =>
    api.post('/api/v1/auth/refresh', { refreshToken }),

  getProfile: () => api.get('/api/v1/auth/profile'),

  updateProfile: (data: FormData) =>
    api.patch('/api/v1/auth/profile', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
}

// Courses
export const coursesApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/api/v1/courses', { params }),

  getAll: (params?: Record<string, unknown>) =>
    api.get('/api/v1/courses', { params }),

  createCourse: (data: any) =>
    api.post('/api/v1/courses', data),

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

  createSection: (courseId: string, data: { title: string; order: number }) =>
    api.post(`/api/v1/instructor/courses/${courseId}/sections`, data),

  createLesson: (courseId: string, sectionId: string, data: Record<string, unknown>) =>
    api.post(`/api/v1/instructor/courses/${courseId}/sections/${sectionId}/lessons`, data),

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
}

// AI Chat
export const aiApi = {
  getSessions: (courseId: string) =>
    api.get(`/api/v1/ai/sessions`, { params: { courseId } }),

  getSession: (sessionId: string) =>
    api.get(`/api/v1/ai/sessions/${sessionId}`),

  createSession: (data: { courseId: string; lessonId?: string }) =>
    api.post('/api/v1/ai/sessions', data),

  // SSE streaming - returns URL for EventSource
  getStreamUrl: (sessionId: string) =>
    `${API_BASE_URL}/api/v1/ai/sessions/${sessionId}/stream`,

  sendMessage: (sessionId: string, data: { message: string; lessonId?: string }) =>
    api.post(`/api/v1/ai/sessions/${sessionId}/messages`, data),
}

// Student
export const studentApi = {
  getDashboardStats: () =>
    api.get('/api/v1/student/dashboard'),

  getNotifications: () =>
    api.get('/api/v1/student/notifications'),

  markNotificationRead: (notificationId: string) =>
    api.patch(`/api/v1/student/notifications/${notificationId}/read`),

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

export default api
