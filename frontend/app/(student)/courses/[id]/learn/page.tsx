'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Award,
  CheckCircle,
  FileText,
  HelpCircle,
  Sparkles,
  BookOpen,
  ListOrdered,
  Clock,
  PlayCircle,
  Download,
  Share2,
  ChevronRight,
  ChevronLeft,
  Layers,
  FileCheck,
  PanelRightClose,
  PanelRightOpen,
  X,
  Eye,
  GraduationCap,
  Edit3,
  RefreshCw,
} from 'lucide-react';
import VideoPlayer from '@/components/course/VideoPlayer';
import ProgressBar from '@/components/course/ProgressBar';
import ChatBox from '@/components/ai-tutor/ChatBox';
import { coursesApi } from '@/lib/api';
import { trackLearningEvent } from '@/lib/analytics';

interface LessonItem {
  id: string | number;
  title: string;
  duration?: number | string;
  durationText?: string;
  video_url?: string;
  videoUrl?: string;
  order_index?: number;
  order?: number;
  transcript?: string;
  subtitleStatus?: 'none' | 'ready' | 'ingested' | 'failed' | 'missing' | string;
  subtitleLanguage?: string | null;
  description?: string;
  resources_url?: string;
}

/** Bản ghi trong bảng lesson_materials (file PDF/DOCX/PPTX/video đã lưu cloud). */
interface LessonMaterialItem {
  id: string | number;
  kind: 'document' | 'video' | string;
  title: string;
  file_url?: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  status?: string;
  error_message?: string | null;
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Nhãn loại tệp thân thiện thay vì hiển thị MIME type thô. */
function materialTypeLabel(material: LessonMaterialItem): string {
  const name = (material.title || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'PDF';
  if (name.endsWith('.docx') || name.endsWith('.doc')) return 'Word';
  if (name.endsWith('.pptx') || name.endsWith('.ppt')) return 'Slide';
  if (material.mime_type?.includes('pdf')) return 'PDF';
  if (material.mime_type?.includes('word')) return 'Word';
  if (material.mime_type?.includes('presentation')) return 'Slide';
  return 'Tài liệu';
}

/** Rút gọn URL nguồn học liệu thành tên miền (giữ URL đầy đủ ở tooltip). */
function sourceLabel(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatLessonDuration(lesson: LessonItem): string {
  if (lesson.durationText) return lesson.durationText;
  if (typeof lesson.duration === 'number') {
    const minutes = Math.round(lesson.duration / 60);
    return minutes > 0 ? `${minutes} phút` : '0 phút';
  }
  return lesson.duration || 'Chưa cập nhật';
}

export default function LearnPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const courseId = (params?.id as string) || '';
  const initialLessonId = searchParams?.get('lessonId') || '';
  // Điều hướng từ dashboard: ?askAI=true (mở khung chat) hoặc ?ask=<câu hỏi> (gửi luôn).
  const askedQuestion = (searchParams?.get('ask') || '').trim();
  const wantsAIChat = searchParams?.get('askAI') === 'true' || askedQuestion.length > 0;
  // Mốc tua video khi mở từ trích dẫn timestamp của AI Tutor (?t=<giây>).
  const rawStartParam = Number(searchParams?.get('t') || 0);
  const startSeconds =
    Number.isFinite(rawStartParam) && rawStartParam > 0
      ? Math.min(Math.floor(rawStartParam), 24 * 3600)
      : 0;

  const [resolvedCourseId, setResolvedCourseId] = useState<string>(
    /^\d+$/.test(courseId) ? courseId : '',
  );

  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [courseTitle, setCourseTitle] = useState('Đang tải khóa học...');
  const [activeLessonId, setActiveLessonId] = useState<string>(initialLessonId);
  const [progress, setProgress] = useState(0);
  const [lessonProgress, setLessonProgress] = useState(0);
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'materials' | 'quiz' | 'chat' | 'summary'>('overview');
  const [summaryData, setSummaryData] = useState<
    Record<
      string,
      {
        summary: string;
        key_points: string[];
        flashcards: Array<{ question: string; answer: string; topic?: string }>;
        keywords: string[];
      }
    >
  >({});
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [mobilePlaylistOpen, setMobilePlaylistOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [inTabAnswers, setInTabAnswers] = useState<Record<number, string>>({});
  const [inTabSubmitted, setInTabSubmitted] = useState(false);
  const [courseQuizzes, setCourseQuizzes] = useState<any[]>([]);
  const [lessonMaterials, setLessonMaterials] = useState<LessonMaterialItem[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [completeState, setCompleteState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [resourceNotice, setResourceNotice] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [courseInstructorId, setCourseInstructorId] = useState<number | null>(null);
  // Yêu cầu tua video tại chỗ khi học viên bấm mốc thời gian trong câu trả lời AI.
  const [seekRequest, setSeekRequest] = useState<{ seconds: number; token: number } | null>(null);
  // Transcript bài thật dài 1.500-2.300 ký tự: mặc định thu gọn để trang không bị kéo dài.
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  // 403/401 từ API bài học = chưa ghi danh, khác với khóa học thật sự chưa có bài.
  const [accessError, setAccessError] = useState<'' | 'not-enrolled' | 'unknown'>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Phòng học yêu cầu đăng nhập: khách chỉ xem được catalog, không xem bài giảng.
    if (!localStorage.getItem('accessToken')) {
      const current = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(current)}`);
      return;
    }
    try {
      const stored = localStorage.getItem('currentUser');
      if (stored) setCurrentUser(JSON.parse(stored));
    } catch {}
  }, [router]);

  useEffect(() => {
    const tab = searchParams?.get('tab');
    if (tab === 'overview' || tab === 'materials' || tab === 'quiz' || tab === 'chat') {
      setActiveTab(tab);
      return;
    }
    if (wantsAIChat) {
      // Chỉ giữ MỘT khung chat được mount để câu hỏi chỉ được gửi một lần.
      setActiveTab('chat');
      setIsChatOpen(false);
      setMobileChatOpen(false);
    }
  }, [searchParams, wantsAIChat]);

  const isOwner = Boolean(
    currentUser &&
    courseInstructorId &&
    Number(currentUser.id) === Number(courseInstructorId)
  );
  const isAdmin = currentUser?.role === 'admin';
  const isStaff = isOwner || isAdmin;

  // Responsive default setup
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 1024;
      if (isMobile) {
        setIsSidebarOpen(false);
        setIsChatOpen(false);
      }
    }
  }, []);

  // Tải danh sách bài học và tiến độ thực tế từ Database qua API
  useEffect(() => {
    let isMounted = true;
    const fetchCourseData = async () => {
      setIsLoading(true);
      setAccessError('');
      try {
        const res = /^\d+$/.test(courseId)
          ? await coursesApi.getById(courseId)
          : await coursesApi.getBySlug(courseId);
        let numericCourseId = /^\d+$/.test(courseId) ? courseId : '';
        let loadedLessons: LessonItem[] = [];
        if (res.data?.data && isMounted) {
          const c = res.data.data;
          numericCourseId = String(c.id);
          setResolvedCourseId(numericCourseId);
          setCourseTitle(c.title || 'Khóa học trực tuyến');
          if (c.instructor?.id) {
            setCourseInstructorId(Number(c.instructor.id));
          }
          if (c.lessons && c.lessons.length > 0) {
            setLessons(c.lessons);
            const queryLessonId = searchParams?.get('lessonId');
            const matchedLesson = queryLessonId
              ? c.lessons.find((l: any) => String(l.id) === String(queryLessonId))
              : null;
            loadedLessons = c.lessons;
            setActiveLessonId(String(matchedLesson ? matchedLesson.id : c.lessons[0].id));
          } else {
            setLessons([]);
          }
          if (c.quizzes && c.quizzes.length > 0) {
            setCourseQuizzes(c.quizzes);
          }
        }

        // Tải tiến độ thực tế đã lưu trong PostgreSQL.
        // Lỗi tiến độ (403 khi chưa ghi danh) KHÔNG được làm mất danh sách bài đã có.
        if (numericCourseId) {
          let progRes: Awaited<ReturnType<typeof coursesApi.getProgress>> | null = null;
          try {
            progRes = await coursesApi.getProgress(numericCourseId);
          } catch (progressErr) {
            console.warn('Không tải được tiến độ khóa học:', progressErr);
          }
          if (progRes?.data?.data && isMounted) {
            const p = progRes.data.data;
            if (p.completedLessons) setCompletedLessonIds(p.completedLessons);
            if (p.percentage !== undefined) setProgress(p.percentage);
            // Không có ?lessonId (nút "Học tiếp"): mở đúng bài chưa hoàn thành đầu tiên
            // thay vì luôn quay về bài 1.
            if (!searchParams?.get('lessonId') && loadedLessons.length > 0) {
              const done = new Set((p.completedLessons || []).map((id: any) => String(id)));
              const resumeLesson = loadedLessons.find((l) => !done.has(String(l.id)));
              if (resumeLesson) setActiveLessonId(String(resumeLesson.id));
            }
          }
        }
      } catch (err) {
        console.error('Lỗi tải dữ liệu bài giảng từ máy chủ:', err);
        if (isMounted) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          setAccessError(status === 403 || status === 401 ? 'not-enrolled' : 'unknown');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchCourseData();
    return () => {
      isMounted = false;
    };
  }, [courseId, searchParams]);

  const currentLesson =
    lessons.find((l) => String(l.id) === String(activeLessonId)) || lessons[0];

  // Ghi nhận lượt mở bài học (chỉ học viên, tránh nhiễu số liệu bởi giảng viên).
  const lastTrackedLessonRef = useRef('');
  useEffect(() => {
    if (isStaff || !resolvedCourseId || !currentLesson?.id) return;
    const key = `${resolvedCourseId}:${currentLesson.id}`;
    if (lastTrackedLessonRef.current === key) return;
    lastTrackedLessonRef.current = key;
    trackLearningEvent({
      event_type: 'lesson_view',
      course_id: resolvedCourseId,
      lesson_id: currentLesson.id,
    });
  }, [resolvedCourseId, currentLesson?.id, isStaff]);

  const currentIndex = lessons.findIndex((l) => String(l.id) === String(activeLessonId));
  const hasNextLesson = currentIndex >= 0 && currentIndex < lessons.length - 1;
  const nextLessonId = hasNextLesson ? lessons[currentIndex + 1].id : null;

  // Học liệu đính kèm thật từ bảng lesson_materials (PDF/DOCX/PPTX tải lên cloud).
  // `resources_url` cũ chỉ là fallback cho dữ liệu trước khi có bảng học liệu.
  useEffect(() => {
    const lessonId = currentLesson?.id;
    if (!resolvedCourseId || lessonId === undefined || lessonId === null) {
      setLessonMaterials([]);
      setMaterialsError('');
      return;
    }
    let isMounted = true;
    setMaterialsLoading(true);
    setMaterialsError('');
    coursesApi
      .getLessonMaterials(resolvedCourseId, lessonId)
      .then((res) => {
        if (!isMounted) return;
        const payload = res.data?.data ?? res.data;
        const items: LessonMaterialItem[] = Array.isArray(payload) ? payload : [];
        setLessonMaterials(items.filter((item) => item.kind !== 'video' && Boolean(item.file_url)));
      })
      .catch((err) => {
        if (!isMounted) return;
        setLessonMaterials([]);
        setMaterialsError('Không tải được danh sách học liệu của bài học.');
        console.warn('Không tải được học liệu bài học:', err);
      })
      .finally(() => {
        if (isMounted) setMaterialsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [resolvedCourseId, currentLesson?.id]);

  // `resources_url` là dữ liệu cũ; chỉ hiển thị khi không trùng tệp đã có trong lesson_materials.
  const resourceUrl = currentLesson?.resources_url || '';
  const showResourceFallback =
    Boolean(resourceUrl) && !lessonMaterials.some((item) => item.file_url === resourceUrl);

  /**
   * Chọn đề ôn tập ĐÚNG bài học đang mở (đặc tả: quizzes.lesson_id).
   * 1. Ưu tiên đề có lesson_id trùng bài hiện tại.
   * 2. Dữ liệu cũ chưa gắn lesson_id: so khớp số bài trong tiêu đề ("Bài N").
   * 3. Không có đề của bài này thì để trống — KHÔNG mượn đề của bài khác.
   */
  const activeQuizItem = useMemo(() => {
    const lessonId = String(currentLesson?.id ?? '');
    const byLessonId = courseQuizzes.find(
      (q: any) => q.lesson_id != null && String(q.lesson_id) === lessonId,
    );
    if (byLessonId) return byLessonId;

    const order = Number(
      currentLesson?.order ?? currentLesson?.order_index ?? (currentIndex >= 0 ? currentIndex + 1 : 0),
    );
    if (!Number.isFinite(order) || order <= 0) return null;

    const byTitle = courseQuizzes.find((q: any) => {
      const matched = /bài\s*(\d+)/i.exec(q.title || '');
      return matched ? Number(matched[1]) === order : false;
    });
    return byTitle ?? null;
  }, [courseQuizzes, currentLesson, currentIndex]);

  const targetQuizId = activeQuizItem?.id ?? null;
  const quizCourseId = resolvedCourseId || courseId;

  // Tiến độ khóa học = số bài đã hoàn thành / tổng số bài (không dùng % video).
  const completedInCourse = useMemo(
    () => completedLessonIds.filter((id) => lessons.some((l) => String(l.id) === String(id))).length,
    [completedLessonIds, lessons],
  );
  const courseProgress = lessons.length > 0
    ? Math.round((completedInCourse / lessons.length) * 100)
    : progress;

  const isCurrentCompleted = completedLessonIds.includes(String(currentLesson?.id));

  const transcriptLines = useMemo(
    () =>
      (currentLesson?.transcript || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [currentLesson?.transcript],
  );
  const hasIngestedYoutubeTranscript = currentLesson?.subtitleStatus === 'ingested';

  // Lưu tiến độ xem video của từng bài (progress.percent_complete) — tối đa 1 lần/15 giây.
  const lastProgressSyncRef = useRef(0);
  const persistLessonProgress = useCallback(
    (percent: number) => {
      if (isStaff || !currentLesson) return;
      const now = Date.now();
      if (now - lastProgressSyncRef.current < 15000) return;
      lastProgressSyncRef.current = now;
      coursesApi
        .saveLessonProgress(currentLesson.id, Math.max(0, Math.min(100, Math.round(percent))))
        .catch((err) => console.warn('Không lưu được tiến độ xem bài học:', err));
    },
    [currentLesson, isStaff],
  );

  const handleManualComplete = async () => {
    if (isStaff || !currentLesson || completeState === 'saving') return;
    const lid = String(currentLesson.id);
    const wasCompleted = completedLessonIds.includes(lid);
    setCompleteState('saving');
    // Cập nhật lạc quan để giao diện phản hồi ngay, hoàn tác nếu máy chủ từ chối.
    if (!wasCompleted) {
      setCompletedLessonIds((prev) => (prev.includes(lid) ? prev : [...prev, lid]));
    }
    try {
      if (!resolvedCourseId) throw new Error('Chưa xác định được mã khóa học');
      await coursesApi.markLessonComplete(
        resolvedCourseId,
        lid,
        typeof currentLesson.duration === 'number' ? currentLesson.duration : 0,
      );
      setCompleteState('idle');
    } catch (err) {
      if (!wasCompleted) {
        setCompletedLessonIds((prev) => prev.filter((id) => String(id) !== lid));
      }
      setCompleteState('error');
      console.warn('Lỗi lưu tiến độ bài học:', err);
    }
  };

  const handleLessonChange = (lessonId: string | number) => {
    setActiveLessonId(String(lessonId));
    setInTabAnswers({});
    setInTabSubmitted(false);
    setLessonProgress(0);
    lastProgressSyncRef.current = 0;
    setCompleteState('idle');
    setResourceNotice('');
    setMobilePlaylistOpen(false);
    setShowFullTranscript(false);
    setShowFullDescription(false);
    setSummaryError('');
    setFlippedCards({});
  };

  const handleFetchSummary = useCallback(
    async (targetLessonId?: string | number) => {
      const lid = String(targetLessonId || activeLessonId || currentLesson?.id || '');
      if (!lid) return;
      const targetCourseId = resolvedCourseId || courseId;
      if (!targetCourseId) return;

      setSummaryLoading(true);
      setSummaryError('');
      try {
        const res = await coursesApi.summarizeLesson(targetCourseId, lid);
        const result = res.data?.data || res.data;
        setSummaryData((prev) => ({ ...prev, [lid]: result }));
        setFlippedCards({});
      } catch (err: any) {
        setSummaryError(
          err?.response?.data?.detail || 'Không thể tạo tóm tắt bằng AI. Vui lòng thử lại sau.'
        );
      } finally {
        setSummaryLoading(false);
      }
    },
    [activeLessonId, currentLesson, resolvedCourseId, courseId],
  );

  // Đóng các drawer mobile bằng Esc và khóa cuộn nền khi đang mở.
  useEffect(() => {
    if (!mobilePlaylistOpen && !mobileChatOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMobilePlaylistOpen(false);
      setMobileChatOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobilePlaylistOpen, mobileChatOpen]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-stone-950 text-stone-100 items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-stone-400">Đang nạp bài giảng từ cơ sở dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (lessons.length === 0) {
    return (
      <div className="flex flex-col h-screen bg-stone-950 text-stone-100 items-center justify-center font-sans p-6 text-center">
        <div className="max-w-md bg-stone-900 border border-stone-800 rounded-lg p-8 space-y-4 shadow-xl">
          <div className="w-14 h-14 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20 flex items-center justify-center mx-auto">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white mb-1">
              {accessError === 'not-enrolled'
                ? 'Bạn chưa ghi danh khóa học này'
                : 'Khóa học đang được cập nhật'}
            </h2>
            <p className="text-xs text-stone-400 leading-relaxed">
              {accessError === 'not-enrolled'
                ? `Khóa học "${courseTitle}" chưa có trong danh sách ghi danh của bạn. Hãy đăng ký học để xem bài giảng, tài liệu và dùng trợ lý AI.`
                : accessError === 'unknown'
                  ? `Không tải được nội dung khóa "${courseTitle}". Vui lòng thử lại hoặc mở trang giới thiệu khóa.`
                  : `Khóa học "${courseTitle}" hiện chưa có bài giảng nào được xuất bản. Giảng viên đang tiếp tục hoàn thiện học liệu.`}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() =>
                router.push(accessError === 'not-enrolled' ? `/courses/${courseId}` : '/courses')
              }
              className="px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition shadow-md shadow-brand-500/20"
            >
              {accessError === 'not-enrolled' ? 'Đăng ký học' : 'Xem các khóa học khác'}
            </button>
            <button
              onClick={() => router.push(`/courses/${courseId}`)}
              className="px-4 py-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold transition"
            >
              Xem giới thiệu khóa
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-stone-950 text-stone-100 overflow-hidden font-sans">
      {/* ── Top Bar ── */}
      <header className="h-14 bg-stone-900 border-b border-stone-800 px-3 sm:px-4 flex items-center justify-between shrink-0 z-30 shadow-md">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push(`/courses/${courseId}`);
              }
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-stone-400 hover:text-white bg-stone-800/80 hover:bg-stone-800 px-2.5 sm:px-3 py-1.5 rounded-lg transition shrink-0"
            title="Quay lại trang trước đó"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Quay lại</span>
          </button>
          <div className="h-4 w-px bg-stone-800 hidden sm:block shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-brand-500/20 text-brand-300 border border-brand-500/30 hidden md:inline-block shrink-0">
              Focus Player
            </span>
            <h2 className="text-xs sm:text-sm font-semibold text-stone-200 truncate max-w-[150px] sm:max-w-[260px] md:max-w-md">
              {currentLesson.title}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {isStaff && (
            <Link
              href={`/courses/${courseId}/manage`}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-stone-300 hover:text-white bg-stone-800/90 hover:bg-stone-800 px-3 py-1.5 rounded-lg border border-stone-700 transition"
              title="Quản lý học liệu của khóa học này"
            >
              <Edit3 className="w-3.5 h-3.5 text-brand-400" />
              <span>Quản lý học liệu</span>
            </Link>
          )}

          <div className="w-28 sm:w-40 hidden md:block">
            <ProgressBar progress={courseProgress} label="Tiến độ khóa" className="text-stone-300 text-[11px]" />
          </div>

          {/* Nút mở danh sách bài trên Mobile */}
          <button
            onClick={() => setMobilePlaylistOpen(true)}
            className="lg:hidden flex items-center gap-1 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 px-2.5 py-1.5 rounded-lg border border-stone-700 transition"
            title="Danh sách bài học"
          >
            <ListOrdered className="w-3.5 h-3.5 text-brand-400" />
            <span className="hidden xs:inline">Bài học</span>
          </button>

          {targetQuizId != null && (
            <Link
              href={`/quiz/${targetQuizId}?courseId=${quizCourseId}`}
              className="flex items-center gap-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 sm:px-3.5 py-1.5 rounded-lg shadow-sm transition shadow-emerald-900/30"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Trắc nghiệm</span>
              <span className="sm:hidden text-[11px]">Quiz</span>
            </Link>
          )}

          {/* Toggle Chatbot - Desktop & Mobile */}
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setMobileChatOpen(!mobileChatOpen);
              } else {
                setIsChatOpen(!isChatOpen);
              }
            }}
            className={`p-1.5 sm:px-3 sm:py-1.5 rounded-lg border transition text-xs flex items-center gap-1.5 ${
              (isChatOpen || mobileChatOpen)
                ? 'bg-brand-600 border-brand-500 text-white shadow-sm'
                : 'bg-stone-800 border-stone-700 text-stone-300 hover:text-white'
            }`}
            title="Bật/tắt Trợ lý Gia sư AI"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden sm:inline font-semibold">Gia sư AI</span>
          </button>
        </div>
      </header>

      {/* ── Main Workspace ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Cột 1: Danh sách bài học Desktop (Curriculum Playlist) ── */}
        <aside
          className={`${
            isSidebarOpen ? 'w-72 xl:w-80' : 'w-0'
          } hidden lg:flex shrink-0 bg-stone-900/95 border-r border-stone-800 flex-col transition-all duration-300 overflow-hidden z-20`}
        >
          <div className="p-3.5 border-b border-stone-800 flex items-center justify-between bg-stone-900">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-brand-400" />
              <span className="text-xs font-bold text-stone-200 uppercase tracking-wider">
                Giáo trình ({lessons.length} bài)
              </span>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="text-stone-500 hover:text-stone-300 p-1 rounded-md"
              title="Thu gọn danh sách"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-stone-800/40">
            {lessons.map((lesson, idx) => {
              const isActive = String(lesson.id) === String(activeLessonId);
              const isCompleted = completedLessonIds.includes(String(lesson.id));

              return (
                <button
                  key={lesson.id}
                  onClick={() => handleLessonChange(lesson.id)}
                  className={`w-full text-left p-3 rounded-lg transition flex items-start gap-3 group pt-2.5 ${
                    isActive
                      ? 'bg-brand-600/15 border border-brand-500/40 text-white'
                      : 'hover:bg-stone-800/60 text-stone-300'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                          isActive
                            ? 'border-brand-400 text-brand-300 bg-brand-500/20'
                            : 'border-stone-600 text-stone-500 group-hover:border-stone-400'
                        }`}
                      >
                        {idx + 1}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-semibold leading-snug line-clamp-2 ${
                        isActive ? 'text-brand-200' : 'text-stone-300 group-hover:text-white'
                      }`}
                    >
                      {lesson.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-stone-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatLessonDuration(lesson)}
                      </span>
                      <span>•</span>
                      <span className="text-brand-400/80">
                        {lesson.video_url || lesson.videoUrl ? 'Video' : 'Bài đọc'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Nút mở lại sidebar trên Desktop nếu đã ẩn */}
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="hidden lg:flex absolute left-2 top-3 z-30 bg-stone-800/90 hover:bg-stone-700 text-stone-300 p-2 rounded-lg shadow-lg border border-stone-700 transition"
            title="Mở danh sách bài học"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* ── Mobile Playlist Drawer (Dành cho Mobile & Tablet) ── */}
        {mobilePlaylistOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
              onClick={() => setMobilePlaylistOpen(false)}
            />
            {/* Drawer Panel */}
            <div className="relative w-80 max-w-[85vw] bg-stone-900 border-r border-stone-800 flex flex-col z-10 shadow-2xl h-full animate-in slide-in-from-left duration-200">
              <div className="p-4 border-b border-stone-800 flex items-center justify-between bg-stone-900">
                <div className="flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-brand-400" />
                  <span className="text-xs font-bold text-stone-200 uppercase tracking-wider">
                    Giáo trình ({lessons.length} bài)
                  </span>
                </div>
                <button
                  onClick={() => setMobilePlaylistOpen(false)}
                  aria-label="Đóng danh sách bài học"
                  className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-stone-800/40">
                {lessons.map((lesson, idx) => {
                  const isActive = String(lesson.id) === String(activeLessonId);
                  const isCompleted = completedLessonIds.includes(String(lesson.id));

                  return (
                    <button
                      key={lesson.id}
                      onClick={() => handleLessonChange(lesson.id)}
                      className={`w-full text-left p-3 rounded-lg transition flex items-start gap-3 pt-2.5 ${
                        isActive
                          ? 'bg-brand-600/20 border border-brand-500/40 text-white'
                          : 'hover:bg-stone-800/60 text-stone-300'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isCompleted ? (
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                              isActive
                                ? 'border-brand-400 text-brand-300 bg-brand-500/20'
                                : 'border-stone-600 text-stone-500'
                            }`}
                          >
                            {idx + 1}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-xs font-semibold leading-snug line-clamp-2 ${
                            isActive ? 'text-brand-200' : 'text-stone-300'
                          }`}
                        >
                          {lesson.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-stone-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatLessonDuration(lesson)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Cột 2: Video Player & Chi tiết bài học ── */}
        <main className="flex-1 flex flex-col overflow-y-auto bg-stone-950 p-3 sm:p-4 lg:p-5 space-y-3 sm:space-y-4 min-w-0">
          <div className="max-w-5xl mx-auto w-full space-y-3 sm:space-y-4">
            {/* Trình phát Video hỗ trợ YouTube Embed & MP4 */}
            <div className="space-y-2">
              <VideoPlayer
                key={`player-${currentLesson.id}-${startSeconds}`}
                videoUrl={currentLesson.video_url || currentLesson.videoUrl}
                startSeconds={startSeconds}
                seekRequest={seekRequest ?? undefined}
                title={currentLesson.title}
                onPlay={() => {
                  if (isStaff || !resolvedCourseId) return;
                  trackLearningEvent({
                    event_type: 'video_play',
                    course_id: resolvedCourseId,
                    lesson_id: currentLesson.id,
                  });
                }}
                onProgress={(p) => {
                  setLessonProgress((prev) => (p > prev ? p : prev));
                  persistLessonProgress(p);
                }}
                onEnded={() => {
                  if (isStaff) return;
                  setLessonProgress(100);
                  if (!completedLessonIds.includes(String(currentLesson.id))) {
                    setCompletedLessonIds((prev) =>
                      prev.includes(String(currentLesson.id)) ? prev : [...prev, String(currentLesson.id)],
                    );
                    setInTabAnswers({});
                    setInTabSubmitted(false);
                  }
                  const dur = typeof currentLesson.duration === 'number' ? currentLesson.duration : 0;
                  if (!resolvedCourseId) return;
                  trackLearningEvent({
                    event_type: 'video_complete',
                    course_id: resolvedCourseId,
                    lesson_id: currentLesson.id,
                    duration_seconds: dur,
                  });
                  coursesApi.markLessonComplete(resolvedCourseId, String(currentLesson.id), dur).catch((err) => {
                    console.warn('Lỗi ghi nhận tiến độ vào PostgreSQL:', err);
                  });
                }}
              />

              {/* Tiến độ xem riêng của bài đang mở (progress.percent_complete) */}
              {!isStaff && (currentLesson.video_url || currentLesson.videoUrl) && (
                <div className="flex items-center gap-2.5 px-1 text-[11px] text-stone-400">
                  <span className="shrink-0 font-medium">Đã xem bài này</span>
                  <div
                    className="h-1 flex-1 overflow-hidden rounded-full bg-stone-800"
                    role="progressbar"
                    aria-label="Tiến độ xem bài học hiện tại"
                    aria-valuenow={lessonProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCurrentCompleted ? 'bg-emerald-500' : 'bg-brand-500'
                      }`}
                      style={{ width: `${Math.max(lessonProgress, isCurrentCompleted ? 100 : 0)}%` }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right font-semibold text-stone-300">
                    {Math.max(lessonProgress, isCurrentCompleted ? 100 : 0)}%
                  </span>
                </div>
              )}
            </div>

            {/* Thông tin bài học & Thanh điều hướng Tab */}
            <div className="bg-stone-900/90 rounded-lg border border-stone-800 shadow-xl overflow-hidden">
              <div className="px-3 sm:px-4 py-2.5 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2 bg-stone-900/60">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-500/10 text-brand-400 border border-brand-500/20 shrink-0">
                    Bài {currentLesson.order_index || currentLesson.order || (currentIndex + 1)}
                  </span>
                  <span className="text-xs text-stone-400 truncate max-w-[200px] sm:max-w-xs">• {courseTitle}</span>

                  {!isStaff && (
                    isCurrentCompleted ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold shrink-0">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Đã hoàn thành</span>
                      </span>
                    ) : (
                      <button
                        onClick={handleManualComplete}
                        disabled={completeState === 'saving'}
                        aria-busy={completeState === 'saving'}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-[11px] font-bold transition shadow-xs shrink-0"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>
                          {completeState === 'saving'
                            ? 'Đang lưu...'
                            : completeState === 'error'
                              ? 'Thử lưu lại'
                              : 'Đánh dấu hoàn thành'}
                        </span>
                      </button>
                    )
                  )}

                  {completeState === 'error' && (
                    <span
                      role="alert"
                      className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-bold text-rose-300 shrink-0"
                    >
                      Không lưu được tiến độ — kiểm tra kết nối rồi thử lại
                    </span>
                  )}

                  {hasNextLesson && (
                    <button
                      onClick={() => nextLessonId && handleLessonChange(nextLessonId)}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-[11px] font-bold transition shrink-0"
                    >
                      <span>Bài kế tiếp</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Tabs điều hướng */}
                <div
                  role="tablist"
                  aria-label="Nội dung bài học"
                  className="flex items-center gap-1 bg-stone-950 p-1 rounded-lg border border-stone-800 text-xs overflow-x-auto max-w-full"
                >
                  <button
                    role="tab"
                    aria-selected={activeTab === 'overview'}
                    onClick={() => setActiveTab('overview')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 ${
                      activeTab === 'overview'
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    Nội dung & Transcript
                  </button>
                  <button
                    role="tab"
                    aria-selected={activeTab === 'materials'}
                    onClick={() => setActiveTab('materials')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 ${
                      activeTab === 'materials'
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    Tài liệu Slide
                  </button>
                  <button
                    role="tab"
                    aria-selected={activeTab === 'quiz'}
                    onClick={() => setActiveTab('quiz')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 ${
                      activeTab === 'quiz'
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    Quiz ôn tập
                  </button>
                  <button
                    role="tab"
                    aria-selected={activeTab === 'summary'}
                    onClick={() => {
                      setActiveTab('summary');
                      const lid = String(currentLesson?.id || activeLessonId || '');
                      if (lid && !summaryData[lid] && !summaryLoading) {
                        void handleFetchSummary(lid);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 flex items-center gap-1.5 ${
                      activeTab === 'summary'
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                        : 'text-purple-400 hover:text-purple-200'
                    }`}
                  >
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    Tóm tắt &amp; Flashcards
                  </button>
                  {/* Tab Chatbot trực tiếp trên Mobile */}
                  <button
                    role="tab"
                    aria-selected={activeTab === 'chat'}
                    onClick={() => setActiveTab('chat')}
                    className={`lg:hidden px-3 py-1.5 rounded-lg font-semibold transition shrink-0 flex items-center gap-1 ${
                      activeTab === 'chat'
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-brand-400 hover:text-brand-200'
                    }`}
                  >
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    AI Tutor
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="p-3 sm:p-4">
                {activeTab === 'overview' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <h1 className="text-base sm:text-lg font-bold text-white leading-snug">
                        {currentLesson.title}
                      </h1>
                      <span className="shrink-0 text-[11px] text-stone-500">
                        {transcriptLines.length > 0
                          ? `${transcriptLines.length} đoạn nội dung`
                          : 'Chưa có transcript'}
                      </span>
                    </div>
                    <div>
                      <p
                        className={`text-xs sm:text-[13px] text-stone-300 leading-relaxed ${
                          showFullDescription ? '' : 'line-clamp-3'
                        }`}
                      >
                        {currentLesson.description ||
                          'Nội dung và mục tiêu học tập của bài giảng đang được đồng bộ.'}
                      </p>
                      {(currentLesson.description || '').length > 240 && (
                        <button
                          type="button"
                          onClick={() => setShowFullDescription((prev) => !prev)}
                          className="mt-1 text-[11px] font-semibold text-brand-400 hover:text-brand-300"
                        >
                          {showFullDescription ? 'Thu gọn mô tả' : 'Đọc thêm mô tả'}
                        </button>
                      )}
                    </div>

                    {/* Nội dung bài giảng: hộp cuộn giới hạn chiều cao để trang gọn */}
                    <div className="rounded-lg bg-stone-950/90 border border-stone-800">
                      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-stone-800">
                        <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${
                          hasIngestedYoutubeTranscript ? 'text-emerald-400' : 'text-stone-400'
                        }`}>
                          <FileCheck className="w-3.5 h-3.5 shrink-0" />
                          {hasIngestedYoutubeTranscript
                            ? `Transcript YouTube${currentLesson?.subtitleLanguage ? ` (${currentLesson.subtitleLanguage})` : ''} · đã nhúng AI`
                            : 'Nội dung bài giảng'}
                        </span>
                        {transcriptLines.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowFullTranscript((prev) => !prev)}
                            aria-expanded={showFullTranscript}
                            className="shrink-0 text-[11px] font-bold text-brand-400 hover:text-brand-300"
                          >
                            {showFullTranscript ? 'Thu gọn' : 'Mở rộng'}
                          </button>
                        )}
                      </div>

                      {transcriptLines.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-stone-400 italic">
                          Chưa có nội dung bài giảng cho bài học này.
                        </p>
                      ) : (
                        <div
                          className={`space-y-1.5 overflow-y-auto px-3 py-2 ${
                            showFullTranscript ? 'max-h-[32rem]' : 'max-h-40'
                          }`}
                        >
                          {transcriptLines.map((line, idx) => {
                            // Chỉ hiển thị mốc có thật trong transcript.
                            const match = line.match(
                              /^\[(\d{1,2}:\d{2}(?::\d{2})?)\s*[–-]\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/,
                            );
                            const timeStamp = match ? `${match[1]}–${match[2]}` : null;
                            const textContent = match ? match[3] : line;

                            return (
                              <p key={idx} className="text-[11.5px] leading-relaxed text-stone-300">
                                {timeStamp && (
                                  <span className="mr-1.5 font-mono text-[10px] font-bold text-brand-400">
                                    {timeStamp}
                                  </span>
                                )}
                                {textContent}
                              </p>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'materials' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                        Học liệu &amp; Slide bài giảng đính kèm
                      </h3>
                      {materialsLoading && (
                        <span className="text-[11px] text-stone-500">Đang tải...</span>
                      )}
                    </div>

                    {lessonMaterials.map((material) => {
                      const meta = [materialTypeLabel(material), formatFileSize(material.size_bytes)]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <div
                          key={material.id}
                          className="p-2.5 rounded-lg bg-stone-950 border border-stone-800 flex items-center justify-between gap-3 hover:border-brand-500/40 transition group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p
                                className="text-xs font-bold text-white group-hover:text-brand-300 transition truncate"
                                title={material.title}
                              >
                                {material.title}
                              </p>
                              <p className="text-[11px] text-stone-500 truncate">
                                {meta ? `${meta} · Tài liệu đính kèm của bài giảng` : 'Tài liệu đính kèm của bài giảng'}
                              </p>
                            </div>
                          </div>
                          <a
                            href={material.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              if (isStaff || !resolvedCourseId || !currentLesson) return;
                              trackLearningEvent({
                                event_type: 'material_open',
                                course_id: resolvedCourseId,
                                lesson_id: currentLesson.id,
                                metadata: {
                                  material_id: material.id,
                                  kind: material.kind,
                                  title: material.title.slice(0, 160),
                                },
                              });
                            }}
                            className="text-xs text-brand-400 hover:text-white bg-brand-500/10 hover:bg-brand-600 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" /> Mở tài liệu
                          </a>
                        </div>
                      );
                    })}

                    {showResourceFallback ? (
                      <div className="p-2.5 rounded-lg bg-stone-950 border border-stone-800 flex items-center justify-between gap-3 hover:border-brand-500/40 transition group">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p
                              className="text-xs font-bold text-white group-hover:text-brand-300 transition truncate"
                              title={resourceUrl}
                            >
                              {sourceLabel(resourceUrl)}
                            </p>
                            <p className="text-[11px] text-stone-500 truncate">
                              Tài liệu học tập chính thức của bài giảng
                            </p>
                          </div>
                        </div>
                        {resourceUrl.startsWith('http') ? (
                          <a
                            href={resourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-brand-400 hover:text-white bg-brand-500/10 hover:bg-brand-600 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" /> Mở tài liệu
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setResourceNotice(
                                `Học liệu “${resourceUrl}” đã được số hóa và dùng cho Tra cứu AI RAG.`
                              )
                            }
                            className="text-xs text-brand-400 hover:text-white bg-brand-500/10 hover:bg-brand-600 px-3.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" /> Xem học liệu
                          </button>
                        )}
                      </div>
                    ) : null}

                    {showResourceFallback && resourceNotice && (
                      <p
                        role="status"
                        className="text-[11px] leading-relaxed text-brand-300 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2"
                      >
                        {resourceNotice}
                      </p>
                    )}

                    {materialsError && (
                      <p
                        role="alert"
                        className="text-[11px] leading-relaxed text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2"
                      >
                        {materialsError}
                      </p>
                    )}

                    {!materialsLoading &&
                      lessonMaterials.length === 0 &&
                      !showResourceFallback && (
                        <div className="p-8 rounded-lg bg-stone-900/60 border border-stone-800 text-center space-y-2">
                          <FileText className="w-8 h-8 text-stone-500 mx-auto" />
                          <p className="text-sm font-semibold text-stone-300">Chưa có tài liệu đính kèm cho bài học này</p>
                          <p className="text-xs text-stone-500">Giảng viên có thể tải lên slide bài giảng hoặc file PDF từ trang Quản lý bài học.</p>
                        </div>
                      )}
                  </div>
                )}

                {activeTab === 'quiz' && (() => {
                  const quizQuestionsList: any[] = activeQuizItem?.questions || [];
                  const lessonNumber =
                    currentLesson.order_index || currentLesson.order || (currentIndex + 1);
                  const quizHref =
                    targetQuizId != null ? `/quiz/${targetQuizId}?courseId=${quizCourseId}` : null;
                  const generateHref = `/quiz/generate?courseId=${quizCourseId}&lessonId=${currentLesson.id}`;
                  const answeredCount = Object.keys(inTabAnswers).length;
                  const allAnswered =
                    quizQuestionsList.length > 0 && answeredCount >= quizQuestionsList.length;
                  const correctCount = quizQuestionsList.reduce((acc: number, q: any, idx: number) => {
                    const answer = q.correct_answer ?? q.correct ?? 'A';
                    return acc + (inTabAnswers[idx + 1] === answer ? 1 : 0);
                  }, 0);

                  // Đề của bài này chưa có (hoặc chỉ có đề của bài khác) → không mượn đề sai bài.
                  if (!activeQuizItem || quizQuestionsList.length === 0) {
                    return (
                      <div className="p-8 rounded-lg bg-stone-900 border border-stone-800 text-center space-y-3">
                        <HelpCircle className="w-8 h-8 text-brand-400 mx-auto opacity-70" />
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-white">
                            Bài {lessonNumber} chưa có đề ôn tập
                          </p>
                          <p className="text-xs text-stone-400 max-w-lg mx-auto leading-relaxed">
                            Mỗi đề chỉ hiển thị đúng bài học đang mở (ràng buộc <code className="text-brand-300">lesson_id</code>),
                            không mượn đề của bài khác để tránh sai kiến thức.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                          {isStaff && (
                            <Link
                              href={generateHref}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-500"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                              Sinh đề cho bài này bằng AI
                            </Link>
                          )}
                          <Link
                            href="/quizzes"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-800 px-4 py-2 text-xs font-bold text-stone-200 transition hover:bg-stone-700"
                          >
                            Xem các đề đã giao
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-900 bg-brand-950 p-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-brand-400 text-xs font-bold uppercase tracking-wider">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> AI Quiz Generator Bloom Taxonomy
                          </div>
                          <h3 className="text-sm sm:text-base font-bold text-white mt-1">
                            {activeQuizItem.title}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-400">
                            <span className="inline-flex items-center gap-1">
                              <Layers className="w-3.5 h-3.5" />
                              Gắn với Bài {lessonNumber}
                            </span>
                            <span>•</span>
                            <span>{quizQuestionsList.length} câu hỏi</span>
                            {activeQuizItem.time_limit ? (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" />
                                  {activeQuizItem.time_limit} phút
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>

                        {quizHref && (
                          <Link
                            href={quizHref}
                            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-md shadow-emerald-950 transition shrink-0"
                          >
                            Phòng thi đầy đủ <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>

                      {/* Interactive In-Tab Quiz */}
                      <div className="space-y-4">
                        {quizQuestionsList.map((q: any, idx: number) => {
                          const num = idx + 1;
                          const options = (q.options || []).map((opt: any, optIdx: number) => ({
                            k: typeof opt === 'object' ? (opt.key || String.fromCharCode(65 + optIdx)) : String.fromCharCode(65 + optIdx),
                            text: typeof opt === 'object' ? (opt.text || String(opt)) : String(opt),
                          }));
                          const correct = q.correct_answer || q.correct || 'A';
                          const explain = q.explanation || 'Chưa có giải thích cho câu hỏi này.';
                          const selectedKey = inTabAnswers[num];
                          const isCorrect = selectedKey === correct;

                          return (
                            <div
                              key={num}
                              className={`p-4 rounded-lg bg-stone-900 border transition ${
                                inTabSubmitted
                                  ? isCorrect
                                    ? 'border-emerald-500/50 bg-emerald-950/10'
                                    : 'border-red-500/50 bg-red-950/10'
                                  : 'border-stone-800'
                              }`}
                            >
                              <div className="flex items-start gap-2.5 mb-3">
                                <span className="w-5 h-5 rounded-md bg-brand-500/20 text-brand-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                  {num}
                                </span>
                                <p className="text-xs sm:text-sm font-semibold text-white">
                                  {q.question_text || q.question}
                                </p>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7" role="group" aria-label={`Đáp án câu ${num}`}>
                                {options.map((opt: any) => {
                                  const isOptSelected = selectedKey === opt.k;
                                  return (
                                    <button
                                      key={opt.k}
                                      type="button"
                                      aria-pressed={isOptSelected}
                                      onClick={() => {
                                        if (!inTabSubmitted) {
                                          setInTabAnswers((prev) => ({ ...prev, [num]: opt.k }));
                                        }
                                      }}
                                      className={`p-2.5 rounded-lg border text-left text-xs transition flex items-center gap-2.5 ${
                                        isOptSelected
                                          ? 'bg-brand-600/30 border-brand-500 text-white font-bold'
                                          : 'bg-stone-950/60 border-stone-800 text-stone-300 hover:border-stone-700'
                                      }`}
                                    >
                                      <span
                                        className={`w-4 h-4 rounded-full border text-[10px] font-bold flex items-center justify-center shrink-0 ${
                                          isOptSelected
                                            ? 'bg-brand-500 border-brand-400 text-white'
                                            : 'border-stone-600 text-stone-500'
                                        }`}
                                      >
                                        {opt.k}
                                      </span>
                                      <span className="truncate">{opt.text}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              {inTabSubmitted && (
                                <div className="mt-3 ml-7 p-3 rounded-lg bg-stone-950/80 border border-stone-800 text-xs space-y-1">
                                  <p className="font-bold text-brand-400 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                    {isCorrect ? '✅ Đáp án chính xác!' : `❌ Chưa đúng! Đáp án đúng là: ${correct}`}
                                  </p>
                                  <p className="text-[11px] text-stone-400 leading-relaxed">
                                    {explain}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          {!inTabSubmitted ? (
                            <button
                              type="button"
                              onClick={() => setInTabSubmitted(true)}
                              disabled={!allAnswered}
                              className="px-6 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold shadow-md shadow-brand-950 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Kiểm tra kết quả & Lời giải AI
                            </button>
                          ) : (
                            <>
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold ${
                                  correctCount === quizQuestionsList.length
                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-brand-500/15 text-brand-200 border border-brand-500/40'
                                }`}
                              >
                                <Award className="w-3.5 h-3.5" />
                                Đúng {correctCount}/{quizQuestionsList.length} câu
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setInTabSubmitted(false);
                                  setInTabAnswers({});
                                }}
                                className="px-5 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold transition"
                              >
                                Làm lại câu hỏi
                              </button>
                            </>
                          )}
                          <span className="text-[11px] text-stone-500">
                            Đã trả lời {answeredCount}/{quizQuestionsList.length}
                          </span>
                        </div>

                        {quizHref && (
                          <Link
                            href={quizHref}
                            className="text-xs text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1"
                          >
                            Thi trắc nghiệm có chấm điểm & lưu chứng chỉ <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {activeTab === 'summary' && (() => {
                  const currentLid = String(currentLesson?.id || activeLessonId || '');
                  const currentSummary = summaryData[currentLid];

                  return (
                    <div className="space-y-5">
                      {/* Tiêu đề & Công cụ tóm tắt */}
                      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-stone-900 border border-purple-800/30">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0">
                            <Sparkles className="w-5 h-5 text-amber-300" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                              Tóm tắt bài học &amp; Flashcards AI
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                Gemini Flash
                              </span>
                            </h3>
                            <p className="text-[11px] text-stone-400">
                              Được AI tự động trích xuất từ video transcript và tài liệu của bài học này.
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={summaryLoading}
                          onClick={() => handleFetchSummary(currentLid)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
                        >
                          {summaryLoading ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              <span>Đang phân tích...</span>
                            </>
                          ) : currentSummary ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Tóm tắt lại</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Tạo tóm tắt ngay</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Trạng thái lỗi */}
                      {summaryError && (
                        <div className="p-3.5 rounded-lg bg-red-950/30 border border-red-500/40 text-red-200 text-xs flex items-start justify-between gap-3">
                          <p className="leading-relaxed">{summaryError}</p>
                          <button
                            type="button"
                            onClick={() => handleFetchSummary(currentLid)}
                            className="shrink-0 text-white font-bold underline hover:text-red-100"
                          >
                            Thử lại
                          </button>
                        </div>
                      )}

                      {/* Trạng thái Loading */}
                      {summaryLoading && (
                        <div className="p-8 rounded-xl bg-stone-900/40 border border-stone-800 text-center space-y-3">
                          <div className="w-10 h-10 mx-auto rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
                            <span className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                          </div>
                          <p className="text-xs font-semibold text-stone-200">
                            AI đang đọc nội dung bài giảng và trích xuất kiến thức trọng tâm...
                          </p>
                          <p className="text-[11px] text-stone-500 max-w-md mx-auto">
                            Quá trình này tổng hợp transcript video, slide bài giảng và cấu trúc thành các thẻ flashcard ghi nhớ.
                          </p>
                        </div>
                      )}

                      {/* Trạng thái Chưa có dữ liệu & Chưa load */}
                      {!summaryLoading && !currentSummary && !summaryError && (
                        <div className="p-8 rounded-xl bg-stone-900/40 border border-dashed border-stone-800 text-center space-y-3">
                          <BookOpen className="w-9 h-9 text-purple-400/60 mx-auto" />
                          <p className="text-xs font-semibold text-stone-300">
                            Chưa có bản tóm tắt nào được tạo cho bài học này.
                          </p>
                          <button
                            type="button"
                            onClick={() => handleFetchSummary(currentLid)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md transition"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Tạo tóm tắt &amp; Flashcards ôn tập bằng AI
                          </button>
                        </div>
                      )}

                      {/* Nội dung kết quả tóm tắt */}
                      {!summaryLoading && currentSummary && (
                        <div className="space-y-6">
                          {/* 1. Tóm tắt súc tích */}
                          <div className="p-4 rounded-xl bg-purple-950/15 border border-purple-900/40 space-y-2">
                            <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-purple-400" />
                              Tóm tắt bài giảng
                            </h4>
                            <p className="text-xs sm:text-sm text-stone-200 leading-relaxed">
                              {currentSummary.summary}
                            </p>
                          </div>

                          {/* 2. Các điểm kiến thức cốt lõi */}
                          {currentSummary.key_points && currentSummary.key_points.length > 0 && (
                            <div className="p-4 rounded-xl bg-stone-900/60 border border-stone-800 space-y-3">
                              <h4 className="text-xs font-bold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-emerald-400" />
                                Điểm kiến thức cốt lõi ({currentSummary.key_points.length})
                              </h4>
                              <div className="grid grid-cols-1 gap-2">
                                {currentSummary.key_points.map((point, idx) => (
                                  <div
                                    key={idx}
                                    className="p-2.5 rounded-lg bg-stone-950/80 border border-stone-800/80 flex items-start gap-2.5"
                                  >
                                    <span className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                      {idx + 1}
                                    </span>
                                    <p className="text-xs text-stone-300 leading-relaxed">
                                      {point}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 3. Flashcards ôn tập */}
                          {currentSummary.flashcards && currentSummary.flashcards.length > 0 && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                                  <GraduationCap className="w-4 h-4 text-amber-400" />
                                  Flashcards ôn tập nhanh ({currentSummary.flashcards.length})
                                </h4>
                                <span className="text-[11px] text-stone-500">
                                  Bấm vào thẻ để lật xem đáp án
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {currentSummary.flashcards.map((fc, idx) => {
                                  const isFlipped = !!flippedCards[idx];
                                  return (
                                    <div
                                      key={idx}
                                      onClick={() =>
                                        setFlippedCards((prev) => ({
                                          ...prev,
                                          [idx]: !prev[idx],
                                        }))
                                      }
                                      className={`cursor-pointer p-4 rounded-xl border transition-all duration-200 select-none flex flex-col justify-between min-h-[140px] ${
                                        isFlipped
                                          ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm'
                                          : 'bg-stone-900/80 border-stone-800 hover:border-purple-500/50 hover:bg-stone-900'
                                      }`}
                                    >
                                      <div>
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-stone-800 text-stone-400">
                                            {fc.topic || `Thẻ #${idx + 1}`}
                                          </span>
                                          <span
                                            className={`text-[10px] font-semibold ${
                                              isFlipped ? 'text-emerald-400' : 'text-purple-400'
                                            }`}
                                          >
                                            {isFlipped ? 'Đáp án (Click lật lại)' : 'Câu hỏi (Click xem đáp án)'}
                                          </span>
                                        </div>

                                        <p className="text-xs sm:text-sm font-semibold text-white leading-relaxed">
                                          {isFlipped ? fc.answer : fc.question}
                                        </p>
                                      </div>

                                      <div className="pt-3 mt-3 border-t border-stone-800/60 flex items-center justify-between text-[11px] text-stone-500">
                                        <span>{isFlipped ? '✅ Lời giải chi tiết' : '❓ Tự trả lời trước'}</span>
                                        <span className="text-purple-400 text-[10px] font-bold">
                                          {isFlipped ? 'Xem lại câu hỏi ↺' : 'Lật xem giải đáp ➔'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 4. Từ khóa trọng tâm */}
                          {currentSummary.keywords && currentSummary.keywords.length > 0 && (
                            <div className="p-3.5 rounded-xl bg-stone-900/40 border border-stone-800 space-y-2">
                              <h4 className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                                Từ khóa trọng tâm bài học
                              </h4>
                              <div className="flex flex-wrap gap-1.5">
                                {currentSummary.keywords.map((kw, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2.5 py-1 rounded-lg bg-stone-800/90 hover:bg-purple-900/30 text-stone-300 hover:text-purple-200 border border-stone-700/60 text-xs font-medium transition cursor-default"
                                  >
                                    #{kw}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {activeTab === 'chat' && (
                  <div className="h-[480px] rounded-lg overflow-hidden border border-stone-800 bg-white">
                    <ChatBox
                      key={`chat-tab-${currentLesson.id}`}
                      lessonId={String(currentLesson.id)}
                      courseId={resolvedCourseId || courseId}
                      lessonTitle={currentLesson.title}
                      onSeek={(seconds) => setSeekRequest({ seconds, token: Date.now() })}
                      initialPrompt={askedQuestion || undefined}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* ── Cột 3: Trợ lý Gia sư AI Desktop (Docked Panel) ── */}
        {isChatOpen && (
          <aside className="hidden lg:flex w-80 xl:w-96 shrink-0 h-full border-l border-stone-800 bg-white flex-col z-20 shadow-2xl transition-all duration-300">
            <ChatBox
              key={`chat-docked-${currentLesson.id}`}
              lessonId={String(currentLesson.id)}
              courseId={resolvedCourseId || courseId}
              lessonTitle={currentLesson.title}
              onSeek={(seconds) => setSeekRequest({ seconds, token: Date.now() })}
            />
          </aside>
        )}

        {/* ── Mobile AI Tutor Drawer ── */}
        {mobileChatOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex justify-end">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileChatOpen(false)}
            />
            {/* Drawer Panel */}
            <div className="relative w-full sm:w-[420px] bg-white flex flex-col z-10 shadow-2xl h-full animate-in slide-in-from-right duration-200">
              <div className="p-3 bg-stone-900 text-white flex items-center justify-between border-b border-stone-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span className="text-xs font-bold">Gia sư Ảo AI 24/7 (Lesson RAG)</span>
                </div>
                <button
                  onClick={() => setMobileChatOpen(false)}
                  aria-label="Đóng khung trò chuyện AI"
                  className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatBox
                  key={`chat-drawer-${currentLesson.id}`}
                  lessonId={String(currentLesson.id)}
                  courseId={resolvedCourseId || courseId}
                  lessonTitle={currentLesson.title}
                  onSeek={(seconds) => setSeekRequest({ seconds, token: Date.now() })}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
