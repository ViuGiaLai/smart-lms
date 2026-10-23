'use client';

import Link from 'next/link';
import { BookOpen, Play, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { coursesApi } from '@/lib/api';
import { Enrollment } from '@/types';
import { useAuth } from '@/lib/auth-context';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgressBar } from '@/components/course/ProgressBar';

export default function MyCoursesPage() {
  const { isAuthorized } = useRoleGuard(['student']);
  const { isLoading: authLoading } = useAuth();
  const [items, setItems] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  if (!isAuthorized || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Đang kiểm tra quyền học viên...
      </div>
    );
  }

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-foreground">Khóa học của tôi</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Các khóa học bạn đã đăng ký và tiến độ thực tế.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadCourses()}>
            <RefreshCw className="h-4 w-4" /> Làm mới
          </Button>
        </header>

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
          <Card className="border-destructive/30 bg-destructive/10 shadow-none">
            <CardContent className="p-5">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <h2 className="mt-3 font-bold text-foreground">Bạn chưa có khóa học nào</h2>
            <Button asChild variant="default" size="sm" className="mt-4">
              <Link href="/courses">Khám phá khóa học</Link>
            </Button>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-5">
                  <h2 className="text-base font-bold text-foreground">
                    {item.course?.title || `Khóa học #${item.courseId}`}
                  </h2>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {item.completedLessons || 0}/{item.totalLessons || 0} bài học đã hoàn thành
                  </p>
                  <div className="mt-3">
                    <ProgressBar value={Math.min(100, item.progress || 0)} size="sm" />
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-bold text-primary">{item.progress || 0}%</span>
                    <Button asChild variant="outline" size="sm" className="text-primary hover:bg-primary/10">
                      <Link href={`/courses/${item.courseId}/learn`}>
                        <Play className="h-3.5 w-3.5" /> Tiếp tục học
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
