'use client';

import { Award, CheckCircle2, Clock3, RefreshCw, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { coursesApi, quizApi } from '@/lib/api';
import { Enrollment } from '@/types';
import { useAuth } from '@/lib/auth-context';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type ResultItem = { id: number; quizTitle: string; courseTitle: string; score: number; passed: boolean; submittedAt?: string; totalQuestions?: number };

export default function ResultsPage() {
  const { isAuthorized } = useRoleGuard(['student']);
  const { isLoading: authLoading } = useAuth();
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadResults = async () => {
    setLoading(true); setError('');
    try {
      const response = await coursesApi.getEnrolled();
      const enrollments: Enrollment[] = response.data?.data || [];
      const grouped = await Promise.all(enrollments.map(async (enrollment) => {
        const quizzesResponse = await quizApi.listByCourse(enrollment.courseId);
        const quizzes = quizzesResponse.data || [];
        const nested = await Promise.all(quizzes.map(async (quiz: any) => {
          const submissionsResponse = await quizApi.getSubmissions(quiz.id);
          return (submissionsResponse.data || []).map((submission: any) => ({
            id: submission.id,
            quizTitle: quiz.title,
            courseTitle: enrollment.course?.title || `Khóa học #${enrollment.courseId}`,
            score: Number(submission.score || 0),
            passed: Boolean(submission.passed),
            submittedAt: submission.submitted_at,
            totalQuestions: submission.total_questions,
          }));
        }));
        return nested.flat();
      }));
      setResults(grouped.flat().sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))));
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Không thể tải kết quả học tập.');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (isAuthorized && !authLoading) void loadResults(); }, [authLoading, isAuthorized]);

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
            <h1 className="text-2xl font-black text-foreground">Kết quả học tập</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Điểm và trạng thái các bài kiểm tra bạn đã nộp.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadResults()}>
            <RefreshCw className="h-4 w-4" /> Làm mới
          </Button>
        </header>

        {loading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-9 w-16" />
                </div>
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

        {!loading && !error && results.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
            <Award className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 font-bold text-foreground">Chưa có kết quả</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nộp một bài kiểm tra để xem điểm và lời giải tại đây.
            </p>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {results.map((result) => (
                <div key={result.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-bold text-foreground">{result.quizTitle}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {result.courseTitle}
                      {result.submittedAt ? ` · ${new Date(result.submittedAt).toLocaleString('vi-VN')}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-lg font-black text-primary">{Math.round(result.score * 100)}%</p>
                      <p className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                        <Clock3 className="h-3 w-3" /> {result.totalQuestions || 0} câu
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                        result.passed
                          ? 'bg-emerald-500/10 text-emerald-700'
                          : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {result.passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      {result.passed ? 'Đạt' : 'Chưa đạt'}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
