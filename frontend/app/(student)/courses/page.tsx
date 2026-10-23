'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useCourses } from '@/lib/hooks/useCourse'
import { CourseListItem, CourseFilters } from '@/types'
import { Search, Filter, Star, Clock, Users, BookOpen, ChevronDown } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

const LEVELS = [
  { value: 'All', label: 'Tất cả cấp độ' },
  { value: 'beginner', label: 'Cơ bản' },
  { value: 'intermediate', label: 'Trung cấp' },
  { value: 'advanced', label: 'Nâng cao' },
] as const

const SORT_OPTIONS = [
  { value: 'popularity', label: 'Mặc định' },
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price', label: 'Học phí: Thấp đến Cao' },
]

const levelBadgeVariant = {
  beginner: 'success',
  intermediate: 'warning',
  advanced: 'destructive',
} as const

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
      : course.level === 'advanced'
      ? 'Nâng cao'
      : 'Chưa phân loại'

  return (
    <Link href={`/courses/${course.slug || course.id}`} className="group h-full">
      <Card className="h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
        <div className="relative h-44 overflow-hidden bg-muted">
          <Image
            src={course.thumbnail || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&fit=crop'}
            alt={course.title}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute left-3 top-3">
            <Badge variant={levelBadgeVariant[course.level as keyof typeof levelBadgeVariant] ?? 'secondary'} className="text-xs font-semibold shadow-sm">
              {levelLabel}
            </Badge>
          </div>
          {course.isEnrolled && (
            <div className="absolute right-3 top-3">
              <Badge variant="default" className="text-xs font-semibold shadow">
                Đang học
              </Badge>
            </div>
          )}
        </div>

        <CardContent className="flex flex-1 flex-col justify-between p-5">
          <div>
            <div className="mb-1 text-xs font-semibold text-primary">
              {course.category?.name || 'Chưa phân loại'}
            </div>
            <h3 className="mb-2 line-clamp-2 text-base font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
              {course.title}
            </h3>
            <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {course.shortDescription}
            </p>
          </div>

          <div>
            <div className="mb-2.5 flex items-center gap-1.5">
              {course.rating ? (
                <>
                  <span className="text-sm font-bold text-amber-600">
                    {course.rating.toFixed(1)}
                  </span>
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          'h-3.5 w-3.5',
                          i < Math.round(course.rating || 0)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-muted-foreground/30'
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground/70">
                    ({course.totalReviews ? course.totalReviews.toLocaleString() : '0'})
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground/70">Chưa có đánh giá</span>
              )}
            </div>

            <div className="mb-4 flex items-center gap-3 border-t border-border pt-2 text-xs text-muted-foreground">
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
                <span className="text-base font-extrabold text-foreground">
                  {course.price === 0 ? 'Miễn phí' : `${Number(course.price).toLocaleString('vi-VN')} đ`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="max-w-[160px] truncate text-xs font-medium text-foreground/70" title={course.instructor?.fullName || 'Chưa cập nhật'}>
                  {course.instructor?.fullName || 'Chưa cập nhật'}
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
    const params = new URLSearchParams(window.location.search);
    const querySearch = params.get('search') || '';
    const queryCategory = params.get('category') || '';
    setSearch(querySearch);
    setFilters((prev) => ({
      ...prev,
      category: queryCategory || undefined,
      page: 1,
    }));
    try {
      const stored = localStorage.getItem('currentUser');
      if (stored) setCurrentUser(JSON.parse(stored));
    } catch {}
  }, []);

  return (
    <div className="pb-28 md:pb-12">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <h1 className="mb-2 text-3xl font-extrabold text-foreground">Danh mục Khóa học Trực tuyến</h1>
          <p className="text-sm text-muted-foreground">
            Khám phá các khóa học công nghệ chất lượng cao có tích hợp Trợ lý Gia sư ảo AI 24/7
          </p>

          {/* Search */}
          <form onSubmit={handleSearch} className="mt-6 flex max-w-3xl gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kiếm khóa học theo tên, công nghệ hoặc giảng viên..."
                className="h-12 pl-12 text-sm"
              />
            </div>
            <Button type="submit" size="default" className="text-sm font-semibold">
              Tìm kiếm
            </Button>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8">

        {/* Filters Bar */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          {/* Level Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="mr-1 h-4 w-4 text-muted-foreground" />
            {LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => setSelectedLevel(level.value)}
                className={cn(
                  buttonVariants({ variant: selectedLevel === level.value ? 'default' : 'outline' }),
                  'px-3.5 py-1.5 text-xs font-semibold',
                  selectedLevel !== level.value && 'bg-background text-muted-foreground hover:text-foreground'
                )}
              >
                {level.label}
              </button>
            ))}
          </div>

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
                className="cursor-pointer appearance-none rounded-lg border border-input bg-background px-3 py-1.5 pr-8 text-xs font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
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
                <Skeleton className="h-40 w-full rounded-xl" />
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
            icon={<BookOpen className="h-8 w-8" />}
            title="Không tìm thấy khóa học phù hợp"
            description="Vui lòng điều chỉnh lại từ khóa hoặc bộ lọc tìm kiếm."
            className="py-16"
          />
        ) : (
          <>
            <p className="mb-5 text-xs font-medium text-muted-foreground">
              Đang hiển thị {courses.length} khóa học đào tạo trực tuyến (tổng {total})
            </p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
