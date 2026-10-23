'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Upload,
  RefreshCw,
  Search,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Video,
  ExternalLink,
  Layers,
  Clock,
  Database,
  Settings,
} from 'lucide-react';
import { instructorApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';

interface MaterialLesson {
  id: string;
  title: string;
  order: number;
  duration: number;
  videoUrl: string;
  resourcesUrl: string;
  hasTranscript: boolean;
  chunkCount: number;
  hasMaterial: boolean;
}

interface MaterialCourse {
  id: string;
  title: string;
  status: string;
  totalLessons: number;
  indexedLessons: number;
  lessons: MaterialLesson[];
}

interface MaterialsData {
  courses: MaterialCourse[];
  summary: { totalCourses: number; totalLessons: number; indexedLessons: number };
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface UploadState {
  status: UploadStatus;
  message?: string;
}

export default function InstructorMaterialsPage() {
  const { isAuthorized } = useRoleGuard(['instructor', 'admin']);

  const [data, setData] = useState<MaterialsData>({
    courses: [],
    summary: { totalCourses: 0, totalLessons: 0, indexedLessons: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});

  const loadMaterials = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await instructorApi.getMaterials();
      const payload = res.data?.data;
      setData({
        courses: Array.isArray(payload?.courses) ? payload.courses : [],
        summary:
          payload?.summary || { totalCourses: 0, totalLessons: 0, indexedLessons: 0 },
      });
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Không thể tải danh sách bài học & tài liệu. Vui lòng thử lại.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthorized) void loadMaterials();
  }, [isAuthorized, loadMaterials]);

  const handleUpload = async (courseId: string, lessonId: string, file: File) => {
    const key = `${courseId}:${lessonId}`;
    setUploadStates((prev) => ({
      ...prev,
      [key]: { status: 'uploading', message: `Đang số hóa ${file.name}...` },
    }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await instructorApi.uploadLessonDocument(courseId, lessonId, formData);
      const totalChunks = res.data?.total_chunks ?? res.data?.totalChunks ?? 0;

      setUploadStates((prev) => ({
        ...prev,
        [key]: {
          status: 'success',
          message: `${file.name} đã được nhúng (${totalChunks} đoạn) và gắn với bài học cho AI Tutor.`,
        },
      }));
      // Đồng bộ lại số chunk thực tế từ pgvector sau khi AI Service xử lý.
      await loadMaterials(true);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Không thể tải hoặc xử lý tài liệu. Vui lòng kiểm tra tệp PDF/DOCX/PPTX.';
      setUploadStates((prev) => ({
        ...prev,
        [key]: { status: 'error', message: detail },
      }));
    }
  };

  const filteredCourses = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return data.courses
      .filter((course) => courseFilter === 'all' || course.id === courseFilter)
      .map((course) => {
        if (!needle) return course;
        const courseMatches = course.title.toLowerCase().includes(needle);
        const lessons = course.lessons.filter((lesson) =>
          lesson.title.toLowerCase().includes(needle)
        );
        if (courseMatches) return course;
        return { ...course, lessons };
      })
      .filter((course) => {
        if (!needle) return true;
        return (
          course.title.toLowerCase().includes(needle) || course.lessons.length > 0
        );
      });
  }, [data.courses, courseFilter, searchQuery]);

  const hasAnyCourse = data.courses.length > 0;
  const hasResults = filteredCourses.length > 0;

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
          { label: 'Quản lý chương & bài học', variant: 'info' },
          { label: 'Học liệu RAG · pgvector', variant: 'success' },
        ]}
        title="Bài học & Tài liệu"
        description="Tải PDF/DOCX/PPTX gắn đúng khóa học & bài học để AI Tutor dùng cho RAG. Mỗi tài liệu được bóc tách, tạo embedding và lưu vào cơ sở tri thức theo bài học."
        actions={[
          {
            label: 'Tạo khóa học mới',
            icon: <BookOpen className="h-4 w-4" />,
            href: '/courses/create',
          },
        ]}
      />

      {/* ── THỐNG KÊ NHANH ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={BookOpen} label="Khóa học phụ trách" value={data.summary.totalCourses} accent="primary" />
        <StatCard icon={Layers} label="Tổng số bài học" value={data.summary.totalLessons} accent="violet" />
        <StatCard icon={Database} label="Bài học đã có học liệu RAG" value={data.summary.indexedLessons} accent="emerald" />
      </div>

      {/* ── TOOLBAR ── */}
      <Card className="p-4">
        <CardContent className="flex flex-col items-stretch justify-between gap-3 p-0 sm:flex-row sm:items-center">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Tìm theo tên khóa học hoặc bài học..."
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
        <div className="space-y-5">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="rounded-3xl">
              <div className="space-y-3 border-b border-border bg-muted/50 p-5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <div className="divide-y divide-border">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="flex items-center gap-3 p-4 sm:p-5">
                    <Skeleton className="h-8 w-8 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-9 w-32" />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorState
          message={error}
          actionLabel="Thử lại"
          onAction={() => void loadMaterials()}
        />
      ) : !hasAnyCourse ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="Chưa có khóa học nào để quản lý học liệu"
          description="Hãy tạo khóa học và thêm bài học trước, sau đó bạn có thể tải tài liệu PDF/DOCX cho từng bài học tại đây."
        >
          <Button asChild variant="default" size="sm">
            <Link href="/courses/create">
              <BookOpen className="h-3.5 w-3.5" /> Tạo khóa học đầu tiên
            </Link>
          </Button>
        </EmptyState>
      ) : !hasResults ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="Không tìm thấy kết quả phù hợp"
          description="Thử đổi từ khóa tìm kiếm hoặc bộ lọc khóa học."
        />
      ) : (
        <div className="space-y-5">
          {filteredCourses.map((course) => (
            <Card key={course.id} className="overflow-hidden rounded-3xl">
              {/* Course header */}
              <div className="flex flex-col justify-between gap-3 border-b border-border bg-muted/50 p-5 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="info" className="rounded-md text-[10px] font-bold">
                      Khóa học #{course.id}
                    </Badge>
                    <Badge
                      variant={course.status === 'published' ? 'success' : 'warning'}
                      className="rounded-md text-[10px] font-bold"
                    >
                      {course.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
                    </Badge>
                  </div>
                  <h2 className="mt-1.5 truncate text-sm font-extrabold text-foreground">
                    {course.title}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {course.totalLessons} bài học · {course.indexedLessons} bài đã có học liệu RAG
                  </p>
                </div>

                <Button asChild variant="outline" size="sm" className="shrink-0 text-primary">
                  <Link href={`/courses/${course.id}/manage`}>
                    <Settings className="h-3.5 w-3.5" /> Quản lý bài giảng
                  </Link>
                </Button>
              </div>

              {/* Lessons */}
              {course.lessons.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Khóa học chưa có bài học. Mở{' '}
                  <Link
                    href={`/courses/${course.id}/manage`}
                    className="font-bold text-primary hover:underline"
                  >
                    Quản lý bài giảng
                  </Link>{' '}
                  để thêm chương &amp; bài học mới.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {course.lessons.map((lesson, idx) => {
                    const key = `${course.id}:${lesson.id}`;
                    const state = uploadStates[key];
                    return (
                      <div
                        key={lesson.id}
                        className="flex flex-col justify-between gap-3 p-4 lg:flex-row lg:items-center sm:p-5"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                            {idx + 1}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-xs font-bold leading-snug text-foreground sm:text-sm">
                              {lesson.title}
                            </h3>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3 w-3 text-muted-foreground/70" />
                                {lesson.duration ? `${Math.round(lesson.duration / 60)} phút` : 'Chưa đặt'}
                              </span>

                              {lesson.videoUrl && (
                                <Badge variant="destructive" className="rounded-md px-2 py-0.5 text-[10px] font-semibold">
                                  <Video className="h-3 w-3" /> Video YouTube
                                </Badge>
                              )}

                              {lesson.hasTranscript && (
                                <Badge variant="secondary" className="rounded-md px-2 py-0.5 text-[10px] font-medium">
                                  <FileText className="h-3 w-3" /> Transcript
                                </Badge>
                              )}

                              {lesson.hasMaterial ? (
                                <Badge variant="success" className="rounded-md px-2 py-0.5 text-[10px] font-semibold">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" /> RAG{' '}
                                  {lesson.chunkCount > 0 ? `· ${lesson.chunkCount} đoạn` : ''}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="rounded-md px-2 py-0.5 text-[10px] font-medium">
                                  <AlertCircle className="h-3 w-3 text-muted-foreground/70" /> Chưa có học liệu RAG
                                </Badge>
                              )}

                              {lesson.resourcesUrl && (
                                <Badge
                                  variant="info"
                                  className="max-w-[220px] rounded-md px-2 py-0.5 text-[10px] font-medium"
                                >
                                  <FileText className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{lesson.resourcesUrl}</span>
                                </Badge>
                              )}
                            </div>

                            {state?.message && (
                              <p
                                className={`mt-2 text-[11px] ${
                                  state.status === 'error'
                                    ? 'text-destructive'
                                    : state.status === 'success'
                                      ? 'text-emerald-600'
                                      : 'text-muted-foreground'
                                }`}
                              >
                                {state.message}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 self-end lg:self-center">
                          <label
                            className={cn(
                              buttonVariants({ variant: 'outline', size: 'sm' }),
                              'cursor-pointer',
                              state?.status === 'uploading'
                                ? 'pointer-events-none text-muted-foreground'
                                : 'text-primary'
                            )}
                            title="Chọn tệp tài liệu PDF/DOCX/PPTX cho bài học"
                          >
                            {state?.status === 'uploading' ? (
                              <>
                                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                Đang xử lý
                              </>
                            ) : (
                              <>
                                <Upload className="h-3.5 w-3.5" /> Tải PDF/DOCX
                              </>
                            )}
                            <input
                              type="file"
                              accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                              className="hidden"
                              disabled={state?.status === 'uploading'}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleUpload(course.id, lesson.id, file);
                                e.currentTarget.value = '';
                              }}
                            />
                          </label>

                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            title="Mở phòng học của học viên"
                          >
                            <Link
                              href={`/courses/${course.id}/learn?lessonId=${lesson.id}`}
                              target="_blank"
                            >
                              <ExternalLink className="h-3.5 w-3.5" /> Xem
                            </Link>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
