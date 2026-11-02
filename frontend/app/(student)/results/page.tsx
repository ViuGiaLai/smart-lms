'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Percent,
  RefreshCw,
  RotateCcw,
  Target,
  XCircle,
} from 'lucide-react';
import { studentApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { cn } from '@/lib/utils';

type ResultItem = {
  id: number | string;
  quizId?: string;
  quizTitle: string;
  courseId?: string;
  courseTitle: string;
  score: number;
  passed: boolean;
  submittedAt?: string | null;
  totalQuestions?: number | null;
};

type StatusFilter = 'all' | 'passed' | 'failed';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'passed', label: 'Đạt' },
  { value: 'failed', label: 'Chưa đạt' },
];

/** Điểm trong DB lưu thang 0–1, giao diện hiển thị theo %. */
function toPercent(score: number) {
  return Math.round((Number.isFinite(score) ? score : 0) * 100);
}

export default function ResultsPage() {
  const { isAuthorized } = useRoleGuard(['student']);
  const { isLoading: authLoading } = useAuth();
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [courseFilter, setCourseFilter] = useState('all');

  const loadResults = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await studentApi.getResults();
      setResults(response.data?.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Không thể tải kết quả học tập.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized && !authLoading) void loadResults();
  }, [authLoading, isAuthorized]);

  const summary = useMemo(() => {
    if (results.length === 0) {
      return { average: 0, passRate: 0, best: 0 };
    }
    const totalPercent = results.reduce((acc, item) => acc + toPercent(item.score), 0);
    const best = results.reduce((acc, item) => Math.max(acc, toPercent(item.score)), 0);
    const passed = results.filter((item) => item.passed).length;
    return {
      average: Math.round(totalPercent / results.length),
      passRate: Math.round((passed / results.length) * 100),
      best,
    };
  }, [results]);

  const courses = useMemo(() => {
    const map = new Map<string, string>();
    results.forEach((item) => {
      if (item.courseId) map.set(item.courseId, item.courseTitle);
    });
    return Array.from(map, ([id, title]) => ({ id, title }));
  }, [results]);

  const visibleResults = useMemo(
    () =>
      results.filter((item) => {
        if (status === 'passed' && !item.passed) return false;
        if (status === 'failed' && item.passed) return false;
        if (courseFilter !== 'all' && item.courseId !== courseFilter) return false;
        return true;
      }),
    [results, status, courseFilter],
  );

  const isFiltering = status !== 'all' || courseFilter !== 'all';

  if (!isAuthorized || authLoading) {
    return <PageSkeleton />;
  }

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Kết quả học tập"
          description="Điểm số, trạng thái đạt và số câu của từng bài kiểm tra bạn đã nộp. Bấm “Làm lại” để ôn luyện ngay trên chính đề đó."
          actions={[
            {
              label: 'Làm mới',
              icon: <RefreshCw className="h-3.5 w-3.5" />,
              onClick: () => void loadResults(),
            },
          ]}
        />

        {loading && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="p-5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-3 h-7 w-16" />
                </Card>
              ))}
            </div>
            <Card className="divide-y divide-border">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-5">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-9 w-16" />
                </div>
              ))}
            </Card>
          </>
        )}

        {!loading && error && (
          <ErrorState message={error} actionLabel="Thử lại" onAction={() => void loadResults()} />
        )}

        {!loading && !error && results.length === 0 && (
          <EmptyState
            icon={<Award className="h-6 w-6" />}
            title="Chưa có kết quả nào"
            description="Nộp một bài kiểm tra trắc nghiệm để xem điểm và trạng thái đạt tại đây."
          >
            <Button asChild size="sm" className="mt-1">
              <Link href="/quizzes">Xem bài kiểm tra</Link>
            </Button>
          </EmptyState>
        )}

        {!loading && !error && results.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon={Award} label="Bài đã nộp" value={`${results.length} bài`} accent="violet" />
              <StatCard icon={Percent} label="Điểm trung bình" value={`${summary.average}%`} accent="primary" />
              <StatCard icon={Target} label="Tỉ lệ đạt" value={`${summary.passRate}%`} accent="emerald" />
              <StatCard icon={CheckCircle2} label="Điểm cao nhất" value={`${summary.best}%`} accent="amber" />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                {STATUS_FILTERS.map((filter) => (
                  <Button
                    key={filter.value}
                    type="button"
                    size="sm"
                    variant={status === filter.value ? 'default' : 'outline'}
                    onClick={() => setStatus(filter.value)}
                    aria-pressed={status === filter.value}
                  >
                    {filter.label}
                  </Button>
                ))}
              </div>

              {courses.length > 1 && (
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <GraduationCap className="h-4 w-4" />
                  <span className="sr-only">Lọc theo khóa học</span>
                  <select
                    value={courseFilter}
                    onChange={(event) => setCourseFilter(event.target.value)}
                    className="max-w-[240px] cursor-pointer rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="all">Tất cả khóa học</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {visibleResults.length === 0 ? (
              <EmptyState
                icon={<Award className="h-6 w-6" />}
                title="Không có bài nào khớp bộ lọc"
                description="Thử chọn trạng thái hoặc khóa học khác để xem kết quả."
              >
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-1"
                  onClick={() => {
                    setStatus('all');
                    setCourseFilter('all');
                  }}
                >
                  Xóa bộ lọc
                </Button>
              </EmptyState>
            ) : (
              <Card>
                <CardContent className="divide-y divide-border p-0">
                  {visibleResults.map((result) => {
                    const percent = toPercent(result.score);
                    return (
                      <div
                        key={result.id}
                        className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate font-bold text-foreground">{result.quizTitle}</h2>
                            {result.totalQuestions ? (
                              <Badge variant="secondary" className="shrink-0">
                                {result.totalQuestions} câu
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <GraduationCap className="h-3 w-3" />
                              {result.courseTitle}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="h-3 w-3" />
                              {result.submittedAt
                                ? new Date(result.submittedAt).toLocaleString('vi-VN')
                                : 'Không rõ thời điểm nộp'}
                            </span>
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                          <div className="text-right">
                            <p
                              className={cn(
                                'text-lg font-bold leading-tight',
                                result.passed ? 'text-emerald-600' : 'text-destructive',
                              )}
                            >
                              {percent}%
                            </p>
                            <span
                              className={cn(
                                'mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold',
                                result.passed ? 'text-emerald-700' : 'text-destructive',
                              )}
                            >
                              {result.passed ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5" />
                              )}
                              {result.passed ? 'Đạt' : 'Chưa đạt'}
                            </span>
                          </div>

                          {result.quizId && (
                            <Button asChild variant="outline" size="sm">
                              <Link
                                href={`/quiz/${result.quizId}${result.courseId ? `?courseId=${result.courseId}` : ''}`}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Làm lại
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {isFiltering && visibleResults.length > 0 && (
              <p className="text-center text-[11px] text-muted-foreground">
                Đang hiển thị {visibleResults.length}/{results.length} bài làm.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
