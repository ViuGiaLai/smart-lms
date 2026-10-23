'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PlusCircle,
  Sparkles,
  BookOpen,
  Users,
  Settings,
  Eye,
  TrendingUp,
  Layers,
} from 'lucide-react';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { instructorApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function InstructorDashboardPage() {
  const { isAuthorized } = useRoleGuard(['instructor', 'admin']);
  const { user: instructorUser, isLoading: authLoading } = useAuth();

  const [courses, setCourses] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthorized || authLoading) return;
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const [coursesRes, statsRes] = await Promise.allSettled([
          instructorApi.getCourses(),
          instructorApi.getDashboardStats(),
        ]);

        if (isMounted) {
          if (coursesRes.status === 'fulfilled' && coursesRes.value.data?.data) {
            const apiCourses = coursesRes.value.data.data.map((c: any) => ({
              id: String(c.id),
              title: c.title,
              category:
                typeof c.category === 'object' && c.category?.name
                  ? c.category.name
                  : typeof c.category === 'string'
                  ? c.category
                  : 'Công nghệ phần mềm',
              studentsCount: c.studentsCount ?? c.totalStudents ?? 0,
              lessonsCount: c.lessons?.length ?? c.totalLessons ?? 0,
              status: c.status === 'published' ? 'Đã xuất bản' : 'Bản nháp',
              thumbnail: c.thumbnail || 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&fit=crop',
            }));
            setCourses(apiCourses);
          }
          if (statsRes.status === 'fulfilled' && statsRes.value.data?.data) {
            setStats(statsRes.value.data.data);
          }
          if (coursesRes.status === 'rejected' || statsRes.status === 'rejected') {
            setError('Không thể tải đầy đủ dữ liệu giảng viên. Vui lòng thử lại.');
          }
        }
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu bảng điều khiển giảng viên:', err);
        if (isMounted) setError('Không thể tải dữ liệu bảng giảng viên. Vui lòng thử lại.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => {
      isMounted = false;
    };
  }, [isAuthorized, authLoading]);

  if (!isAuthorized || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-xs font-semibold text-muted-foreground">
          Đang xác thực quyền Giảng viên...
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans">
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <Badge variant="info" className="mb-1 text-[11px]">
              Phân hệ Giảng viên (Instructor Panel)
            </Badge>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Bảng điều khiển Giảng viên {instructorUser?.name ? `• ${instructorUser.name}` : ''}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Quản lý học liệu, chèn video YouTube, số hóa tài liệu RAG và sử dụng công cụ AI tự động sinh đề thi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button asChild variant="outline" size="default" className="text-primary hover:text-primary">
              <Link href="/quiz/bank">
                <Layers className="h-4 w-4" /> Ngân hàng đề thi
              </Link>
            </Button>

            <Button asChild variant="success" size="default">
              <Link href="/quiz/generate">
                <Sparkles className="h-4 w-4" /> AI Sinh đề trắc nghiệm
              </Link>
            </Button>

            <Button asChild variant="default" size="default">
              <Link href="/courses/create">
                <PlusCircle className="h-4 w-4" /> Tạo khóa học mới
              </Link>
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/30 bg-destructive/10 shadow-none">
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Thống kê hiệu suất giảng dạy & Khảo thí */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Khóa học phụ trách</p>
                <p className="text-xl font-extrabold text-foreground">
                  {loading ? <Skeleton className="h-6 w-14" /> : stats?.totalCourses ?? courses.length}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 font-bold text-emerald-600">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tổng sinh viên theo học</p>
                <p className="text-xl font-extrabold text-foreground">
                  {loading ? (
                    <Skeleton className="h-6 w-14" />
                  ) : (
                    stats?.totalStudents ??
                    courses.reduce((acc, c) => acc + (c.studentsCount || 0), 0)
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="flex h-full flex-row items-center transition-colors hover:border-ring/40">
            <Link href="/quiz/bank" className="flex flex-1 items-center justify-between p-5">
              <span className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 font-bold text-purple-600 transition-colors group-hover:bg-primary group-hover:text-white">
                  <Layers className="h-6 w-6" />
                </span>
                <span className="flex flex-col">
                  <span className="text-xs font-medium text-muted-foreground">Bài nộp học viên</span>
                  <span className="text-xl font-extrabold text-foreground">
                    {loading ? <Skeleton className="h-6 w-14" /> : `${stats?.totalSubmissions ?? 0} lượt`}
                  </span>
                </span>
              </span>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </Link>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 font-bold text-violet-600">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tổng số bài học</p>
                <p className="text-xl font-extrabold text-foreground">
                  {loading ? (
                    <Skeleton className="h-6 w-14" />
                  ) : (
                    `${stats?.totalLessons ?? courses.reduce((acc: number, c: any) => acc + (c.lessonsCount || 0), 0)} bài`
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 font-bold text-amber-600">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Trạng thái AI Tutor & RAG</p>
                <p className="text-xl font-extrabold text-foreground">
                  {loading ? (
                    <Skeleton className="h-6 w-20" />
                  ) : (
                    `${stats?.publishedCourses ?? 0}/${stats?.totalCourses ?? courses.length} xuất bản`
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Danh sách Khóa học đang quản lý */}
        <Card id="courses" tabIndex={-1} className="scroll-mt-24 focus:outline-none">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-base uppercase tracking-wider">
                Khóa học & Học liệu phụ trách
              </CardTitle>
              <CardDescription className="mt-1">
                Bấm Quản lý để thêm bài học, dán link YouTube và nạp tài liệu cho AI Tutor
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-[11px] font-bold">
              {courses.length} khóa học
            </Badge>
          </CardHeader>

          <CardContent className="space-y-6">
            {courses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/40 py-12 text-center">
                <BookOpen className="mb-2 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm font-bold text-foreground">Chưa có khóa học nào được phân công</p>
                <p className="mb-4 mt-1 text-xs text-muted-foreground">
                  Bạn có thể tạo mới khóa học hoặc liên hệ Quản trị viên để phân công chuyên đề.
                </p>
                <Button asChild variant="default" size="sm">
                  <Link href="/courses/create">
                    <PlusCircle className="h-4 w-4" /> Tạo khóa học đầu tiên
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {courses.map((c) => (
                  <Card
                    key={c.id}
                    className="group flex flex-col overflow-hidden transition-colors hover:border-ring/40"
                  >
                    <div className="relative aspect-video w-full overflow-hidden bg-muted">
                      <img
                        src={c.thumbnail}
                        alt={c.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute left-2.5 top-2.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {typeof c.category === 'object' && c.category ? (c.category as any).name : c.category}
                        </Badge>
                      </div>
                      <div className="absolute right-2.5 top-2.5">
                        <Badge variant="success" className="text-[10px]">
                          {c.status}
                        </Badge>
                      </div>
                    </div>

                    <CardContent className="flex flex-1 flex-col justify-between gap-4 p-5">
                      <div className="space-y-2">
                        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">
                          {c.title}
                        </h3>

                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" /> {c.studentsCount} học viên
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3.5 w-3.5" /> {c.lessonsCount} bài học
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="flex-1 text-primary hover:text-primary"
                        >
                          <Link href={`/courses/${c.id}/manage`}>
                            <Settings className="h-3.5 w-3.5" /> Quản lý bài học
                          </Link>
                        </Button>

                        <Button
                          asChild
                          variant="secondary"
                          size="icon-sm"
                          title="Xem trước Focus Player"
                        >
                          <Link href={`/courses/${c.id}/learn?preview=true`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
