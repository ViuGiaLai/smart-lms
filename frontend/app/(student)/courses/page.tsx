'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useCourses } from '@/lib/hooks/useCourse'
import { coursesApi, categoriesApi, educationLevelsApi } from '@/lib/api'
import { CourseListItem, CourseFilters, LearningCategoryItem, EducationLevelItem } from '@/types'
import { Search, Filter, Star, Clock, Users, BookOpen, ChevronDown, Sparkles, Layers, GraduationCap, Globe, Cpu, TrendingUp, HeartHandshake } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

const SORT_OPTIONS = [
  { value: 'popularity', label: 'Phổ biến nhất' },
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price', label: 'Học phí: Thấp đến Cao' },
]

const AUDIENCES = [
  { value: 'All', label: 'Tất cả sinh viên' },
  { value: 'Sinh viên năm 1 - 2', label: 'Sinh viên năm 1 - 2 (Đại cương)' },
  { value: 'Sinh viên năm 3 - 4', label: 'Sinh viên năm 3 - 4 (Chuyên ngành)' },
  { value: 'Sinh viên làm đồ án', label: 'Sinh viên làm đồ án tốt nghiệp' },
  { value: 'Giảng viên & Nghiên cứu sinh', label: 'Giảng viên & Nghiên cứu sinh' },
]

const levelBadgeVariant = {
  beginner: 'success',
  intermediate: 'warning',
  advanced: 'destructive',
} as const

function CourseCard({
  course,
  enrolled = false,
}: {
  course: CourseListItem
  enrolled?: boolean
}) {
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
      : course.level === 'advanced'
      ? 'Nâng cao'
      : 'Đa trình độ'

  return (
    <Link href={`/courses/${course.slug || course.id}`} className="group h-full">
      <Card className="h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md border border-stone-200">
        <div className="relative h-44 overflow-hidden bg-muted">
          <Image
            src={course.thumbnail || 'https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/nextjs-ui.jpg'}
            alt={course.title}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5 max-w-[80%]">
            <Badge variant={levelBadgeVariant[course.level as keyof typeof levelBadgeVariant] ?? 'secondary'} className="text-[11px] font-semibold shadow-xs">
              {course.gradeLabel || levelLabel}
            </Badge>
            {course.educationLevelName && (
              <Badge variant="outline" className="bg-white/90 text-stone-800 text-[10px] font-medium backdrop-blur-xs shadow-xs">
                {course.educationLevelName}
              </Badge>
            )}
          </div>
          {(course.isEnrolled || enrolled) && (
            <div className="absolute right-3 top-3">
              <Badge variant="default" className="text-xs font-semibold shadow">
                Đang học
              </Badge>
            </div>
          )}
        </div>

        <CardContent className="flex flex-1 flex-col justify-between p-5">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-brand-600">
              <span className="truncate">{course.categoryName || course.category?.name || 'Đa lĩnh vực'}</span>
              {course.targetAudience && (
                <span className="text-[10px] text-stone-400 font-normal">{course.targetAudience}</span>
              )}
            </div>
            <h3 className="mb-2 line-clamp-2 text-base font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
              {course.title}
            </h3>
            <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {course.shortDescription || course.description}
            </p>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-3 border-t border-border pt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-muted-foreground/70" />
                {formatDuration(course.duration || 3600)}
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground/70" />
                {course.totalLessons ?? 0} bài học
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-muted-foreground/70" />
                {course.totalStudents ? course.totalStudents.toLocaleString() : '0'} học viên
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="text-base font-bold text-foreground">
                  {course.price === 0 ? 'Miễn phí' : `${Number(course.price).toLocaleString('vi-VN')} đ`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="max-w-[160px] truncate text-xs font-medium text-foreground/70" title={course.instructor?.fullName || 'Giảng viên'}>
                  {course.instructor?.fullName || 'Giảng viên'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
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
  const [selectedCategory, setSelectedCategory] = useState<number | 'All'>('All')
  const [selectedLevelId, setSelectedLevelId] = useState<number | 'All'>('All')
  const [selectedAudience, setSelectedAudience] = useState<string>('All')

  const [categories, setCategories] = useState<LearningCategoryItem[]>([])
  const [educationLevels, setEducationLevels] = useState<EducationLevelItem[]>([])

  useEffect(() => {
    // Tải danh mục động & cấp học từ API
    categoriesApi.getTree().then((res) => {
      const tree = res.data?.data?.tree || []
      setCategories(tree)
    }).catch(() => {})

    educationLevelsApi.getAll().then((res) => {
      const lvls = res.data?.data || []
      setEducationLevels(lvls)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    // Nhận bộ lọc từ URL để link sâu từ trang chủ hoạt động: /courses?category_id=…
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const categoryId = Number(params.get('category_id'))
    if (Number.isFinite(categoryId) && categoryId > 0) setSelectedCategory(categoryId)
    const levelId = Number(params.get('education_level_id'))
    if (Number.isFinite(levelId) && levelId > 0) setSelectedLevelId(levelId)
    const keyword = params.get('search')
    if (keyword) setSearch(keyword)
  }, [])

  const { data, isLoading, error } = useCourses({
    ...filters,
    search: search || undefined,
    category_id: selectedCategory !== 'All' ? selectedCategory : undefined,
    education_level_id: selectedLevelId !== 'All' ? selectedLevelId : undefined,
    target_audience: selectedAudience !== 'All' ? selectedAudience : undefined,
  })

  const courses: CourseListItem[] = data?.data ?? []
  const total: number = data?.total ?? courses.length

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setFilters((prev) => ({ ...prev, page: 1 }))
  }

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('currentUser');
      if (stored) setCurrentUser(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'student') {
      setEnrolledIds(new Set());
      return;
    }
    let active = true;
    coursesApi
      .getEnrolled()
      .then((res) => {
        if (!active) return;
        const ids = (res.data?.data || []).map((item: any) =>
          String(item.courseId ?? item.course?.id ?? '')
        );
        setEnrolledIds(new Set(ids));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [currentUser]);

  const pageSize = filters.limit ?? 12;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = filters.page ?? 1;

  return (
    <div className="pb-28 md:pb-12 font-sans">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200">
              <Sparkles className="w-3.5 h-3.5 text-brand-600" /> Nền tảng Đa lĩnh vực & Đa trình độ
            </span>
          </div>
          <h1 className="mb-2 text-3xl font-bold text-foreground tracking-tight">Khám phá Khóa học Trực tuyến</h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Học tập đa ngành từ Phổ thông, Ngoại ngữ, Công nghệ đến Kỹ năng sống. Mỗi khóa học đều tích hợp Trợ lý Gia sư AI Socratic hỗ trợ hiểu sâu bản chất 24/7.
          </p>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="mt-6 flex max-w-3xl gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm khóa học, môn học (Toán, Tiếng Anh, Python, Kỹ năng...), hoặc giảng viên..."
                className="h-11 pl-11 text-sm bg-white"
              />
            </div>
            <Button type="submit" size="default" className="text-sm font-semibold h-11 px-6">
              Tìm kiếm
            </Button>
          </form>

          {/* Category Tabs */}
          <div className="mt-6 flex flex-wrap items-center gap-2 pt-2 border-t border-stone-200/60">
            <button
              type="button"
              onClick={() => { setSelectedCategory('All'); setFilters(p => ({ ...p, page: 1 })); }}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer',
                selectedCategory === 'All'
                  ? 'bg-stone-900 text-white shadow-xs font-semibold'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              )}
            >
              Tất cả lĩnh vực
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { setSelectedCategory(cat.id); setFilters(p => ({ ...p, page: 1 })); }}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer',
                  selectedCategory === cat.id
                    ? 'bg-brand-600 text-white shadow-xs font-semibold'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Sub-Filters: Cấp học, Đối tượng, Sắp xếp */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs">
          <div className="flex flex-wrap items-center gap-4">
            {/* Cấp học / Education Level */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-stone-600 flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5 text-stone-500" /> Cấp học:
              </span>
              <select
                value={selectedLevelId}
                onChange={(e) => {
                  const val = e.target.value === 'All' ? 'All' : Number(e.target.value);
                  setSelectedLevelId(val);
                  setFilters(p => ({ ...p, page: 1 }));
                }}
                className="cursor-pointer appearance-none rounded-lg border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-2xs outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="All">Tất cả cấp học</option>
                {educationLevels.map((lvl) => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.name} ({lvl.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Đối tượng / Target Audience */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-stone-600 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-stone-500" /> Đối tượng:
              </span>
              <select
                value={selectedAudience}
                onChange={(e) => {
                  setSelectedAudience(e.target.value);
                  setFilters(p => ({ ...p, page: 1 }));
                }}
                className="cursor-pointer appearance-none rounded-lg border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-2xs outline-none focus:ring-1 focus:ring-brand-500"
              >
                {AUDIENCES.map((aud) => (
                  <option key={aud.value} value={aud.value}>
                    {aud.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sắp xếp */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Sắp xếp:</span>
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
                className="cursor-pointer appearance-none rounded-lg border border-input bg-background px-3 py-1 pr-7 text-xs font-medium text-foreground shadow-2xs outline-none focus:ring-1 focus:ring-brand-500"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Results */}
        {error ? (
          <ErrorState
            message="Không thể nạp dữ liệu khóa học. Vui lòng thử lại sau."
          />
        ) : isLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden p-4">
                <Skeleton className="h-40 w-full rounded-lg" />
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-5 w-5/6" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </Card>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-8 w-8 text-stone-400" />}
            title="Không tìm thấy khóa học phù hợp"
            description="Hãy thử chọn danh mục hoặc cấp học khác, hoặc thay đổi từ khóa tìm kiếm."
            className="py-16"
          />
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Đang hiển thị {courses.length} khóa học ({total} kết quả)</span>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  enrolled={enrolledIds.has(String(course.id))}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <nav
                aria-label="Phân trang khóa học"
                className="mt-8 flex items-center justify-center gap-2"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setFilters((prev) => ({ ...prev, page: currentPage - 1 }))}
                >
                  Trang trước
                </Button>
                <span className="px-2 text-xs font-semibold text-muted-foreground">
                  Trang {currentPage}/{totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setFilters((prev) => ({ ...prev, page: currentPage + 1 }))}
                >
                  Trang sau
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  )
}
