'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProgressBar from '@/components/course/ProgressBar';
import { ArrowLeft, Award, BookOpen, Clock, Target, TrendingUp, Sparkles, Play } from 'lucide-react';
import { studentApi, coursesApi } from '@/lib/api';
import { Enrollment, StudentDashboardStats } from '@/types';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function StudentProgressPage() {
  const { isAuthorized } = useRoleGuard(['student']);
  const { isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StudentDashboardStats | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  useEffect(() => {
    if (!isAuthorized || authLoading) return;
    let isMounted = true;
    const fetchData = async () => {
      try {
        const [statsRes, enrolledRes] = await Promise.allSettled([
          studentApi.getDashboardStats(),
          coursesApi.getEnrolled(),
        ]);

        if (isMounted) {
          if (statsRes.status === 'fulfilled' && statsRes.value.data?.data) {
            setStats(statsRes.value.data.data);
          }
          if (enrolledRes.status === 'fulfilled' && enrolledRes.value.data?.data) {
            setEnrollments(enrolledRes.value.data.data);
          }
        }
      } catch (err) {
        console.error('Lỗi nạp tiến độ học tập:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => {
      isMounted = false;
    };
  }, [authLoading, isAuthorized]);

  const totalCourses = stats?.totalEnrolled ?? enrollments.length;
  const totalCompleted = stats?.totalCompleted ?? enrollments.filter((e) => e.progress >= 100).length;
  const totalWatchHours = stats ? (stats.totalWatchTime / 3600).toFixed(1) : '0';
  const avgProgress = enrollments.length > 0
    ? Math.round(enrollments.reduce((acc, curr) => acc + (curr.progress || 0), 0) / enrollments.length)
    : 0;

  const statItems = [
    {
      label: 'Khóa học đã đăng ký',
      value: `${totalCourses} khóa`,
      icon: BookOpen,
      color: 'text-primary bg-primary/10',
    },
    {
      label: 'Tổng giờ đã học',
      value: `${totalWatchHours}h`,
      icon: Clock,
      color: 'text-emerald-600 bg-emerald-500/10',
    },
    {
      label: 'Khóa học hoàn thành',
      value: `${totalCompleted} khóa`,
      icon: Award,
      color: 'text-amber-600 bg-amber-500/10',
    },
    {
      label: 'Tiến độ trung bình',
      value: `${avgProgress}%`,
      icon: Target,
      color: 'text-violet-600 bg-violet-500/10',
    },
  ];

  if (!isAuthorized || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-xs font-semibold text-muted-foreground">
          Đang kiểm tra quyền truy cập học viên...
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28 md:pb-12">
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push('/dashboard');
              }
            }}
            className="mb-3 gap-1.5"
            title="Quay lại trang trước đó"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Quay lại</span>
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Báo cáo & Tiến độ Học tập</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Dữ liệu học tập thực tế đồng bộ trực tiếp từ cơ sở dữ liệu và Trợ lý AI
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statItems.map((s, idx) => {
            const Icon = s.icon;
            return (
              <Card key={idx}>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${s.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                    {loading ? (
                      <Skeleton className="mt-1 h-5 w-16" />
                    ) : (
                      <p className="mt-0.5 text-xl font-bold text-foreground">{s.value}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Detailed Course Progress */}
        <Card className="rounded-3xl">
          <CardContent className="space-y-6 p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Tiến độ theo khóa học</h2>
              </div>
              <Badge variant="secondary" className="text-xs font-medium">
                {enrollments.length} khóa học
              </Badge>
            </div>

            {loading ? (
              <div className="space-y-4 py-6">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="space-y-3 rounded-2xl bg-muted/50 p-5">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : enrollments.length === 0 ? (
              <div className="space-y-3 py-12 text-center">
                <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/40" />
                <p className="text-sm font-semibold text-foreground">Bạn chưa đăng ký khóa học nào</p>
                <p className="text-xs text-muted-foreground">
                  Tham gia khóa học mới để bắt đầu theo dõi tiến độ học tập và hỏi đáp cùng AI Tutor.
                </p>
                <Button asChild variant="default" size="sm" className="mt-2">
                  <Link href="/courses">Khám phá khóa học</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {enrollments.map((item) => (
                  <div key={item.id} className="space-y-3 rounded-2xl border border-border/80 bg-muted/50 p-5">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                      <h3 className="text-sm font-semibold text-foreground">
                        {item.course?.title || `Khóa học #${item.courseId}`}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs font-semibold">
                          {item.completedLessons ?? 0} / {item.totalLessons ?? 0} bài học
                        </Badge>
                        <Button asChild variant="outline" size="sm" className="h-7 gap-1 rounded-lg px-2.5 text-xs text-primary">
                          <Link href={`/courses/${item.courseId}/learn`}>
                            <Play className="h-3 w-3" />
                            Vào học
                          </Link>
                        </Button>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 rounded-lg border-purple-200 bg-purple-50 px-2.5 text-xs text-purple-700 hover:bg-purple-100"
                          title="Làm đề thi trắc nghiệm ôn tập"
                        >
                          <Link href={`/courses/${item.courseId}/learn?tab=quiz`}>
                            <Award className="h-3 w-3 text-purple-600" />
                            Thi trắc nghiệm
                          </Link>
                        </Button>
                      </div>
                    </div>

                    <ProgressBar progress={item.progress ?? 0} />

                    <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 pt-1 text-xs text-muted-foreground">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <span className="font-semibold text-foreground">Gợi ý từ AI Tutor: </span>
                        <span>
                          {item.progress >= 100
                            ? 'Chúc mừng! Bạn đã hoàn thành toàn bộ khóa học này. Hãy ôn luyện lại các bài trắc nghiệm để củng cố kiến thức vững chắc.'
                            : item.progress > 50
                            ? 'Bạn đang có tiến độ tốt. Hãy tiếp tục học các bài học tiếp theo và đặt câu hỏi cho AI nếu gặp vấn đề chưa hiểu rõ.'
                            : 'Bắt đầu xem video bài giảng và tương tác cùng AI Tutor để ghi nhớ kiến thức tốt nhất.'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
