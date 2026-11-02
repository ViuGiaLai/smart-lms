'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  HelpCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Target,
} from 'lucide-react';
import { studentApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { cn } from '@/lib/utils';

type QuizItem = {
  id: string | number;
  title: string;
  description?: string | null;
  questionCount?: number;
  timeLimit?: number | null;
  passScore?: number | null;
  isAiGenerated?: boolean;
  courseId: string;
  courseTitle: string;
};

type ResultItem = {
  quizId?: string;
  score: number;
  passed: boolean;
};

type Attempt = { best: number; passed: boolean; count: number };

function formatTimeLimit(seconds?: number | null) {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  return minutes >= 1 ? `${minutes} phút` : `${seconds} giây`;
}

export default function QuizzesPage() {
  const { isAuthorized } = useRoleGuard(['student']);
  const { isLoading: authLoading } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');

  const loadQuizzes = async () => {
    setLoading(true);
    setError('');
    try {
      // Lấy đề và kết quả đã nộp song song — trang không cần chờ 2 vòng.
      const [quizRes, resultRes] = await Promise.allSettled([
        studentApi.getQuizzes(),
        studentApi.getResults(),
      ]);

      if (quizRes.status === 'rejected') throw quizRes.reason;

      setQuizzes(quizRes.value.data?.data || []);

      const attemptMap: Record<string, Attempt> = {};
      if (resultRes.status === 'fulfilled') {
        (resultRes.value.data?.data || []).forEach((item: ResultItem) => {
          if (!item.quizId) return;
          const score = Math.round((Number(item.score) || 0) * 100);
          const existing = attemptMap[item.quizId];
          attemptMap[item.quizId] = {
            best: existing ? Math.max(existing.best, score) : score,
            passed: Boolean(existing?.passed || item.passed),
            count: (existing?.count || 0) + 1,
          };
        });
      }
      setAttempts(attemptMap);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          'Không thể tải bài kiểm tra của các khóa học đã đăng ký.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized && !authLoading) void loadQuizzes();
  }, [authLoading, isAuthorized]);

  const courses = useMemo(() => {
    const map = new Map<string, string>();
    quizzes.forEach((quiz) => map.set(quiz.courseId, quiz.courseTitle));
    return Array.from(map, ([id, title]) => ({ id, title }));
  }, [quizzes]);

  const visibleQuizzes = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return quizzes.filter((quiz) => {
      if (courseFilter !== 'all' && quiz.courseId !== courseFilter) return false;
      if (!keyword) return true;
      return `${quiz.title} ${quiz.courseTitle}`.toLowerCase().includes(keyword);
    });
  }, [quizzes, search, courseFilter]);

  const completedCount = useMemo(
    () => quizzes.filter((quiz) => attempts[String(quiz.id)]?.passed).length,
    [quizzes, attempts],
  );

  if (!isAuthorized || authLoading) {
    return <PageSkeleton />;
  }

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Bài kiểm tra"
          description="Toàn bộ đề trắc nghiệm thuộc các khóa học bạn đã ghi danh, kèm điểm cao nhất bạn từng đạt cho mỗi đề."
          badges={
            quizzes.length > 0
              ? [
                  { label: `${quizzes.length} đề`, variant: 'info' },
                  { label: `${completedCount} đã đạt`, variant: 'success' },
                ]
              : undefined
          }
          actions={[
            {
              label: 'Làm mới',
              icon: <RefreshCw className="h-3.5 w-3.5" />,
              onClick: () => void loadQuizzes(),
            },
          ]}
        />

        {loading && (
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="mt-2 h-4 w-2/3" />
                <Skeleton className="mt-4 h-8 w-24" />
              </Card>
            ))}
          </div>
        )}

        {!loading && error && (
          <ErrorState message={error} actionLabel="Thử lại" onAction={() => void loadQuizzes()} />
        )}

        {!loading && !error && quizzes.length === 0 && (
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" />}
            title="Chưa có bài kiểm tra"
            description="Đề kiểm tra sẽ xuất hiện sau khi bạn ghi danh khóa học có đề do giảng viên tạo hoặc AI sinh tự động."
          >
            <Button asChild size="sm" className="mt-1">
              <Link href="/courses">Khám phá khóa học</Link>
            </Button>
          </EmptyState>
        )}

        {!loading && !error && quizzes.length > 0 && (
          <>
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm đề theo tên hoặc khóa học..."
                  className="h-9 pl-9 text-xs"
                  aria-label="Tìm kiếm bài kiểm tra"
                />
              </div>

              {courses.length > 1 && (
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
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

            {visibleQuizzes.length === 0 ? (
              <EmptyState
                icon={<Search className="h-6 w-6" />}
                title="Không tìm thấy đề phù hợp"
                description="Thử từ khóa khác hoặc bỏ lọc khóa học để xem toàn bộ đề."
              >
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-1"
                  onClick={() => {
                    setSearch('');
                    setCourseFilter('all');
                  }}
                >
                  Xóa bộ lọc
                </Button>
              </EmptyState>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {visibleQuizzes.map((quiz) => {
                  const attempt = attempts[String(quiz.id)];
                  const passScore = Math.round((quiz.passScore ?? 0.6) * 100);
                  const timeLimit = formatTimeLimit(quiz.timeLimit);
                  return (
                    <Card key={`${quiz.courseId}-${quiz.id}`} className="flex flex-col">
                      <CardContent className="flex flex-1 flex-col gap-3 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-primary">
                              {quiz.courseTitle}
                            </p>
                            <h2 className="mt-1 line-clamp-2 font-bold text-foreground">
                              {quiz.title}
                            </h2>
                          </div>
                          {attempt?.passed ? (
                            <Badge variant="success" className="shrink-0">
                              <CheckCircle2 className="h-3 w-3" />
                              Đã đạt
                            </Badge>
                          ) : attempt ? (
                            <Badge variant="warning" className="shrink-0">
                              Chưa đạt
                            </Badge>
                          ) : (
                            <Award className="h-5 w-5 shrink-0 text-clay-500" />
                          )}
                        </div>

                        {quiz.description && (
                          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {quiz.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary">
                            <HelpCircle className="h-3 w-3" />
                            {quiz.questionCount ?? 0} câu
                          </Badge>
                          {timeLimit && (
                            <Badge variant="secondary">
                              <Clock3 className="h-3 w-3" />
                              {timeLimit}
                            </Badge>
                          )}
                          <Badge variant="outline">
                            <Target className="h-3 w-3" />
                            Đạt từ {passScore}%
                          </Badge>
                          {quiz.isAiGenerated && (
                            <Badge variant="info">
                              <Sparkles className="h-3 w-3" />
                              AI tạo đề
                            </Badge>
                          )}
                        </div>

                        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                          <p
                            className={cn(
                              'text-[11px] font-semibold',
                              attempt?.passed ? 'text-emerald-600' : 'text-muted-foreground',
                            )}
                          >
                            {attempt
                              ? `Điểm cao nhất ${attempt.best}% · ${attempt.count} lần làm`
                              : 'Bạn chưa làm đề này'}
                          </p>
                          <Button asChild variant={attempt ? 'outline' : 'default'} size="sm">
                            <Link href={`/quiz/${quiz.id}?courseId=${quiz.courseId}`}>
                              {attempt ? (
                                <>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  Làm lại
                                </>
                              ) : (
                                <>
                                  <ClipboardCheck className="h-3.5 w-3.5" />
                                  Làm bài
                                </>
                              )}
                            </Link>
                          </Button>
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
