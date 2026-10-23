'use client';

import Link from 'next/link';
import { Award, BookOpen, ClipboardCheck, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { coursesApi, quizApi } from '@/lib/api';
import { Enrollment } from '@/types';
import { useAuth } from '@/lib/auth-context';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type QuizItem = { id: number; title: string; description?: string; questions?: unknown[]; courseId: string; courseTitle: string };

export default function QuizzesPage() {
  const { isAuthorized } = useRoleGuard(['student']);
  const { isLoading: authLoading } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadQuizzes = async () => {
    setLoading(true);
    setError('');
    try {
      const enrolledResponse = await coursesApi.getEnrolled();
      const enrollments: Enrollment[] = enrolledResponse.data?.data || [];
      const results = await Promise.all(enrollments.map(async (enrollment) => {
        const response = await quizApi.listByCourse(enrollment.courseId);
        return (response.data || []).map((quiz: any) => ({
          ...quiz,
          courseId: enrollment.courseId,
          courseTitle: enrollment.course?.title || `Khóa học #${enrollment.courseId}`,
        }));
      }));
      setQuizzes(results.flat());
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Không thể tải bài kiểm tra của các khóa học đã đăng ký.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized && !authLoading) void loadQuizzes();
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
            <h1 className="text-2xl font-black text-foreground">Bài kiểm tra</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Làm bài kiểm tra thuộc các khóa học bạn đã đăng ký.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadQuizzes()}>
            <RefreshCw className="h-4 w-4" /> Làm mới
          </Button>
        </header>

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
          <Card className="border-destructive/30 bg-destructive/10 shadow-none">
            <CardContent className="p-5">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && quizzes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
            <ClipboardCheck className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 font-bold text-foreground">Chưa có bài kiểm tra</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Bài kiểm tra sẽ xuất hiện sau khi giảng viên tạo cho khóa học.
            </p>
          </div>
        )}

        {!loading && !error && quizzes.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {quizzes.map((quiz) => (
              <Card key={`${quiz.courseId}-${quiz.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-primary">{quiz.courseTitle}</p>
                      <h2 className="mt-1 font-bold text-foreground">{quiz.title}</h2>
                    </div>
                    <Award className="h-5 w-5 shrink-0 text-purple-500" />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {quiz.questions?.length || 0} câu hỏi
                  </p>
                  <Button asChild variant="default" size="sm" className="mt-4">
                    <Link href={`/quiz/${quiz.id}?courseId=${quiz.courseId}`}>
                      <BookOpen className="h-4 w-4" /> Làm bài
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
