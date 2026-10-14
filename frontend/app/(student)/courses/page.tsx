'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useCourses } from '@/lib/hooks/useCourse'
import { CourseListItem, CourseFilters } from '@/types'
import { Search, Filter, Star, Clock, Users, BookOpen, ChevronDown, GraduationCap } from 'lucide-react'

const LEVELS = [
  { value: 'All', label: 'Tất cả cấp độ' },
  { value: 'beginner', label: 'Cơ bản' },
  { value: 'intermediate', label: 'Trung cấp' },
  { value: 'advanced', label: 'Nâng cao' },
] as const

const SORT_OPTIONS = [
  { value: 'popularity', label: 'Phổ biến nhất' },
  { value: 'rating', label: 'Đánh giá cao nhất' },
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price', label: 'Học phí: Thấp đến Cao' },
]

function CourseCard({ course }: { course: CourseListItem }) {
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours > 0 ? `${hours}h ${minutes}p` : `${minutes}p`
  }

  const levelLabel =
    course.level === 'beginner'
      ? 'Cơ bản'
      : course.level === 'intermediate'
      ? 'Trung cấp'
      : 'Nâng cao'

  return (
    <Link href={`/courses/${course.id || course.slug}`} className="group">
      <div className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 flex flex-col h-full">
        <div className="relative h-44 overflow-hidden bg-slate-100">
          <Image
            src={course.thumbnail || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&fit=crop'}
            alt={course.title}
            fill
            unoptimized
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute top-3 left-3">
            <span
              className={`px-2.5 py-1 rounded-md text-xs font-semibold shadow-sm ${
                course.level === 'beginner'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : course.level === 'intermediate'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-rose-100 text-rose-800 border border-rose-200'
              }`}
            >
              {levelLabel}
            </span>
          </div>
          {course.isEnrolled && (
            <div className="absolute top-3 right-3 bg-indigo-600 text-white text-xs font-semibold px-2.5 py-1 rounded-md shadow">
              Đang học
            </div>
          )}
        </div>

        <div className="p-5 flex flex-col flex-1 justify-between">
          <div>
            <div className="text-xs text-indigo-600 font-semibold mb-1">
              {course.category?.name || 'Công nghệ Thông tin'}
            </div>
            <h3 className="font-bold text-slate-900 mb-2 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors text-base">
              {course.title}
            </h3>
            <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">
              {course.shortDescription}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              {course.rating ? (
                <>
                  <span className="text-sm font-bold text-amber-600">
                    {course.rating.toFixed(1)}
                  </span>
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${
                          i < Math.round(course.rating || 0)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">
                    ({course.totalReviews ? course.totalReviews.toLocaleString() : '0'})
                  </span>
                </>
              ) : (
                <span className="text-xs text-slate-400">Chưa có đánh giá</span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500 mb-4 pt-2 border-t border-slate-100">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                {formatDuration(course.duration || 3600)}
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5 text-slate-400" />
                {course.totalLessons ?? 0} bài học
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                {course.totalStudents ? course.totalStudents.toLocaleString() : '0'} học viên
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="font-extrabold text-slate-900 text-base">
                  {course.price === 0 ? 'Miễn phí' : `${Number(course.price).toLocaleString('vi-VN')} đ`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-600 truncate max-w-[160px]" title={course.instructor?.fullName || 'Giảng viên'}>
                  {course.instructor?.fullName || 'Giảng viên'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function CoursesPage() {
  const [filters, setFilters] = useState<CourseFilters>({
    page: 1,
    limit: 12,
    sortBy: 'popularity',
  })
  const [search, setSearch] = useState('')
  const [selectedLevel, setSelectedLevel] = useState<string>('All')

  const { data, isLoading, error } = useCourses({
    ...filters,
    search: search || undefined,
    level:
      selectedLevel !== 'All'
        ? (selectedLevel as CourseFilters['level'])
        : undefined,
  })

  const courses: CourseListItem[] = data?.data ?? []
  const total: number = data?.total ?? courses.length

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setFilters((prev) => ({ ...prev, page: 1 }))
  }

  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('currentUser');
      if (stored) setCurrentUser(JSON.parse(stored));
    } catch {}
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 pb-28 md:pb-12">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Danh mục Khóa học Trực tuyến</h1>
          <p className="text-slate-500 text-sm">
            Khám phá các khóa học công nghệ chất lượng cao có tích hợp Trợ lý Gia sư ảo AI 24/7
          </p>

          {/* Search */}
          <form onSubmit={handleSearch} className="mt-6 flex gap-3 max-w-3xl">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kiếm khóa học theo tên, công nghệ hoặc giảng viên..."
                className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <button
              type="submit"
              className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition shadow-sm text-sm"
            >
              Tìm kiếm
            </button>
          </form>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">


        {/* Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          {/* Level Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-slate-400 mr-1" />
            {LEVELS.map((level) => (
              <button
                key={level.value}
                onClick={() => setSelectedLevel(level.value)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedLevel === level.value
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'
                }`}
              >
                {level.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Sắp xếp:</span>
            <div className="relative">
              <select
                value={filters.sortBy}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    sortBy: e.target.value as CourseFilters['sortBy'],
                    page: 1,
                  }))
                }
                className="appearance-none bg-white border border-slate-200 rounded-lg px-3 py-1.5 pr-8 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium text-slate-700"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Results */}
        {error ? (
          <div className="text-center py-12">
            <p className="text-rose-500 text-sm">Không thể nạp dữ liệu khóa học. Vui lòng thử lại sau.</p>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden p-4 space-y-3 animate-pulse border border-slate-200">
                <div className="h-40 bg-slate-200 rounded-xl" />
                <div className="h-4 bg-slate-200 rounded w-1/3" />
                <div className="h-5 bg-slate-200 rounded w-5/6" />
                <div className="h-4 bg-slate-100 rounded w-full" />
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8">
            <BookOpen className="h-14 w-14 text-slate-300 mx-auto mb-3" />
            <p className="text-lg font-bold text-slate-700">Không tìm thấy khóa học phù hợp</p>
            <p className="text-xs text-slate-400 mt-1">Vui lòng điều chỉnh lại từ khóa hoặc bộ lọc tìm kiếm.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-5 font-medium">
              Đang hiển thị {courses.length} khóa học đào tạo trực tuyến
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
