'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProgressBar from '@/components/course/ProgressBar';
import {
  ArrowLeft,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  Flame,
  Play,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { studentApi, coursesApi } from '@/lib/api';
import { Enrollment, StudentDashboardStats, StudentTopicMasteryOverview, CourseMasteryItem, TopicMasteryItem } from '@/types';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/page-skeleton';

export default function StudentProgressPage() {
  const { isAuthorized } = useRoleGuard(['student']);
  const { isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<StudentDashboardStats | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [masteryData, setMasteryData] = useState<StudentTopicMasteryOverview | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [statsRes, enrolledRes, masteryRes] = await Promise.allSettled([
        studentApi.getDashboardStats(),
        coursesApi.getEnrolled(),
        studentApi.getMastery(),
      ]);

      if (statsRes.status === 'rejected' && enrolledRes.status === 'rejected') {
        throw statsRes.reason;
      }

      setStats(statsRes.status === 'fulfilled' ? statsRes.value.data?.data ?? null : null);
      setEnrollments(
        enrolledRes.status === 'fulfilled' ? enrolledRes.value.data?.data ?? [] : [],
      );
      setMasteryData(
        masteryRes.status === 'fulfilled' ? masteryRes.value.data?.data ?? null : null,
      );
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          'Không thể tải báo cáo tiến độ. Vui lòng kiểm tra kết nối và thử lại.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthorized || authLoading) return;
    void loadData();
  }, [authLoading, isAuthorized]);

  const totalCourses = stats?.totalEnrolled ?? enrollments.length;
  const totalCompleted = stats?.totalCompleted ?? enrollments.filter((e) => (e.progress || 0) >= 100).length;
  const totalWatchHours = stats ? (stats.totalWatchTime / 3600).toFixed(1) : '0';
  const currentStreak = stats?.currentStreak ?? 0;
  const averageProgress =
    enrollments.length > 0
      ? Math.round(
          enrollments.reduce((acc, curr) => acc + (curr.progress || 0), 0) / enrollments.length,
        )
      : 0;

  if (!isAuthorized || authLoading) {
    return <PageSkeleton />;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Báo cáo & Tiến độ Học tập"
        description="Số liệu học tập lấy trực tiếp từ cơ sở dữ liệu: bài đã hoàn thành, thời lượng xem và số ngày học liên tiếp."
        actions={[
          {
            label: 'Quay lại',
            icon: <ArrowLeft className="h-3.5 w-3.5" />,
            onClick: () => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push('/dashboard');
              }
            },
          },
          {
            label: 'Kết quả kiểm tra',
            icon: <Award className="h-3.5 w-3.5" />,
            href: '/results',
          },
        ]}
      />

      {loading && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-20" />
              </Card>
            ))}
          </div>
          <Card className="space-y-4 p-5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </Card>
        </>
      )}

      {!loading && error && (
        <ErrorState message={error} actionLabel="Thử lại" onAction={() => void loadData()} />
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={BookOpen} label="Khóa đã ghi danh" value={`${totalCourses} khóa`} accent="primary" />
            <StatCard icon={CheckCircle2} label="Khóa hoàn thành" value={`${totalCompleted} khóa`} accent="emerald" />
            <StatCard icon={Flame} label="Chuỗi ngày học" value={`${currentStreak} ngày`} accent="amber" />
            <StatCard icon={Clock} label="Tổng giờ đã học" value={`${totalWatchHours}h`} accent="violet" />
          </div>

          <Card className="rounded-lg">
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold text-foreground">Tiến độ theo khóa học</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-xs font-medium">
                    {enrollments.length} khóa học
                  </Badge>
                  <Badge variant="outline" className="text-xs font-medium">
                    <Target className="h-3 w-3" />
                    Trung bình {averageProgress}%
                  </Badge>
                </div>
              </div>

              {enrollments.length === 0 ? (
                <EmptyState
                  icon={<BookOpen className="h-6 w-6" />}
                  title="Bạn chưa ghi danh khóa học nào"
                  description="Tham gia khóa học để bắt đầu theo dõi tiến độ, chuỗi ngày học và hỏi đáp cùng Trợ lý AI."
                >
                  <Button asChild size="sm" className="mt-1">
                    <Link href="/courses">Khám phá khóa học</Link>
                  </Button>
                </EmptyState>
              ) : (
                <div className="space-y-5">
                  {enrollments.map((item) => {
                    const progress = item.progress || 0;
                    const isCompleted = progress >= 100;
                    const remaining = Math.max(
                      0,
                      (item.totalLessons || 0) - (item.completedLessons || 0),
                    );
                    return (
                      <div
                        key={item.id}
                        className="space-y-3 rounded-lg border border-border/80 bg-muted/50 p-5"
                      >
                        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-foreground">
                              {item.course?.title || `Khóa học #${item.courseId}`}
                            </h3>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {isCompleted
                                ? 'Đã hoàn thành toàn bộ bài học của khóa.'
                                : remaining > 0
                                  ? `Còn ${remaining} bài học để hoàn thành khóa.`
                                  : 'Bắt đầu bài học đầu tiên của khóa.'}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="text-xs font-semibold">
                              {item.completedLessons ?? 0}/{item.totalLessons ?? 0} bài học
                            </Badge>
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 rounded-lg px-2.5 text-xs text-primary"
                            >
                              <Link href={`/courses/${item.courseId}/learn`}>
                                <Play className="h-3 w-3" />
                                Vào học
                              </Link>
                            </Button>
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 rounded-lg border-clay-200 bg-clay-50 px-2.5 text-xs text-clay-700 hover:bg-clay-100"
                              title="Làm đề thi trắc nghiệm ôn tập"
                            >
                              <Link href={`/courses/${item.courseId}/learn?tab=quiz`}>
                                <Award className="h-3 w-3 text-clay-600" />
                                Thi trắc nghiệm
                              </Link>
                            </Button>
                            {isCompleted && (
                              <Button asChild size="sm" className="h-7 gap-1 rounded-lg px-2.5 text-xs">
                                <Link href={`/certificates/${item.courseId}`}>
                                  <CheckCircle2 className="h-3 w-3" />
                                  Chứng chỉ
                                </Link>
                              </Button>
                            )}
                          </div>
                        </div>

                        <ProgressBar progress={progress} />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Báo Cáo Năng Lực Thực Tế & Chủ Đề Cần Cải Thiện (AI Topic Mastery) ── */}
          {masteryData && masteryData.courses && masteryData.courses.length > 0 && (
            <Card className="rounded-lg border-brand-200 bg-white">
              <CardContent className="space-y-6 p-6 sm:p-8">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-xs">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-stone-900">
                        Đánh giá Năng lực Thực tế (Topic Mastery)
                      </h2>
                      <p className="text-xs text-stone-500">
                        Phân tích mức độ hiểu bản chất theo từng chủ đề dựa trên kết quả kiểm tra và tương tác cùng Gia sư AI.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-stone-600">Độ vững kiến thức:</span>
                    <Badge
                      variant={masteryData.overallMastery >= 75 ? 'success' : 'warning'}
                      className="px-2.5 py-0.5 text-xs font-bold"
                    >
                      {masteryData.overallMastery}%
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {masteryData.courses.map((c: CourseMasteryItem) => (
                    <div
                      key={c.courseId}
                      className="rounded-lg border border-stone-200 bg-stone-50/50 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-stone-900 truncate max-w-[240px]">
                          {c.courseTitle}
                        </h3>
                        <Badge variant="outline" className="text-[10px]">
                          {c.gradeLabel || c.category || 'Tổng hợp'}
                        </Badge>
                      </div>

                      {/* Các chủ đề chi tiết */}
                      {c.topics && c.topics.length > 0 && (
                        <div className="space-y-2 pt-1">
                          {c.topics.map((t: TopicMasteryItem, idx: number) => (
                            <div key={idx} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="font-medium text-stone-700">{t.topicName}</span>
                                <span
                                  className={`font-semibold ${
                                    t.masteryScore >= 75
                                      ? 'text-emerald-600'
                                      : t.masteryScore >= 50
                                      ? 'text-amber-600'
                                      : 'text-red-500'
                                  }`}
                                >
                                  {t.masteryScore}%
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-stone-200 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    t.masteryScore >= 75
                                      ? 'bg-emerald-500'
                                      : t.masteryScore >= 50
                                      ? 'bg-amber-500'
                                      : 'bg-red-400'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(0, t.masteryScore))}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Điểm mạnh */}
                      {c.strongAreas && c.strongAreas.length > 0 && (
                        <div className="rounded border border-emerald-100 bg-emerald-50/70 p-2 text-xs text-emerald-800 flex items-start gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Đã vững vàng: </span>
                            <span>{c.strongAreas.join(', ')}</span>
                          </div>
                        </div>
                      )}

                      {/* Điểm cần ôn thêm */}
                      {c.needsReviewAreas && c.needsReviewAreas.length > 0 && (
                        <div className="rounded border border-amber-200 bg-amber-50/70 p-2 text-xs text-amber-900 flex items-start gap-1.5">
                          <Compass className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Chủ đề cần luyện thêm: </span>
                            <span>{c.needsReviewAreas.join(', ')}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </main>
  );
}
