'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  UploadCloud,
  Youtube,
} from 'lucide-react';
import { adminApi, coursesApi, instructorApi, youtubeApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/ui/page-header';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { cn } from '@/lib/utils';

type SourceType = 'video' | 'playlist' | 'channel';

interface YouTubeVideo {
  videoId: string;
  title: string;
  description?: string;
  thumbnail: string;
  durationSeconds: number;
  channelTitle: string;
  publishedAt?: string | null;
  url: string;
  available: boolean;
  unavailableReason?: string;
}

interface AnalyzeData {
  sourceType: SourceType;
  sourceId: string;
  title: string;
  channelTitle: string;
  videos: YouTubeVideo[];
  skipped: Array<{ videoId: string; title: string; reason: string }>;
  total: number;
  truncated: boolean;
  cached: boolean;
}

interface CourseOption {
  id: string;
  title: string;
  status?: string;
}

interface SubtitleInfo {
  status: 'none' | 'ready' | 'ingested' | 'failed' | 'missing' | string;
  language: string | null;
  hasSubtitle: boolean;
  checksum: string | null;
  error: string | null;
}

interface LessonItem {
  id: string;
  title: string;
  orderIndex: number;
  duration: number;
  videoUrl: string;
  youtubeVideoId: string;
  transcriptLength: number;
  subtitle: SubtitleInfo;
}

type ImportState = 'idle' | 'importing' | 'created' | 'exists' | 'error';

interface ImportResult {
  state: ImportState;
  message?: string;
  lessonId?: string;
}

const PAGE_SIZE = 8;
const COVER_PRESETS = [
  'https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/python-ai.jpg',
  'https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/fastapi-db.jpg',
  'https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/nextjs-ui.jpg',
  'https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/cloud-devops.jpg',
];

const levelLabels: Record<string, string> = {
  beginner: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
};

function formatDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function statusBadge(status: string) {
  switch (status) {
    case 'ingested':
      return { label: 'Đã nhúng AI', variant: 'success' as const };
    case 'ready':
      return { label: 'Đã lưu SRT', variant: 'info' as const };
    case 'failed':
      return { label: 'Lỗi nhúng', variant: 'destructive' as const };
    case 'missing':
      return { label: 'Không có phụ đề', variant: 'warning' as const };
    default:
      return { label: 'Chưa có phụ đề', variant: 'secondary' as const };
  }
}

export default function YouTubeImportPage() {
  const { isAuthorized } = useRoleGuard(['admin', 'instructor']);
  const { user, isLoading: authLoading } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<'source' | 'subtitles'>('source');

  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [courseId, setCourseId] = useState('');
  const [coursesLoading, setCoursesLoading] = useState(true);

  // ── Phân tích nguồn ──
  const [sourceUrl, setSourceUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [source, setSource] = useState<AnalyzeData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // ── Tạo khóa học mới ──
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Công nghệ thông tin');
  const [newLevel, setNewLevel] = useState('beginner');
  const [newPrice, setNewPrice] = useState('0');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Import ──
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<Record<string, ImportResult>>({});

  // ── Phụ đề ──
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [busyLesson, setBusyLesson] = useState<string | null>(null);
  const [subtitleLanguage, setSubtitleLanguage] = useState('vi');
  const [subtitleLanguages, setSubtitleLanguages] = useState<string[]>(['vi', 'en']);
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);

  const loadCourses = useCallback(async () => {
    setCoursesLoading(true);
    try {
      const res = isAdmin ? await adminApi.getCourses() : await instructorApi.getCourses();
      const raw = res.data?.data ?? res.data ?? [];
      const list: CourseOption[] = (Array.isArray(raw) ? raw : []).map((course: any) => ({
        id: String(course.id),
        title: course.title,
        status: course.status,
      }));
      setCourses(list);
      setCourseId((current) => current || list[0]?.id || '');
    } catch (err: any) {
      setNotice({
        kind: 'error',
        text: err?.response?.data?.detail || 'Không tải được danh sách khóa học.',
      });
    } finally {
      setCoursesLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAuthorized || authLoading) return;
    void loadCourses();
    youtubeApi
      .getStatus()
      .then((res) => {
        const data = res.data?.data || {};
        setSubtitleEnabled(Boolean(data.subtitleEnabled));
        if (Array.isArray(data.subtitleLanguages) && data.subtitleLanguages.length) {
          setSubtitleLanguages(data.subtitleLanguages);
          setSubtitleLanguage(data.subtitleLanguages[0]);
        }
      })
      .catch(() => undefined);
  }, [authLoading, isAuthorized, loadCourses]);

  const filteredVideos = useMemo(() => {
    const list = source?.videos ?? [];
    const keyword = search.trim().toLowerCase();
    if (!keyword) return list;
    return list.filter((video) =>
      `${video.title} ${video.channelTitle}`.toLowerCase().includes(keyword),
    );
  }, [source, search]);

  const totalPages = Math.max(1, Math.ceil(filteredVideos.length / PAGE_SIZE));
  const pageVideos = filteredVideos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const availableOnPage = pageVideos.filter((video) => video.available).map((v) => v.videoId);
  const allPageSelected =
    availableOnPage.length > 0 && availableOnPage.every((id) => selected.has(id));
  const allAvailableIds = (source?.videos ?? [])
    .filter((video) => video.available)
    .map((video) => video.videoId);
  const allSelected =
    allAvailableIds.length > 0 && allAvailableIds.every((id) => selected.has(id));

  const handleAnalyze = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setAnalyzeError('');
    setSource(null);
    setResults({});
    setSelected(new Set());
    if (!sourceUrl.trim()) {
      setAnalyzeError('Vui lòng nhập liên kết YouTube.');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await youtubeApi.analyze(sourceUrl.trim());
      const data: AnalyzeData = res.data?.data;
      setSource(data);
      // Video lẻ được chọn sẵn; playlist/kênh để trống để tránh import hàng loạt ngoài ý muốn.
      const available = data.videos.filter((video) => video.available);
      setSelected(
        new Set(available.length === 1 ? [available[0].videoId] : []),
      );
      setPage(1);
      setSearch('');
    } catch (err: any) {
      setAnalyzeError(
        err?.response?.data?.detail ||
          'Không phân tích được nguồn YouTube. Vui lòng kiểm tra liên kết và thử lại.',
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleVideo = (videoId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(allAvailableIds));
  };

  const handleCreateCourse = async () => {
    if (!newTitle.trim()) {
      setNotice({ kind: 'error', text: 'Vui lòng nhập tên khóa học mới.' });
      return;
    }
    setCreating(true);
    setNotice(null);
    try {
      const res = await coursesApi.createCourse({
        title: newTitle.trim(),
        description: newDescription.trim() || `Khóa học nhập từ YouTube: ${newTitle.trim()}`,
        category: newCategory.trim() || 'Công nghệ thông tin',
        level: newLevel,
        price: Number(newPrice) || 0,
        thumbnail: COVER_PRESETS[0],
        status: 'draft',
      });
      const created = res.data?.data ?? res.data;
      const id = String(created?.id || '');
      if (!id) throw new Error('Máy chủ không trả về ID khóa học.');
      setCourses((prev) => [{ id, title: newTitle.trim(), status: 'draft' }, ...prev]);
      setCourseId(id);
      setShowCreate(false);
      setNewTitle('');
      setNewDescription('');
      setNotice({ kind: 'ok', text: 'Đã tạo khóa học nháp. Bạn có thể import video vào khóa này.' });
    } catch (err: any) {
      setNotice({
        kind: 'error',
        text: err?.response?.data?.detail || err?.message || 'Không tạo được khóa học.',
      });
    } finally {
      setCreating(false);
    }
  };

  const runImport = async (videoIds: string[]) => {
    if (!courseId) {
      setNotice({ kind: 'error', text: 'Hãy chọn hoặc tạo khóa học đích trước khi import.' });
      return;
    }
    if (videoIds.length === 0) return;
    setImporting(true);
    setNotice(null);
    setProgress({ done: 0, total: videoIds.length });
    setResults((prev) => {
      const next = { ...prev };
      videoIds.forEach((id) => {
        next[id] = { state: 'importing' };
      });
      return next;
    });

    let created = 0;
    let existed = 0;
    let failed = 0;
    for (const videoId of videoIds) {
      try {
        const res = await youtubeApi.importVideo(courseId, videoId);
        const data = res.data?.data;
        if (data?.status === 'exists') {
          existed += 1;
          setResults((prev) => ({
            ...prev,
            [videoId]: { state: 'exists', lessonId: data.lessonId, message: 'Video đã có trong khóa.' },
          }));
        } else {
          created += 1;
          setResults((prev) => ({
            ...prev,
            [videoId]: { state: 'created', lessonId: data?.lessonId },
          }));
        }
      } catch (err: any) {
        failed += 1;
        setResults((prev) => ({
          ...prev,
          [videoId]: {
            state: 'error',
            message: err?.response?.data?.detail || 'Không import được video này.',
          },
        }));
      } finally {
        setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      }
    }

    setImporting(false);
    setNotice({
      kind: failed > 0 ? 'error' : 'ok',
      text: `Đã thêm ${created} video, ${existed} video đã tồn tại${failed ? `, ${failed} video lỗi` : ''}.`,
    });
    void loadCourseLessons(courseId);
  };

  const failedIds = Object.entries(results)
    .filter(([, value]) => value.state === 'error')
    .map(([id]) => id);

  const loadCourseLessons = async (targetId: string) => {
    if (!targetId) return;
    setLessonsLoading(true);
    try {
      const res = await youtubeApi.getCourseLessons(targetId);
      setLessons(res.data?.data?.lessons || []);
    } catch (err: any) {
      setNotice({
        kind: 'error',
        text: err?.response?.data?.detail || 'Không tải được danh sách bài học.',
      });
    } finally {
      setLessonsLoading(false);
    }
  };

  const switchTab = (next: 'source' | 'subtitles') => {
    setTab(next);
    if (next === 'subtitles' && courseId) void loadCourseLessons(courseId);
  };

  const handleFetchSubtitle = async (lesson: LessonItem) => {
    setBusyLesson(lesson.id);
    setNotice(null);
    try {
      const res = await youtubeApi.fetchSubtitle(lesson.id);
      const data = res.data?.data;
      setNotice({
        kind: 'ok',
        text: data?.skipped
          ? 'Phụ đề không thay đổi, giữ nguyên dữ liệu đã nhúng.'
          : `Đã lấy phụ đề ${data?.language || ''} và nhúng ${data?.chunks || 0} đoạn vào kho tri thức.`,
      });
    } catch (err: any) {
      setNotice({
        kind: 'error',
        text: err?.response?.data?.detail || 'Không lấy được phụ đề tự động.',
      });
    } finally {
      setBusyLesson(null);
      void loadCourseLessons(courseId);
    }
  };

  const handleUploadSubtitle = async (lesson: LessonItem, file: File | null | undefined) => {
    if (!file) return;
    if (!/\.(srt|vtt)$/i.test(file.name)) {
      setNotice({ kind: 'error', text: 'Chỉ hỗ trợ tệp .srt hoặc .vtt.' });
      return;
    }
    setBusyLesson(lesson.id);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('language', subtitleLanguage || 'vi');
      const res = await youtubeApi.uploadSubtitle(lesson.id, formData);
      const data = res.data?.data;
      setNotice({
        kind: 'ok',
        text: data?.skipped
          ? 'Phụ đề không thay đổi, giữ nguyên dữ liệu đã nhúng.'
          : `Đã lưu và nhúng ${data?.chunks || 0} đoạn phụ đề (${data?.language || subtitleLanguage}).`,
      });
    } catch (err: any) {
      setNotice({
        kind: 'error',
        text: err?.response?.data?.detail || 'Không tải được tệp SRT.',
      });
    } finally {
      setBusyLesson(null);
      void loadCourseLessons(courseId);
    }
  };

  const handleReingest = async (lesson: LessonItem) => {
    setBusyLesson(lesson.id);
    setNotice(null);
    try {
      const res = await youtubeApi.reingestSubtitle(lesson.id);
      const data = res.data?.data;
      setNotice({
        kind: 'ok',
        text: `Đã nhúng lại ${data?.chunks || 0} đoạn phụ đề vào kho tri thức.`,
      });
    } catch (err: any) {
      setNotice({
        kind: 'error',
        text: err?.response?.data?.detail || 'Không nhúng lại được phụ đề.',
      });
    } finally {
      setBusyLesson(null);
      void loadCourseLessons(courseId);
    }
  };

  if (!isAuthorized || authLoading) return <PageSkeleton />;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Nhập học liệu YouTube"
        description="Lấy metadata video/playlist/kênh bằng YouTube Data API, tạo bài học và nhúng phụ đề vào kho tri thức của Trợ lý AI."
        badges={[{ label: 'YouTube Data API v3', variant: 'info' }]}
      />

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[13px]',
            notice.kind === 'error'
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : 'border-brand-200 bg-brand-50 text-brand-800',
          )}
        >
          {notice.kind === 'error' ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {(
          [
            ['source', 'Nhập từ YouTube'],
            ['subtitles', 'Phụ đề & kho tri thức'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => switchTab(value)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors',
              tab === value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'source' && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <form onSubmit={handleAnalyze} className="space-y-3">
                <Label htmlFor="youtube-url" className="text-[13px] font-medium">
                  Liên kết video, playlist hoặc kênh
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="youtube-url"
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder="https://www.youtube.com/playlist?list=… hoặc https://www.youtube.com/@kenh"
                      className="pl-9"
                      disabled={analyzing}
                    />
                  </div>
                  <Button type="submit" disabled={analyzing} className="shrink-0">
                    {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
                    {analyzing ? 'Đang phân tích…' : 'Phân tích'}
                  </Button>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Hệ thống chỉ lấy metadata công khai. Phụ đề của video không thuộc sở hữu của bạn cần được tải lên thủ công.
                </p>
                {analyzeError && (
                  <p className="text-[12px] text-destructive" role="alert">
                    {analyzeError}
                  </p>
                )}
              </form>
            </CardContent>
          </Card>

          {source && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
                <div className="min-w-0">
                  <p className="kicker">{source.sourceType === 'video' ? 'Video' : source.sourceType === 'playlist' ? 'Playlist' : 'Kênh'}</p>
                  <h2 className="mt-1 truncate font-serif text-xl text-foreground">{source.title}</h2>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {source.channelTitle} · {source.videos.length} video khả dụng
                    {source.skipped.length > 0 ? ` · ${source.skipped.length} video bị bỏ qua` : ''}
                    {source.truncated ? ' · đã giới hạn số lượng' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                      }}
                      placeholder="Tìm video…"
                      className="h-9 w-56 pl-9 text-[13px]"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleAll}
                    disabled={allAvailableIds.length === 0 || importing}
                  >
                    {allSelected ? 'Bỏ chọn tất cả' : `Chọn tất cả (${allAvailableIds.length})`}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                <div className="space-y-2">
                  {pageVideos.map((video) => {
                    const state = results[video.videoId];
                    const checked = selected.has(video.videoId);
                    return (
                      <div
                        key={video.videoId}
                        className={cn(
                          'flex gap-3 rounded-lg border p-2.5 transition-colors',
                          checked ? 'border-brand-300 bg-brand-50/40' : 'border-border bg-card',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!video.available || importing}
                          onChange={() => toggleVideo(video.videoId)}
                          className="mt-8 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                          aria-label={`Chọn ${video.title}`}
                        />
                        <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded border border-border bg-muted">
                          {video.thumbnail ? (
                            <Image
                              src={video.thumbnail}
                              alt={video.title}
                              fill
                              sizes="128px"
                              className="object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1 py-0.5">
                          <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
                            {video.title}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="h-3 w-3" />
                              {formatDuration(video.durationSeconds)}
                            </span>
                            <span className="truncate">{video.channelTitle}</span>
                            {video.publishedAt && (
                              <span>{new Date(video.publishedAt).toLocaleDateString('vi-VN')}</span>
                            )}
                          </p>
                          <div className="mt-1.5">
                            {!video.available ? (
                              <Badge variant="destructive" className="text-[10px]">
                                {video.unavailableReason || 'Không khả dụng'}
                              </Badge>
                            ) : state?.state === 'created' ? (
                              <Badge variant="success" className="text-[10px]">
                                Đã thêm bài học
                              </Badge>
                            ) : state?.state === 'exists' ? (
                              <Badge variant="secondary" className="text-[10px]">
                                Đã tồn tại
                              </Badge>
                            ) : state?.state === 'error' ? (
                              <Badge variant="destructive" className="text-[10px]" title={state.message}>
                                Lỗi import
                              </Badge>
                            ) : state?.state === 'importing' ? (
                              <Badge variant="info" className="text-[10px]">
                                Đang import…
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {filteredVideos.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
                      Không có video nào khớp từ khóa.
                    </div>
                  )}

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-1 text-[12px] text-muted-foreground">
                      <span>
                        Trang {page}/{totalPages} · {filteredVideos.length} video
                      </span>
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={page <= 1}
                          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                          aria-label="Trang trước"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={page >= totalPages}
                          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                          aria-label="Trang sau"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <Card className="h-fit">
                  <CardContent className="space-y-4 p-5">
                    <div>
                      <h3 className="text-[13px] font-semibold text-foreground">Khóa học đích</h3>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Mỗi video trở thành một bài học, theo đúng thứ tự chọn.
                      </p>
                    </div>

                    <select
                      value={courseId}
                      onChange={(event) => setCourseId(event.target.value)}
                      disabled={coursesLoading || importing}
                      className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-[13px] text-foreground"
                      aria-label="Chọn khóa học đích"
                    >
                      <option value="">— Chọn khóa học —</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                          {course.status === 'draft' ? ' (nháp)' : ''}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => setShowCreate((prev) => !prev)}
                      className="text-[12px] font-medium text-brand-700 underline-offset-2 hover:underline"
                    >
                      {showCreate ? 'Đóng form tạo khóa học' : '+ Tạo khóa học mới'}
                    </button>

                    {showCreate && (
                      <div className="space-y-2.5 rounded-md border border-border bg-muted/40 p-3">
                        <Input
                          value={newTitle}
                          onChange={(event) => setNewTitle(event.target.value)}
                          placeholder="Tên khóa học *"
                          className="h-9 text-[13px]"
                        />
                        <Input
                          value={newCategory}
                          onChange={(event) => setNewCategory(event.target.value)}
                          placeholder="Chuyên ngành"
                          className="h-9 text-[13px]"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={newLevel}
                            onChange={(event) => setNewLevel(event.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
                            aria-label="Trình độ khóa học"
                          >
                            {Object.entries(levelLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <Input
                            type="number"
                            min={0}
                            value={newPrice}
                            onChange={(event) => setNewPrice(event.target.value)}
                            placeholder="Học phí"
                            className="h-9 text-[13px]"
                          />
                        </div>
                        <Textarea
                          value={newDescription}
                          onChange={(event) => setNewDescription(event.target.value)}
                          placeholder="Mô tả ngắn (không bắt buộc)"
                          className="min-h-[64px] text-[13px]"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleCreateCourse}
                          disabled={creating}
                          className="w-full"
                        >
                          {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                          {creating ? 'Đang tạo…' : 'Tạo khóa học nháp'}
                        </Button>
                      </div>
                    )}

                    <div className="space-y-2 border-t border-border pt-3">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-muted-foreground">Đã chọn</span>
                        <span className="font-semibold text-foreground">{selected.size} video</span>
                      </div>
                      {importing && (
                        <div className="space-y-1.5">
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-brand-600 transition-all"
                              style={{
                                width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                              }}
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Đang import {progress.done}/{progress.total}…
                          </p>
                        </div>
                      )}
                      <Button
                        type="button"
                        onClick={() => void runImport(Array.from(selected))}
                        disabled={importing || selected.size === 0 || !courseId}
                        className="w-full"
                      >
                        {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
                        {importing ? 'Đang import…' : `Import ${selected.size} video`}
                      </Button>
                      {failedIds.length > 0 && !importing && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => void runImport(failedIds)}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Thử lại {failedIds.length} video lỗi
                        </Button>
                      )}
                    </div>

                    {Object.keys(results).length > 0 && (
                      <div className="space-y-1 border-t border-border pt-3 text-[11px]">
                        {Object.entries(results).some(([, value]) => value.state === 'created') && (
                          <p className="flex items-center gap-1.5 text-brand-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Đã tạo bài học. Chuyển sang tab “Phụ đề & kho tri thức” để bổ sung SRT.
                          </p>
                        )}
                        {failedIds.length > 0 && (
                          <p className="flex items-start gap-1.5 text-destructive">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            Có video lỗi — xem chi tiết ở từng dòng.
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {source.skipped.length > 0 && (
                <details className="rounded-lg border border-border bg-card px-4 py-3 text-[12px]">
                  <summary className="cursor-pointer font-medium text-foreground">
                    {source.skipped.length} video bị bỏ qua (riêng tư/đã xóa)
                  </summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {source.skipped.slice(0, 20).map((item, index) => (
                      <li key={`${item.videoId}-${index}`} className="truncate">
                        {item.title || item.videoId} — {item.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'subtitles' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1 space-y-2">
                <Label className="text-[13px] font-medium">Khóa học cần quản lý phụ đề</Label>
                <select
                  value={courseId}
                  onChange={(event) => {
                    setCourseId(event.target.value);
                    setLessons([]);
                    if (event.target.value) void loadCourseLessons(event.target.value);
                  }}
                  className="block h-9 w-full rounded-md border border-input bg-background px-2.5 text-[13px] text-foreground sm:max-w-md"
                >
                  <option value="">— Chọn khóa học —</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <div className="space-y-2">
                  <Label htmlFor="subtitle-language" className="text-[12px]">
                    Ngôn ngữ SRT
                  </Label>
                  <select
                    id="subtitle-language"
                    value={subtitleLanguage}
                    onChange={(event) => setSubtitleLanguage(event.target.value)}
                    className="block h-9 rounded-md border border-input bg-background px-2.5 text-[13px]"
                  >
                    {subtitleLanguages.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadCourseLessons(courseId)}
                  disabled={!courseId || lessonsLoading}
                >
                  <RefreshCw className={cn('h-4 w-4', lessonsLoading && 'animate-spin')} />
                  Tải lại
                </Button>
              </div>
            </CardContent>
          </Card>

          {!subtitleEnabled && (
            <div className="rounded-lg border border-clay-200 bg-clay-50/70 px-4 py-3 text-[12px] text-clay-800">
              Tự động tải phụ đề đang tắt trên máy chủ. Bạn vẫn có thể tải tệp SRT lên thủ công.
            </div>
          )}

          {lessonsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-lg border border-border bg-muted/50" />
              ))}
            </div>
          ) : lessons.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
              <FileText className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-[13px] text-muted-foreground">
                {courseId
                  ? 'Khóa học chưa có bài học nào nhập từ YouTube.'
                  : 'Chọn khóa học để xem bài học và trạng thái phụ đề.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {lessons.map((lesson) => {
                const badge = statusBadge(lesson.subtitle.status);
                const busy = busyLesson === lesson.id;
                return (
                  <div key={lesson.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {lesson.orderIndex}. {lesson.title}
                        </p>
                        <Badge variant={badge.variant} className="text-[10px]">
                          {badge.label}
                        </Badge>
                        {lesson.subtitle.language && (
                          <span className="text-[11px] text-muted-foreground">
                            {lesson.subtitle.language}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatDuration(lesson.duration)} · {lesson.transcriptLength.toLocaleString('vi-VN')} ký tự transcript
                        {lesson.subtitle.error ? ` · ${lesson.subtitle.error}` : ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || !subtitleEnabled}
                        onClick={() => void handleFetchSubtitle(lesson)}
                        title="Tải phụ đề công khai bằng yt-dlp"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Youtube className="h-3.5 w-3.5" />}
                        Lấy phụ đề
                      </Button>

                      <label
                        className={cn(
                          'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold transition-colors hover:bg-secondary',
                          busy && 'pointer-events-none opacity-50',
                        )}
                        title="Tải tệp .srt/.vtt lên"
                      >
                        <UploadCloud className="h-3.5 w-3.5" />
                        Tải SRT
                        <input
                          type="file"
                          accept=".srt,.vtt"
                          className="hidden"
                          onChange={(event) => {
                            void handleUploadSubtitle(lesson, event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                      </label>

                      {lesson.subtitle.hasSubtitle && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleReingest(lesson)}
                        >
                          <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
                          Ingest lại
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
