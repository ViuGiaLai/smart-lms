'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  RefreshCw,
  Search,
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  FileCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { instructorApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';

interface SubmissionRow {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  quizId: string;
  quizTitle: string;
  courseId: string;
  courseTitle: string;
  score: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  timeSpent: number | null;
  submittedAt: string | null;
}

interface SubmissionsData {
  submissions: SubmissionRow[];
  quizzes: { id: string; title: string; courseId: string; courseTitle: string }[];
  summary: {
    totalSubmissions: number;
    uniqueStudents: number;
    passedSubmissions: number;
    averageScore: number;
  };
}

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (seconds: number | null) => {
  if (!seconds || seconds <= 0) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs} giây`;
  return `${mins} phút ${secs.toString().padStart(2, '0')} giây`;
};

export default function InstructorResultsPage() {
  const { isAuthorized } = useRoleGuard(['instructor', 'admin']);

  const [data, setData] = useState<SubmissionsData>({
    submissions: [],
    quizzes: [],
    summary: { totalSubmissions: 0, uniqueStudents: 0, passedSubmissions: 0, averageScore: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [quizFilter, setQuizFilter] = useState('all');

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await instructorApi.getSubmissions();
      const payload = res.data?.data;
      setData({
        submissions: Array.isArray(payload?.submissions) ? payload.submissions : [],
        quizzes: Array.isArray(payload?.quizzes) ? payload.quizzes : [],
        summary:
          payload?.summary || {
            totalSubmissions: 0,
            uniqueStudents: 0,
            passedSubmissions: 0,
            averageScore: 0,
          },
      });
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Không thể tải danh sách bài làm. Vui lòng thử lại.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthorized) void loadSubmissions();
  }, [isAuthorized, loadSubmissions]);

  const courseOptions = useMemo(() => {
    const map = new Map<string, string>();
    data.submissions.forEach((row) => map.set(row.courseId, row.courseTitle));
    return Array.from(map, ([id, title]) => ({ id, title }));
  }, [data.submissions]);

  const quizOptions = useMemo(() => {
    return data.quizzes.filter((quiz) => courseFilter === 'all' || quiz.courseId === courseFilter);
  }, [data.quizzes, courseFilter]);

  const filteredSubmissions = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return data.submissions.filter((row) => {
      const matchesCourse = courseFilter === 'all' || row.courseId === courseFilter;
      const matchesQuiz = quizFilter === 'all' || row.quizId === quizFilter;
      const matchesSearch =
        !needle ||
        row.studentName.toLowerCase().includes(needle) ||
        row.studentEmail.toLowerCase().includes(needle) ||
        row.quizTitle.toLowerCase().includes(needle);
      return matchesCourse && matchesQuiz && matchesSearch;
    });
  }, [data.submissions, courseFilter, quizFilter, searchQuery]);

  const passRate =
    data.summary.totalSubmissions > 0
      ? Math.round((data.summary.passedSubmissions / data.summary.totalSubmissions) * 100)
      : 0;

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans">
        <div className="animate-pulse text-xs font-semibold text-muted-foreground">
          Đang xác thực quyền Giảng viên...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 pb-16 font-sans sm:px-6 lg:px-8">
      {/* ── HEADER ── */}
      <PageHeader
        badges={[
          { label: 'Khảo thí & chấm điểm', variant: 'info' },
          { label: 'Kết quả từ PostgreSQL', variant: 'success' },
        ]}
        title="Bài làm & Kết quả"
        description="Bài nộp, điểm số và trạng thái đạt/chưa đạt của các khóa học bạn được phép quản lý. Dữ liệu chỉ thuộc phạm vi khóa học do giảng viên phụ trách."
        actions={[
          {
            label: 'Làm mới',
            icon: (
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-primary' : ''}`} />
            ),
            onClick: () => void loadSubmissions(),
            disabled: loading,
          },
        ]}
      />

      {/* ── THỐNG KÊ NHANH ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={FileCheck} label="Tổng lượt nộp" value={data.summary.totalSubmissions} accent="primary" />
        <StatCard icon={Users} label="Học viên đã làm bài" value={data.summary.uniqueStudents} accent="violet" />
        <StatCard icon={Award} label="Tỉ lệ đạt" value={`${passRate}%`} accent="emerald" />
        <StatCard icon={TrendingUp} label="Điểm trung bình" value={`${data.summary.averageScore}%`} accent="amber" />
      </div>

      {/* ── TOOLBAR ── */}
      <Card className="p-4">
        <CardContent className="flex flex-col items-stretch justify-between gap-3 p-0 lg:flex-row lg:items-center">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Tìm theo tên/email học viên hoặc đề thi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <select
              value={courseFilter}
              onChange={(e) => {
                setCourseFilter(e.target.value);
                setQuizFilter('all');
              }}
              className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Tất cả khóa học ({courseOptions.length})</option>
              {courseOptions.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>

            <select
              value={quizFilter}
              onChange={(e) => setQuizFilter(e.target.value)}
              className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Tất cả đề thi ({quizOptions.length})</option>
              {quizOptions.map((quiz) => (
                <option key={quiz.id} value={quiz.id}>
                  {quiz.title}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* ── NỘI DUNG ── */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-4 sm:p-5">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-16 rounded-lg" />
                  </div>
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
                <Skeleton className="h-8 w-[300px]" />
              </div>
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState
          message={error}
          actionLabel="Thử lại"
          onAction={() => void loadSubmissions()}
        />
      ) : data.submissions.length === 0 ? (
        <EmptyState
          icon={<Award className="h-6 w-6" />}
          title="Chưa có bài nộp nào"
          description="Khi học viên nộp bài kiểm tra trắc nghiệm của khóa học bạn phụ trách, kết quả sẽ hiển thị tại đây."
        />
      ) : filteredSubmissions.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="Không tìm thấy bài làm phù hợp"
          description="Thử đổi từ khóa tìm kiếm hoặc bộ lọc."
        />
      ) : (
        <div className="space-y-3">
          {filteredSubmissions.map((row) => (
            <Card
              key={row.id}
              className="transition-colors hover:border-ring/40 hover:shadow-sm"
            >
              <CardContent className="flex flex-col justify-between gap-4 p-4 lg:flex-row lg:items-center sm:p-5">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-bold text-foreground">{row.studentName}</h3>
                    <Badge
                      variant={row.passed ? 'success' : 'destructive'}
                      className="rounded-lg px-2 py-0.5 text-[10px] font-bold"
                    >
                      {row.passed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {row.passed ? 'Đạt' : 'Chưa đạt'}
                    </Badge>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{row.studentEmail}</p>
                  <p className="flex truncate items-center gap-1 text-[11px] text-muted-foreground">
                    <BookOpen className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                    <span className="truncate">{row.courseTitle}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="truncate font-medium text-foreground/80">{row.quizTitle}</span>
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 text-[11px] lg:min-w-[420px] lg:gap-6">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Điểm
                    </p>
                    <p
                      className={`mt-0.5 text-lg font-black ${
                        row.passed ? 'text-emerald-600' : 'text-destructive'
                      }`}
                    >
                      {Math.round(row.score)}%
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Số câu đúng
                    </p>
                    <p className="mt-1 font-bold text-foreground">
                      {row.correctCount}/{row.totalQuestions} câu
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Thời gian / Nộp lúc
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-foreground/80">
                      <Clock className="h-3 w-3 text-muted-foreground/70" /> {formatDuration(row.timeSpent)}
                    </p>
                    <p className="text-muted-foreground">{formatDateTime(row.submittedAt)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
