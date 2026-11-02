'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  GraduationCap,
  Printer,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { studentApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/course/ProgressBar';
import { PageSkeleton } from '@/components/ui/page-skeleton';

type CertificateData = {
  courseId: string;
  courseTitle: string;
  studentName: string;
  studentEmail: string;
  isEligible: boolean;
  completedLessons: number;
  totalLessons: number;
  hasQuizzes: boolean;
  totalQuizzes: number;
  passedQuizzes: number;
  quizPassed: boolean;
  issuedAt: string | null;
};

function formatIssuedAt(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function CertificatePage() {
  const params = useParams();
  const courseId = (params?.courseId as string) || '';
  const { isAuthorized } = useRoleGuard(['student']);
  const { isLoading: authLoading } = useAuth();
  const [data, setData] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCertificate = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError('');
    try {
      const response = await studentApi.getCertificate(courseId);
      setData(response.data?.data ?? null);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          'Không thể kiểm tra điều kiện cấp chứng chỉ cho khóa học này.',
      );
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (isAuthorized && !authLoading) void loadCertificate();
  }, [authLoading, isAuthorized, loadCertificate]);

  if (!isAuthorized || authLoading) {
    return <PageSkeleton />;
  }

  const lessonsDone = data ? data.completedLessons >= data.totalLessons && data.totalLessons > 0 : false;
  const progressPercent =
    data && data.totalLessons > 0
      ? Math.round((data.completedLessons / data.totalLessons) * 100)
      : 0;

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="print:hidden">
          <PageHeader
            title="Chứng chỉ hoàn thành khóa học"
            description="Chứng chỉ được hệ thống cấp tự động khi bạn hoàn thành 100% bài học và đạt yêu cầu bài kiểm tra của khóa."
            badges={
              data?.isEligible ? [{ label: 'Đủ điều kiện', variant: 'success' as const }] : undefined
            }
            actions={[
              {
                label: 'Kiểm tra lại',
                icon: <RefreshCw className="h-3.5 w-3.5" />,
                onClick: () => void loadCertificate(),
              },
              { label: 'Khóa học của tôi', icon: <GraduationCap className="h-3.5 w-3.5" />, href: '/my-courses' },
            ]}
          />
        </div>

        {loading && (
          <Card className="p-8">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="mt-4 h-10 w-72" />
            <Skeleton className="mt-6 h-3 w-full" />
            <Skeleton className="mt-3 h-3 w-2/3" />
          </Card>
        )}

        {!loading && error && (
          <div className="space-y-3 print:hidden">
            <ErrorState message={error} actionLabel="Thử lại" onAction={() => void loadCertificate()} />
            <Button asChild variant="outline" size="sm">
              <Link href="/my-courses">Về danh sách khóa học của tôi</Link>
            </Button>
          </div>
        )}

        {!loading && !error && data && !data.isEligible && (
          <Card className="print:hidden">
            <CardContent className="space-y-5 p-6 sm:p-8">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <Award className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-foreground">
                    Chưa đủ điều kiện cấp chứng chỉ
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Hoàn tất các mục dưới đây cho khóa “{data.courseTitle}” để mở chứng chỉ.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {lessonsDone ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/50" />
                      )}
                      Xem hết bài giảng
                    </p>
                    <Badge variant={lessonsDone ? 'success' : 'secondary'}>
                      {data.completedLessons}/{data.totalLessons} bài
                    </Badge>
                  </div>
                  <ProgressBar value={progressPercent} size="sm" />
                  {!lessonsDone && (
                    <Button asChild size="sm" variant="outline" className="mt-1">
                      <Link href={`/courses/${courseId}/learn`}>
                        <BookOpen className="h-3.5 w-3.5" />
                        Học tiếp bài còn lại
                      </Link>
                    </Button>
                  )}
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {data.quizPassed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/50" />
                      )}
                      Đạt bài kiểm tra của khóa
                    </p>
                    <Badge variant={data.quizPassed ? 'success' : 'secondary'}>
                      {data.hasQuizzes
                        ? `${data.passedQuizzes}/${data.totalQuizzes} đề đạt`
                        : 'Không bắt buộc'}
                    </Badge>
                  </div>
                  {data.hasQuizzes && !data.quizPassed && (
                    <Button asChild size="sm" variant="outline" className="mt-1">
                      <Link href={`/courses/${courseId}/learn?tab=quiz`}>
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Làm bài kiểm tra của khóa
                      </Link>
                    </Button>
                  )}
                  {!data.hasQuizzes && (
                    <p className="text-[11px] text-muted-foreground">
                      Khóa học này chưa có đề kiểm tra nên chỉ cần hoàn thành bài giảng.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && !error && data && data.isEligible && (
          <>
            <div
              id="certificate-print-root"
              className="relative overflow-hidden rounded-lg border-2 border-primary/25 bg-card p-6 sm:p-10"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10" />
              <div className="pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-emerald-500/10" />

              <div className="relative space-y-6 text-center">
                <div className="flex flex-col items-center gap-2">
                  <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                    <Award className="h-7 w-7" />
                  </span>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">
                    Smart LMS · AI Tutoring Platform
                  </p>
                </div>

                <div className="space-y-2">
                  <h1 className="text-xl font-bold uppercase tracking-[0.18em] text-foreground sm:text-2xl">
                    Chứng nhận hoàn thành khóa học
                  </h1>
                  <p className="text-xs italic text-muted-foreground">Certificate of Completion</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Chứng nhận học viên
                  </p>
                  <p className="text-2xl font-bold text-foreground sm:text-3xl">{data.studentName}</p>
                  <p className="mx-auto max-w-xl text-xs leading-relaxed text-muted-foreground">
                    đã hoàn thành toàn bộ bài giảng, tương tác cùng Trợ lý Gia sư AI và đạt yêu cầu
                    kiểm tra của khóa học
                  </p>
                  <p className="mx-auto max-w-2xl text-base font-bold text-primary sm:text-lg">
                    {data.courseTitle}
                  </p>
                </div>

                <div className="mx-auto grid max-w-xl gap-3 border-t border-primary/15 pt-5 text-left sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Ngày cấp
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-foreground">
                      {formatIssuedAt(data.issuedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Bài giảng hoàn thành
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-foreground">
                      {data.completedLessons}/{data.totalLessons}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Bài kiểm tra đạt
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-foreground">
                      {data.hasQuizzes ? `${data.passedQuizzes}/${data.totalQuizzes} đề` : 'Không bắt buộc'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-1 border-t border-primary/15 pt-5">
                  <p className="text-[11px] font-semibold text-foreground">
                    Cấp tự động bởi hệ thống Smart LMS
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Mã học viên: {data.studentEmail}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Dùng “In / Lưu PDF” để tải chứng chỉ về máy hoặc nộp kèm hồ sơ.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/courses/${courseId}/learn`}>
                    <BookOpen className="h-3.5 w-3.5" />
                    Ôn lại bài giảng
                  </Link>
                </Button>
                <Button type="button" size="sm" onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5" />
                  In / Lưu PDF
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
