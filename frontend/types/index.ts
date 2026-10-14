// TypeScript types and interfaces for Smart LMS

// ===== User & Auth =====
export interface User {
  id: string
  email: string
  fullName: string
  avatar?: string
  role: 'student' | 'instructor' | 'admin'
  createdAt: string
  updatedAt: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
  fullName: string
  role?: 'student' | 'instructor'
}

// ===== Course =====
export interface Category {
  id: string
  name: string
  slug: string
  icon?: string
}

export interface Instructor {
  id: string
  fullName: string
  avatar?: string
  bio?: string
  rating: number
  totalStudents: number
  totalCourses: number
}

export interface Lesson {
  id: string
  title: string
  description?: string
  videoUrl?: string
  videoDuration: number // in seconds
  order: number
  isFree: boolean
  isCompleted?: boolean
  resources?: LessonResource[]
}

export interface LessonResource {
  id: string
  title: string
  type: 'pdf' | 'link' | 'file'
  url: string
}

export interface Section {
  id: string
  title: string
  order: number
  lessons: Lesson[]
}

export interface Course {
  id: string
  title: string
  slug: string
  description: string
  shortDescription: string
  thumbnail: string
  previewVideo?: string
  price: number
  discountPrice?: number
  currency: string
  level: 'beginner' | 'intermediate' | 'advanced'
  language: string
  duration: number // total seconds
  totalLessons: number
  totalStudents: number
  rating: number
  totalReviews: number
  instructor: Instructor
  category: Category
  tags: string[]
  sections: Section[]
  whatYouLearn: string[]
  requirements: string[]
  isPublished: boolean
  isEnrolled?: boolean
  progress?: number // 0-100
  createdAt: string
  updatedAt: string
}

export interface CourseListItem {
  id: string
  title: string
  slug: string
  description?: string
  shortDescription?: string
  thumbnail: string
  price: number
  discountPrice?: number
  currency?: string
  level: 'beginner' | 'intermediate' | 'advanced'
  duration: number
  totalLessons: number
  totalStudents?: number
  rating?: number
  totalReviews?: number
  instructor: Pick<Instructor, 'id' | 'fullName' | 'avatar'>
  category: Category
  isEnrolled?: boolean
  progress?: number
}

// ===== Enrollment =====
export interface Enrollment {
  id: string
  userId: string
  courseId: string
  course: CourseListItem
  enrolledAt?: string
  completedAt?: string
  progress: number
  completedLessons?: number
  totalLessons?: number
  lastAccessedAt?: string
  certificateUrl?: string
}

// ===== Progress =====
export interface LessonProgress {
  lessonId: string
  isCompleted: boolean
  watchedSeconds: number
  completedAt?: string
}

export interface CourseProgress {
  courseId: string
  completedLessons: string[]
  totalLessons: number
  percentage: number
  lastLessonId?: string
}

// ===== AI Chat =====
export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: string
  isStreaming?: boolean
  metadata?: {
    lessonId?: string
    courseId?: string
    sources?: string[]
  }
}

export interface ChatSession {
  id: string
  courseId: string
  lessonId?: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export interface SendMessagePayload {
  message: string
  courseId: string
  lessonId?: string
  sessionId?: string
  context?: string
}

// ===== Review =====
export interface Review {
  id: string
  userId: string
  user: Pick<User, 'id' | 'fullName' | 'avatar'>
  courseId: string
  rating: number
  comment: string
  createdAt: string
}

// ===== API Response Wrappers =====
export interface ApiResponse<T> {
  data: T
  message: string
  success: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ApiError {
  message: string
  statusCode: number
  errors?: Record<string, string[]>
}

// ===== Course Creation =====
export interface CreateCourseData {
  title: string
  shortDescription: string
  description: string
  categoryId: string
  level: 'beginner' | 'intermediate' | 'advanced'
  language: string
  price: number
  discountPrice?: number
  currency: string
  tags: string[]
  whatYouLearn: string[]
  requirements: string[]
}

export interface CreateLessonData {
  title: string
  description?: string
  order: number
  isFree: boolean
  videoFile?: File
}

export interface CreateSectionData {
  title: string
  order: number
}

// ===== Dashboard =====
export interface StudentDashboardStats {
  totalEnrolled: number
  totalCompleted: number
  totalInProgress: number
  totalWatchTime: number // seconds
  currentStreak: number
  longestStreak: number
}

export interface InstructorDashboardStats {
  totalCourses: number
  totalStudents: number
  totalRevenue: number
  averageRating: number
  totalReviews: number
  monthlyRevenue: MonthlyRevenue[]
}

export interface MonthlyRevenue {
  month: string
  revenue: number
  students: number
}

// ===== Notification =====
export interface Notification {
  id: string
  type: 'enrollment' | 'review' | 'completion' | 'announcement'
  title: string
  message: string
  isRead: boolean
  createdAt: string
  link?: string
}

// ===== Utility Types =====
export type SortOrder = 'asc' | 'desc'

export interface CourseFilters {
  search?: string
  categoryId?: string
  level?: Course['level']
  minPrice?: number
  maxPrice?: number
  minRating?: number
  language?: string
  sortBy?: 'popularity' | 'rating' | 'newest' | 'price'
  sortOrder?: SortOrder
  page?: number
  limit?: number
}
