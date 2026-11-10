'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  MessageSquare,
  RefreshCw,
  Target,
  ThumbsUp,
  Users,
} from 'lucide-react';

import { coursesApi, instructorApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { PageHeader } from '@/components/ui/page-header';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { ErrorState, EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CourseOption {
  id: string;
  title: string;
  status?: string;
}

interface DailyPoint {
  date: string;
  events: number;
  learners: number;
}

interface ActivityTypeRow {
  type: string;
  count: number;
}

interface LessonEngagementRow {
  lessonId: number;
  title: string;
  views: number;
  materialsOpened: number;
  completions: number;
}

interface AnalyticsPayload {
  courseId: number;
  courseTitle: string;
  windowDays: number;
  summary: {
    enrollments: number;
    activeLearners: number;
    completedLessons: number;
    avgProgressPercent: number;
    totalLessons: number;
    quizSubmissions: number;
    avgQuizScorePercent: number;
    aiMessages: number;
    aiFeedbackUp: number;
    aiFeedbackDown: number;
  };
  dailyActivity: DailyPoint[];
  activityByType: ActivityTypeRow[];
  lessonEngagement: LessonEngagementRow[];
}

const EVENT_LABELS: Record<string, string> = {
  login: 'Đăng nhập',
  lesson_view: 'Mở bài học',
  video_play: 'Phát video',
  video_pause: 'Tạm dừng video',
  video_complete: 'Xem hết video',
  material_open: 'Mở học liệu',
  quiz_start: 'Bắt đầu làm đề',
  quiz_submit: 'Nộp bài trắc nghiệm',
  ai_chat: 'Hỏi trợ lý AI',
  ai_feedback: 'Đánh giá câu trả lời AI',
  course_view: 'Xem khóa học',
};

function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export default function InstructorAnalyticsPage() {
  const { isAuthorized } = useRoleGuard(['instructor', 'admin']);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [courseId, setCourseId] = useState('');
  const [days, setDays] = useState('30');
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthorized) return;
    let mounted = true;
    (async () => {
      try {
        const res = await instructorApi.getCourses();
        const rows: CourseOption[] = Array.isArray(res.data?.data)
          ? res.data.data.map((course: { id: number | string; title: string; status?: string }) => ({
              id: String(course.id),
              title: course.title,
              status: course.status,
            }))
          : [];
        if (!mounted) return;
        setCourses(rows);
        const requested =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('courseId')
            : null;
        const preferred =
          rows.find((course) => course.id === requested) ||
          rows.find((course) => course.status === 'published') ||
          rows[0];
        setCourseId(preferred?.id || '');
        if (rows.length === 0) setLoading(false);
      } catch {
        if (mounted) {
          setError('Không tải được danh sách khóa học.');
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isAuthorized]);

  const loadAnalytics = useCallback(async () => {
    if (!courseId) return;
    setLoadingAnalytics(true);
    setError('');
    try {
      const res = await coursesApi.getCourseAnalytics(courseId, Number(days));
      const payload = res.data?.data as AnalyticsPayload | undefined;
      setData(payload ?? null);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Không tải được số liệu phân tích của khóa học.';
      setError(detail);
    } finally {
      setLoadingAnalytics(false);
      setLoading(false);
    }
  }, [courseId, days]);

  useEffect(() => {
    if (isAuthorized && courseId) void loadAnalytics();
  }, [isAuthorized, courseId, days, loadAnalytics]);

  const maxDailyEvents = useMemo(
    () => Math.max(1, ...(data?.dailyActivity || []).map((point) => point.events)),
    [data],
  );

  const feedbackTotal = (data?.summary.aiFeedbackUp || 0) + (data?.summary.aiFeedbackDown || 0);
  const positiveRate =
    feedbackTotal > 0
      ? Math.round(((data?.summary.aiFeedbackUp || 0) / feedbackTotal) * 100)
      : null;

  if (!isAuthorized || (loading && courses.length === 0)) {
    return <PageSkeleton cards={4} />;
  }

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          badges={[{ label: 'Giảng viên', variant: 'info' }]}
          title="Phân tích học tập"
          description="Số liệu thật từ sự kiện học tập, tiến độ và bài nộp. Dùng để biết bài nào cần cải thiện, không dùng để xếp hạng học viên."
          actions={[
            {
              label: loadingAnalytics ? 'Đang tải…' : 'Làm mới',
              icon: <RefreshCw className="h-4 w-4" />,
              onClick: () => void loadAnalytics(),
              disabled: loadingAnalytics || !courseId,
            },
          ]}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:max-w-md">
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger aria-label="Chọn khóa học">
                <SelectValue placeholder="Chọn khóa học" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-44">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger aria-label="Khoảng thời gian">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 ngày gần nhất</SelectItem>
                <SelectItem value="30">30 ngày gần nhất</SelectItem>
                <SelectItem value="90">90 ngày gần nhất</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && <ErrorState message={error} actionLabel="Thử lại" onAction={() => void loadAnalytics()} />}

        {!error && courses.length === 0 && (
          <EmptyState
            icon={<BookOpenCheck className="h-5 w-5" />}
            title="Chưa có khóa học"
            description="Tạo khóa học và mời học viên ghi danh để bắt đầu thu số liệu."
          />
        )}

        {!error && courseId && data && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={Users}
                label="Học viên ghi danh"
                value={data.summary.enrollments}
                loading={loadingAnalytics}
              />
              <StatCard
                icon={Activity}
                label={`Học viên hoạt động (${data.windowDays} ngày)`}
                value={data.summary.activeLearners}
                accent="emerald"
                loading={loadingAnalytics}
              />
              <StatCard
                icon={Target}
                label="Tiến độ trung bình"
                value={`${data.summary.avgProgressPercent}%`}
                accent="violet"
                loading={loadingAnalytics}
              />
              <StatCard
                icon={BarChart3}
                label="Bài hoàn thành"
                value={`${data.summary.completedLessons}/${data.summary.totalLessons}`}
                accent="amber"
                loading={loadingAnalytics}
              />
            </section>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={BarChart3}
                label="Lượt nộp trắc nghiệm"
                value={data.summary.quizSubmissions}
                loading={loadingAnalytics}
              />
              <StatCard
                icon={Target}
                label="Điểm trắc nghiệm TB"
                value={`${data.summary.avgQuizScorePercent}%`}
                accent="emerald"
                loading={loadingAnalytics}
              />
              <StatCard
                icon={MessageSquare}
                label={`Câu trả lời AI (${data.windowDays} ngày)`}
                value={data.summary.aiMessages}
                accent="violet"
                loading={loadingAnalytics}
              />
              <StatCard
                icon={ThumbsUp}
                label="AI hữu ích"
                value={positiveRate === null ? '—' : `${positiveRate}%`}
                accent="amber"
                loading={loadingAnalytics}
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Hoạt động 14 ngày gần nhất</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.dailyActivity.map((point) => (
                      <div key={point.date} className="flex items-center gap-3">
                        <span className="w-12 shrink-0 text-[11px] text-muted-foreground">
                          {formatDay(point.date)}
                        </span>
                        <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
                          <div
                            className="h-full rounded bg-primary/70 transition-all"
                            style={{ width: `${(point.events / maxDailyEvents) * 100}%` }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">
                          {point.events} lượt · {point.learners} HV
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Loại hoạt động</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.activityByType.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Chưa có sự kiện trong khoảng thời gian này.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {data.activityByType.map((row) => (
                        <li key={row.type} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-foreground">{EVENT_LABELS[row.type] || row.type}</span>
                          <span className="font-semibold text-muted-foreground">{row.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <CardTitle>Mức độ tương tác theo bài học</CardTitle>
              </CardHeader>
              <CardContent>
                {data.lessonEngagement.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Khóa học chưa có bài học.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Bài học</th>
                          <th className="py-2 pr-3 text-right font-medium">Lượt mở</th>
                          <th className="py-2 pr-3 text-right font-medium">Học liệu</th>
                          <th className="py-2 text-right font-medium">Hoàn thành</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.lessonEngagement.map((lesson) => (
                          <tr key={lesson.lessonId} className="border-b border-border/60 last:border-0">
                            <td className="py-2.5 pr-3 text-foreground">{lesson.title}</td>
                            <td className="py-2.5 pr-3 text-right text-muted-foreground">{lesson.views}</td>
                            <td className="py-2.5 pr-3 text-right text-muted-foreground">
                              {lesson.materialsOpened}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">{lesson.completions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Số liệu chỉ tính sự kiện đã ghi nhận từ khi bật theo dõi. Dữ liệu cũ trước đó
              không được suy diễn ngược để tránh báo cáo sai.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
