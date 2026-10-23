'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  RefreshCw,
  Search,
  BookOpen,
  Calendar,
  Clock,
  GraduationCap,
  Mail,
} from 'lucide-react';
import { instructorApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/course/ProgressBar';

interface StudentRow {
  studentId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  courseId: string;
  courseTitle: string;
  progress: number;
  completedLessons: number;
  totalLessons: number;
  enrolledAt: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
}

interface StudentsData {
  students: StudentRow[];
  courses: { id: string; title: string }[];
  summary: { totalEnrollments: number; uniqueStudents: number; totalCourses: number };
}

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function InstructorStudentsPage() {
  const { isAuthorized } = useRoleGuard(['instructor', 'admin']);

  const [data, setData] = useState<StudentsData>({
    students: [],
    courses: [],
    summary: { totalEnrollments: 0, uniqueStudents: 0, totalCourses: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await instructorApi.getStudents();
      const payload = res.data?.data;
      setData({
        students: Array.isArray(payload?.students) ? payload.students : [],
        courses: Array.isArray(payload?.courses) ? payload.courses : [],
        summary:
          payload?.summary || { totalEnrollments: 0, uniqueStudents: 0, totalCourses: 0 },
      });
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Không thể tải danh sách học viên. Vui lòng thử lại.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthorized) void loadStudents();
  }, [isAuthorized, loadStudents]);

  const filteredStudents = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return data.students.filter((row) => {
      const matchesCourse = courseFilter === 'all' || row.courseId === courseFilter;
      const matchesSearch =
        !needle ||
        row.name.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle);
      return matchesCourse && matchesSearch;
    });
  }, [data.students, courseFilter, searchQuery]);

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
          { label: 'Danh sách học viên', variant: 'info' },
          { label: 'Dữ liệu ghi danh thực tế', variant: 'success' },
        ]}
        title="Học viên của tôi"
        description="Học viên đã đăng ký các khóa học bạn phụ trách, kèm tiến độ học tập và mốc hoạt động gần nhất. Dữ liệu được kiểm tra quyền sở hữu ở backend."
        actions={[
          {
            label: 'Làm mới',
            icon: (
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-primary' : ''}`} />
            ),
            onClick: () => void loadStudents(),
            disabled: loading,
          },
        ]}
      />

      {/* ── THỐNG KÊ NHANH ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Học viên duy nhất" value={data.summary.uniqueStudents} accent="primary" />
        <StatCard icon={UserCheck} label="Lượt ghi danh" value={data.summary.totalEnrollments} accent="emerald" />
        <StatCard icon={BookOpen} label="Khóa học có học viên" value={data.summary.totalCourses} accent="violet" />
      </div>

      {/* ── TOOLBAR ── */}
      <Card className="p-4">
        <CardContent className="not-prose flex flex-col items-stretch justify-between gap-3 p-0 sm:flex-row sm:items-center">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Tìm theo tên hoặc email học viên..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="hidden text-xs font-medium text-muted-foreground md:block">
              Lọc theo khóa:
            </label>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Tất cả khóa học ({data.courses.length})</option>
              {data.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
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
                <div className="flex min-w-0 items-center gap-3.5">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                </div>
                <Skeleton className="h-8 w-[380px]" />
              </div>
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState
          message={error}
          actionLabel="Thử lại"
          onAction={() => void loadStudents()}
        />
      ) : data.students.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title="Chưa có học viên nào ghi danh"
          description="Khi học viên đăng ký khóa học bạn phụ trách, danh sách sẽ xuất hiện tại đây."
        />
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="Không tìm thấy học viên phù hợp"
          description="Thử đổi từ khóa tìm kiếm hoặc bộ lọc khóa học."
        />
      ) : (
        <div className="space-y-3">
          {filteredStudents.map((row) => (
            <Card
              key={`${row.courseId}-${row.studentId}`}
              className="transition-colors hover:border-ring/40 hover:shadow-sm"
            >
              <CardContent className="flex flex-col justify-between gap-4 p-4 lg:flex-row lg:items-center sm:p-5">
                <div className="flex min-w-0 items-center gap-3.5">
                  <Avatar className="h-10 w-10 rounded-xl border border-primary/20">
                    <AvatarFallback className="rounded-xl bg-primary/10 text-sm font-black text-primary">
                      {row.name?.trim().charAt(0).toUpperCase() || 'H'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-foreground">{row.name}</h3>
                    <p className="flex truncate items-center gap-1 text-[11px] text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{row.email}</span>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-3 lg:min-w-[520px] lg:gap-6">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Khóa học
                    </p>
                    <Link
                      href={`/courses/${row.courseId}/manage`}
                      className="mt-0.5 block truncate font-bold text-foreground transition-colors hover:text-primary"
                      title={row.courseTitle}
                    >
                      {row.courseTitle}
                    </Link>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Tiến độ
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="w-16 sm:w-20">
                        <ProgressBar
                          value={Math.min(100, Math.max(0, row.progress))}
                          size="sm"
                        />
                      </div>
                      <span className="font-bold text-foreground">
                        {Math.round(row.progress)}%
                      </span>
                    </div>
                    <p className="mt-0.5 text-muted-foreground/70">
                      {row.completedLessons}/{row.totalLessons} bài học
                    </p>
                  </div>

                  <div className="col-span-2 space-y-0.5 text-muted-foreground sm:col-span-1">
                    <p className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-muted-foreground/70" />
                      {row.enrolledAt
                        ? `Đăng ký: ${formatDate(row.enrolledAt)}`
                        : `Bắt đầu học: ${formatDate(row.startedAt)}`}
                    </p>
                    <p className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground/70" /> Hoạt động:{' '}
                      {formatDate(row.lastActivityAt)}
                    </p>
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
