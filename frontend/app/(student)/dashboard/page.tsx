'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { studentApi, coursesApi } from '@/lib/api';
import { StudentDashboardStats, Enrollment } from '@/types';
import { ProgressBar } from '@/components/course/ProgressBar';
import {
  BookOpen,
  Clock,
  Award,
  Flame,
  TrendingUp,
  Play,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Calendar,
  Compass,
  GraduationCap,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { PageSkeleton } from '@/components/ui/page-skeleton';

export default function StudentDashboardPage() {
  const { isAuthorized } = useRoleGuard(['student']);
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const [userName, setUserName] = useState('Học viên');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    if (currentUser) {
      // Bỏ hậu tố vai trò trong tên hiển thị, ví dụ "Nguyễn Văn An (Sinh viên)".
      const rawName = currentUser.fullName || currentUser.name;
      if (rawName) setUserName(rawName.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim());
      if (currentUser.email) setUserEmail(currentUser.email);
    }
  }, [currentUser]);

  const { data: stats, isLoading: statsLoading } = useQuery<StudentDashboardStats>({
    queryKey: ['student', 'dashboard'],
    queryFn: async () => {
      const res = await studentApi.getDashboardStats();
      return res.data.data;
    },
    enabled: isAuthorized,
  });

  const { data: enrolledData, isLoading: enrolledLoading } = useQuery<{ data: Enrollment[] }>({
    queryKey: ['courses', 'enrolled'],
    queryFn: async () => {
      const res = await coursesApi.getEnrolled();
      return res.data;
    },
    // Chỉ gọi khi đã xác thực — tránh 401 hàng loạt lúc mới mở trang.
    enabled: isAuthorized,
  });

  const { data: masteryData } = useQuery({
    queryKey: ['student', 'mastery'],
    queryFn: async () => {
      const res = await studentApi.getMastery();
      return res.data?.data;
    },
    enabled: isAuthorized,
  });

  const rawEnrollments = enrolledData?.data ?? [];
  const enrollments = rawEnrollments;

  const formatWatchTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${minutes} phút`;
    return `${hours}h ${minutes}p`;
  };

  const statCards = [
    {
      icon: BookOpen,
      label: 'Đang theo học',
      value: stats?.totalEnrolled ?? enrollments.length,
      color: 'bg-primary/10 text-primary border-primary/20',
    },
    {
      icon: Award,
      label: 'Đã hoàn thành',
      value: stats?.totalCompleted ?? 0,
      color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    },
    {
      icon: Clock,
      label: 'Thời gian học',
      value: stats ? formatWatchTime(stats.totalWatchTime) : '0 phút',
      color: 'bg-clay-500/10 text-clay-600 border-clay-500/20',
    },
    {
      icon: Flame,
      label: 'Chuỗi ngày học',
      value: stats?.currentStreak ?? 0,
      color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    },
  ];

  // Khóa học đang học dở gần nhất (Hero active course)
  const activeEnrollment = enrollments[0];
  const overallProgress =
    enrollments.length > 0
      ? Math.round(enrollments.reduce((acc, curr) => acc + (curr.progress || 0), 0) / enrollments.length)
      : (stats?.totalCompleted ? 100 : 0);

  if (!isAuthorized || authLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="pb-32 font-sans md:pb-16">
      <main className="mx-auto max-w-7xl space-y-5 px-3.5 pt-4 sm:space-y-8 sm:px-6 sm:pt-8 lg:px-8">
        {/* ── 1. Header Cá Nhân Hóa (Mobile-First Greeting Bar) ── */}
        <Card className="flex flex-col justify-between gap-3.5 p-4 sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11 shrink-0 sm:h-14 sm:w-14">
              <AvatarFallback className="bg-primary text-base font-semibold text-primary-foreground sm:text-xl">
                {userName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-bold tracking-tight text-foreground sm:text-2xl">
                  Xin chào, {userName}
                </h1>
                <Badge variant="info" className="hidden text-[11px] sm:inline-block">
                  Học viên Smart LMS
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground sm:text-xs">
                Chào mừng bạn quay lại. Tiếp tục bài học hôm nay cùng Gia sư AI thông minh 24/7!
              </p>
            </div>
          </div>

          {/* Huy hiệu chuỗi ngày và nút hành động nhanh */}
          <div className="flex items-center justify-between gap-2.5 border-t border-border pt-2 sm:justify-end sm:border-t-0 sm:pt-0">
            <Badge
              variant="warning"
              className="gap-1.5 rounded-md border border-clay-200 bg-clay-50 px-3 py-1.5 text-xs font-medium text-clay-800"
            >
              <Flame className="h-4 w-4 animate-pulse fill-amber-500 text-amber-500" />
              <span>
                {(stats?.currentStreak ?? 0) > 0
                  ? `Chuỗi ${stats?.currentStreak} ngày 🔥`
                  : 'Bắt đầu chuỗi hôm nay'}
              </span>
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link href="/courses">
                <Compass className="h-3.5 w-3.5" />
                <span>Khám phá thêm</span>
              </Link>
            </Button>
          </div>
        </Card>

        {/* ── 2. Chỉ Số Học Tập Tinh Gọn (Space-Efficient Stats) ── */}
        {/* Trên Mobile: Thiết kế 4 cột gọn gàng không chiếm diện tích cuộn */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            const valueIsLoading = statsLoading || (!stats && card.label === 'Đang theo học');
            return (
              <Card key={card.label} className="flex items-center gap-3 p-3 sm:block sm:p-4">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border sm:mb-2.5 sm:h-10 sm:w-10 ${card.color}`}>
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-bold leading-none text-foreground sm:text-2xl">
                    {card.label === 'Thời gian học' && statsLoading ? (
                      <Skeleton className="h-5 w-12" />
                    ) : valueIsLoading && statsLoading ? (
                      <Skeleton className="h-5 w-8" />
                    ) : (
                      card.value
                    )}
                  </div>
                  <div className="mt-1 truncate text-[10px] font-medium text-muted-foreground sm:text-xs">
                    {card.label}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* ── 3. KHỐI TIẾP TỤC HỌC CHÍNH (HERO RESUME CARD) ── */}
        {activeEnrollment && (
          <Card className="space-y-4 border-primary/20 p-4 shadow-md shadow-primary/10 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 animate-ping rounded-full bg-emerald-500" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-primary sm:text-sm">
                  Bài học đang tiếp diễn
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground">
                {activeEnrollment.lastAccessedAt
                  ? formatDistanceToNow(new Date(activeEnrollment.lastAccessedAt), {
                      addSuffix: true,
                      locale: vi,
                    })
                  : 'Gần đây'}
              </span>
            </div>

            <div className="flex flex-col items-start justify-between gap-4 rounded-lg bg-muted/50 p-3.5 md:flex-row md:items-center sm:p-4">
              <div className="flex w-full items-center gap-3.5 md:w-auto">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted shadow-sm sm:h-20 sm:w-20">
                  <Image
                    src={
                      activeEnrollment.course.thumbnail ||
                      'https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_800/smart-lms/courses/python-ai.jpg'
                    }
                    alt={activeEnrollment.course.title}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Play className="h-5 w-5 fill-white text-white" />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <Badge variant="info" className="mb-1 rounded-md text-[10px] font-bold">
                    {activeEnrollment.completedLessons
                      ? `Đang học bài ${(activeEnrollment.completedLessons || 0) + 1}`
                      : 'Bắt đầu bài học đầu tiên'}
                  </Badge>
                  <h3 className="line-clamp-1 text-xs font-bold leading-snug text-foreground sm:text-base">
                    {activeEnrollment.course.title}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Đã hoàn thành {activeEnrollment.completedLessons ?? 0}/
                    {activeEnrollment.totalLessons ?? 0} bài học
                  </p>
                </div>
              </div>

              {/* Tiến độ & nút CTA nổi bật */}
              <div className="w-full space-y-2 border-t border-border/60 pt-2 md:w-80 md:border-t-0 md:pt-0">
                <ProgressBar
                  value={activeEnrollment.progress}
                  showLabel
                  label="Tiến độ khóa học"
                  size="sm"
                />

                <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                  <Button asChild variant="default" size="default" className="text-xs font-bold sm:text-sm">
                    <Link href={`/courses/${activeEnrollment.courseId}/learn`}>
                      <Play className="fill-white" />
                      <span>Học tiếp ngay</span>
                    </Link>
                  </Button>

                  <Button asChild variant="outline" size="default" className="text-xs font-bold">
                    <Link
                      href={`/courses/${activeEnrollment.courseId}/learn?ask=${encodeURIComponent(
                        'Tóm tắt nội dung chính của bài học này'
                      )}`}
                    >
                      <Sparkles className="text-primary" />
                      <span>Hỏi AI bài này</span>
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ── 3b. Trạng thái chưa ghi danh khóa nào ── */}
        {!activeEnrollment && !enrolledLoading && (
          <Card className="border-dashed border-border bg-card p-6 sm:p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Compass className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Bạn chưa bắt đầu khóa học nào
                </h2>
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                  Khám phá danh mục khóa học và chọn một khóa phù hợp. Tiến độ học tập và Gia sư AI
                  sẽ xuất hiện ngay tại đây.
                </p>
              </div>
              <Button asChild size="sm" className="mt-1">
                <Link href="/courses">
                  Khám phá khóa học
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </Card>
        )}

        {/* ── 4. Lối Tắt Gia Sư AI Tức Thì (Mobile Quick Ask Widget) ── */}
        <Card className="space-y-3 border border-brand-900 bg-brand-950 p-4 text-brand-50 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold sm:text-sm">Trợ lý Gia sư ảo AI 24/7</h3>
                <p className="text-[10px] text-brand-200">
                  Đồng hành giải đáp kiến thức theo đúng tài liệu slide bài học
                </p>
              </div>
            </div>
            <Badge
              variant="secondary"
              className="border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300"
            >
              Sẵn sàng
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {[
              {
                label: '💡 Tóm tắt kiến thức trọng tâm',
                ask: 'Tóm tắt những kiến thức trọng tâm của bài học này',
              },
              {
                label: '❓ Luyện câu hỏi trắc nghiệm ôn tập',
                ask: 'Tạo 5 câu hỏi trắc nghiệm ôn tập từ nội dung bài học này kèm đáp án',
              },
              {
                label: '🔍 Giải thích khái niệm chuyên sâu',
                ask: 'Giải thích chuyên sâu khái niệm quan trọng nhất trong bài học này',
              },
            ].map((chip) => (
              <Button
                key={chip.label}
                asChild
                variant="outline"
                size="sm"
                className="border-white/10 bg-white/10 text-[11px] font-medium text-brand-100 hover:bg-white/20 hover:text-white"
              >
                <Link
                  href={
                    activeEnrollment
                      ? `/courses/${activeEnrollment.courseId}/learn?ask=${encodeURIComponent(chip.ask)}`
                      : '/courses'
                  }
                >
                  <span>{chip.label}</span>
                </Link>
              </Button>
            ))}
          </div>
        </Card>

        {/* ── 4.5. Phân Tích Năng Lực Thực Tế & Điểm Cần Cải Thiện (Master Spec Điểm 2 & XII) ── */}
        {masteryData && masteryData.courses && masteryData.courses.length > 0 && (
          <Card className="border-brand-200 bg-linear-to-r from-brand-50/40 via-white to-amber-50/30 p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-stone-200/60">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-xs">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Phân tích Năng lực Thực tế & Điểm Yếu (AI Mastery)</h3>
                  <p className="text-[11px] text-stone-500">
                    Không chỉ đo % thời lượng xem video; AI phát hiện kiến thức nào bạn đã vững và dạng bài nào cần ôn thêm.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-stone-600">Độ thành thạo chung:</span>
                <Badge variant={masteryData.overallMastery >= 75 ? 'success' : 'warning'} className="text-xs font-bold px-2.5 py-0.5">
                  {masteryData.overallMastery}%
                </Badge>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {masteryData.courses.slice(0, 2).map((c: any) => (
                <div key={c.courseId} className="bg-white rounded-lg p-3.5 border border-stone-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900 truncate max-w-[220px]">{c.courseTitle}</span>
                    <Badge variant="outline" className="text-[10px]">{c.gradeLabel || c.category}</Badge>
                  </div>

                  {/* Điểm mạnh */}
                  {c.strongAreas && c.strongAreas.length > 0 && (
                    <div className="text-[11px] text-emerald-800 bg-emerald-50/60 p-2 rounded border border-emerald-100 flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Đã nắm vững: </span>
                        <span>{c.strongAreas.slice(0, 2).join(', ')}</span>
                      </div>
                    </div>
                  )}

                  {/* Điểm cần lưu ý / gợi ý */}
                  {c.needsReviewAreas && c.needsReviewAreas.length > 0 ? (
                    <div className="text-[11px] text-amber-900 bg-amber-50/60 p-2 rounded border border-amber-200 flex items-start gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Cần củng cố: </span>
                        <span>{c.needsReviewAreas[0]}</span>
                        <p className="mt-0.5 text-[10px] text-amber-700">
                          {c.topics?.find((t: any) => t.topicName === c.needsReviewAreas[0])?.recommendedNextStep || 'Hỏi thêm Gia sư AI để củng cố dạng bài này'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-stone-500 bg-stone-50 p-2 rounded">
                      Phong độ rất tốt! Hãy tiếp tục duy trì và làm các bài kiểm tra tiếp theo.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── 5. Danh Sách Các Khóa Học Khác & Thanh Tiến Độ ── */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3 sm:gap-8">
          {/* Cột trái: Khóa học đã đăng ký */}
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-foreground sm:text-base">
                <BookOpen className="h-4 w-4 text-primary" />
                Khóa học của bạn ({enrollments.length})
              </h2>
              <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary">
                <Link href="/my-courses">
                  Xem tất cả <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            <div className="space-y-3">
              {enrolledLoading
                ? [...Array(3)].map((_, i) => (
                    <Card key={i} className="flex items-center gap-3 p-3.5 sm:p-4">
                      <Skeleton className="h-14 w-14 shrink-0 rounded-lg sm:h-16 sm:w-16" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3.5 w-3/4" />
                      </div>
                    </Card>
                  ))
                : enrollments.map((enrollment) => (
                    <Card
                      key={enrollment.id}
                      className="flex flex-col justify-between gap-3.5 p-3.5 transition-colors hover:border-ring/40 sm:flex-row sm:items-center sm:p-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-16 sm:w-16">
                          <Image
                            src={
                              enrollment.course.thumbnail ||
                              'https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_800/smart-lms/courses/nextjs-ui.jpg'
                            }
                            alt={enrollment.course.title}
                            fill
                            unoptimized
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="rounded-md text-[10px] font-bold">
                              {enrollment.course.category?.name || 'Công nghệ'}
                            </Badge>
                            {enrollment.progress >= 100 && (
                              <Badge variant="success" className="rounded-md text-[10px] font-bold">
                                <CheckCircle2 className="h-3 w-3" /> Hoàn thành
                              </Badge>
                            )}
                          </div>
                          <h4 className="mt-1 truncate text-xs font-bold text-foreground sm:text-sm">
                            {enrollment.course.title}
                          </h4>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Giảng viên: {enrollment.course.instructor?.fullName || 'Chưa cập nhật'}
                          </p>
                        </div>
                      </div>

                      <div className="flex w-full items-center justify-between gap-3 border-t border-border pt-2 sm:w-auto sm:justify-end sm:border-t-0 sm:pt-0">
                        <div className="w-28 sm:w-32">
                          <ProgressBar value={enrollment.progress} showLabel size="sm" />
                        </div>
                        <Button asChild variant="outline" size="sm" className="text-primary hover:bg-primary hover:text-primary-foreground">
                          <Link href={`/courses/${enrollment.courseId}/learn`}>
                            <Play className="h-3.5 w-3.5" />
                            <span>Vào học</span>
                          </Link>
                        </Button>
                      </div>
                    </Card>
                  ))}
            </div>
          </div>

          {/* Cột phải: Lịch học tuần & Thành tích */}
          <div className="space-y-4">
            {/* Lịch chuỗi ngày học trong tuần */}
            {(() => {
              const daysLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
              const todayDayIndex = (new Date().getDay() + 6) % 7;
              const streakVal = stats?.currentStreak ?? 0;
              const activeDaysCount =
                streakVal > 0 ? Math.min(todayDayIndex + 1, streakVal) : 0;
              const weekDays = daysLabels.map((day, idx) => ({
                day,
                isToday: idx === todayDayIndex,
                active: idx <= todayDayIndex && idx > todayDayIndex - activeDaysCount,
              }));

              return (
                <Card className="space-y-3 p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-foreground">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span>Tuần này ({activeDaysCount}/7 ngày)</span>
                    </div>
                    <Badge variant="warning" className="text-[11px] font-semibold">
                      🔥 Đang duy trì {streakVal} ngày
                    </Badge>
                  </div>

                  {/* 7 ngày trong tuần */}
                  <div className="grid grid-cols-7 gap-1.5 pt-1 text-center">
                    {weekDays.map((d, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <span
                          className={`text-[10px] font-medium ${d.isToday ? 'font-bold text-primary' : 'text-muted-foreground'}`}
                        >
                          {d.day}
                        </span>
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition ${
                            d.active
                              ? 'bg-clay-500 text-white'
                              : d.isToday
                                ? 'border-2 border-dashed border-primary/50 bg-primary/5 text-primary'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {d.active ? <Flame className="h-4 w-4 fill-white" /> : d.isToday ? 'Hôm nay' : '•'}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="pt-1 text-center text-[10px] text-muted-foreground">
                    {activeDaysCount >= 7
                      ? 'Xuất sắc! Bạn đã duy trì chuỗi học tập trọn vẹn cả tuần!'
                      : activeDaysCount === 0
                        ? 'Học bài đầu tiên hôm nay để bắt đầu chuỗi ngày học của bạn!'
                        : 'Vào bài học hôm nay để tiếp tục tích lũy kiến thức cùng Gia sư AI!'}
                  </p>
                </Card>
              );
            })()}

            {/* Thống kê tỷ lệ hoàn thành */}
            <Card className="space-y-3 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-foreground sm:text-sm">Tiến độ tổng quan</h3>
              </div>
              <div className="space-y-2.5">
                <ProgressBar value={overallProgress} showLabel label="Hoàn thành mục tiêu" />

                <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                  <Button asChild variant="ghost" size="sm" className="px-0 text-primary hover:text-primary">
                    <Link href="/progress">
                      Xem báo cáo tiến độ chi tiết <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
