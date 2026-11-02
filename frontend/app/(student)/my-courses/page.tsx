'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Play,
  RefreshCw,
  Search,
  TrendingUp,
} from 'lucide-react';
import { coursesApi } from '@/lib/api';
import { Enrollment } from '@/types';
import { useAuth } from '@/lib/auth-context';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/course/ProgressBar';
import { PageSkeleton } from '@/components/ui/page-skeleton';

export default function MyCoursesPage() {
  const { isAuthorized } = useRoleGuard(['student']);
  const { isLoading: authLoading } = useAuth();
  const [items, setItems] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadCourses = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await coursesApi.getEnrolled();
      setItems(response.data?.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Không thể tải danh sách khóa học đã đăng ký.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized && !authLoading) void loadCourses();
  }, [authLoading, isAuthorized]);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        // Khóa đang học dở lên trước, đã xong xuống cuối, cùng nhóm thì tiến độ cao trước.
        const rank = (value: number) => (value >= 100 ? 2 : value > 0 ? 0 : 1);
        const diff = rank(a.progress || 0) - rank(b.progress || 0);
        return diff !== 0 ? diff : (b.progress || 0) - (a.progress || 0);
      }),
    [items],
  );

  const visibleItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return sortedItems;
    return sortedItems.filter((item) =>
      `${item.course?.title || ''} ${item.course?.category?.name || ''}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [sortedItems, search]);

  const summary = useMemo(() => {
    const completed = items.filter((item) => (item.progress || 0) >= 100).length;
    const inProgress = items.filter(
      (item) => (item.progress || 0) > 0 && (item.progress || 0) < 100,
    ).length;
    const average =
      items.length > 0
        ? Math.round(items.reduce((acc, item) => acc + (item.progress || 0), 0) / items.length)
        : 0;
    return { completed, inProgress, average };
  }, [items]);

  if (!isAuthorized || authLoading) {
    return <PageSkeleton />;
  }

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Khóa học của tôi"
          description="Các khóa học bạn đã ghi danh, tiến độ thực tế và chứng chỉ hoàn thành khóa học."
          actions={[
            { label: 'Khám phá khóa học', icon: <Search className="h-3.5 w-3.5" />, href: '/courses' },
            {
              label: 'Làm mới',
              icon: <RefreshCw className="h-3.5 w-3.5" />,
              onClick: () => void loadCourses(),
            },
          ]}
        />

        {loading && (
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-3 h-3 w-1/2" />
                <Skeleton className="mt-3 h-2 w-full rounded-full" />
                <Skeleton className="mt-4 h-8 w-28" />
              </Card>
            ))}
          </div>
        )}

        {!loading && error && (
          <ErrorState message={error} actionLabel="Thử lại" onAction={() => void loadCourses()} />
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="Bạn chưa có khóa học nào"
            description="Ghi danh một khóa học để bắt đầu xem bài giảng, hỏi đáp cùng Trợ lý AI và làm bài kiểm tra."
          >
            <Button asChild size="sm" className="mt-1">
              <Link href="/courses">Khám phá khóa học</Link>
            </Button>
          </EmptyState>
        )}

        {!loading && !error && items.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon={BookOpen} label="Đã ghi danh" value={`${items.length} khóa`} accent="primary" />
              <StatCard icon={TrendingUp} label="Đang học dở" value={`${summary.inProgress} khóa`} accent="violet" />
              <StatCard icon={CheckCircle2} label="Đã hoàn thành" value={`${summary.completed} khóa`} accent="emerald" />
              <StatCard icon={GraduationCap} label="Tiến độ trung bình" value={`${summary.average}%`} accent="amber" />
            </div>

            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm khóa học của bạn..."
                className="h-9 pl-9 text-xs"
                aria-label="Tìm khóa học của tôi"
              />
            </div>

            {visibleItems.length === 0 ? (
              <EmptyState
                icon={<Search className="h-6 w-6" />}
                title="Không tìm thấy khóa học phù hợp"
                description="Thử một từ khóa khác trong danh sách khóa học của bạn."
              >
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-1"
                  onClick={() => setSearch('')}
                >
                  Xóa tìm kiếm
                </Button>
              </EmptyState>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {visibleItems.map((item) => {
                  const progress = Math.min(100, item.progress || 0);
                  const isCompleted = progress >= 100;
                  const totalLessons = item.totalLessons || 0;
                  const completedLessons = item.completedLessons || 0;
                  return (
                    <Card key={item.id} className="flex flex-col">
                      <CardContent className="flex flex-1 flex-col p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="line-clamp-2 font-bold text-foreground">
                              {item.course?.title || `Khóa học #${item.courseId}`}
                            </h2>
                            {item.course?.category?.name && (
                              <p className="mt-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {item.course.category.name}
                              </p>
                            )}
                          </div>
                          <Badge variant={isCompleted ? 'success' : progress > 0 ? 'info' : 'secondary'} className="shrink-0">
                            {isCompleted ? (
                              <>
                                <CheckCircle2 className="h-3 w-3" />
                                Hoàn thành
                              </>
                            ) : progress > 0 ? (
                              'Đang học'
                            ) : (
                              'Chưa bắt đầu'
                            )}
                          </Badge>
                        </div>

                        <p className="mt-3 text-xs text-muted-foreground">
                          {completedLessons}/{totalLessons} bài học đã hoàn thành
                        </p>

                        <div className="mt-2 flex items-center gap-3">
                          <ProgressBar value={progress} size="sm" className="flex-1" />
                          <span className="w-10 shrink-0 text-right text-xs font-bold text-primary">
                            {progress}%
                          </span>
                        </div>

                        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                          <Button asChild variant="outline" size="sm" className="text-primary hover:bg-primary/10">
                            <Link href={`/courses/${item.courseId}/learn`}>
                              <Play className="h-3.5 w-3.5" />
                              {progress >= 100 ? 'Học lại' : progress > 0 ? 'Tiếp tục học' : 'Bắt đầu học'}
                            </Link>
                          </Button>

                          {isCompleted ? (
                            <Button asChild variant="default" size="sm">
                              <Link href={`/certificates/${item.courseId}`}>
                                <Award className="h-3.5 w-3.5" />
                                Chứng chỉ
                              </Link>
                            </Button>
                          ) : (
                            <Link
                              href={`/courses/${item.courseId}`}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground transition hover:text-primary"
                            >
                              Chi tiết khóa học
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
