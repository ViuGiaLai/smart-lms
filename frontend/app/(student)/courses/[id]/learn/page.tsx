'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
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
} from 'lucide-react';
import VideoPlayer from '@/components/course/VideoPlayer';
import ProgressBar from '@/components/course/ProgressBar';
import ChatBox from '@/components/ai-tutor/ChatBox';
import { coursesApi } from '@/lib/api';

interface LessonItem {
  id: string | number;
  title: string;
  duration?: number | string;
  video_url?: string;
  videoUrl?: string;
  order_index?: number;
  order?: number;
  transcript?: string;
  description?: string;
  resources_url?: string;
}

export default function LearnPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const courseId = (params?.id as string) || '1';
  const initialLessonId = searchParams?.get('lessonId') || '1';

  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [courseTitle, setCourseTitle] = useState('Đang tải khóa học...');
  const [activeLessonId, setActiveLessonId] = useState<string>(initialLessonId);
  const [progress, setProgress] = useState(0);
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'materials' | 'quiz' | 'chat'>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [mobilePlaylistOpen, setMobilePlaylistOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [inTabAnswers, setInTabAnswers] = useState<Record<number, string>>({});
  const [inTabSubmitted, setInTabSubmitted] = useState(false);
  const [courseQuizzes, setCourseQuizzes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [courseInstructorId, setCourseInstructorId] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('currentUser');
      if (stored) setCurrentUser(JSON.parse(stored));
    } catch {}
  }, []);

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
      try {
        const res = await coursesApi.getById(courseId);
        if (res.data?.data && isMounted) {
          const c = res.data.data;
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
            setActiveLessonId(String(matchedLesson ? matchedLesson.id : c.lessons[0].id));
          } else {
            setLessons([]);
          }
          if (c.quizzes && c.quizzes.length > 0) {
            setCourseQuizzes(c.quizzes);
          }
        }

        // Tải tiến độ thực tế đã lưu trong PostgreSQL
        const progRes = await coursesApi.getProgress(courseId);
        if (progRes.data?.data && isMounted) {
          const p = progRes.data.data;
          if (p.completedLessons) setCompletedLessonIds(p.completedLessons);
          if (p.percentage !== undefined) setProgress(p.percentage);
        }
      } catch (err) {
        console.error('Lỗi tải dữ liệu bài giảng từ máy chủ:', err);
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

  const currentIndex = lessons.findIndex((l) => String(l.id) === String(activeLessonId));
  const hasNextLesson = currentIndex >= 0 && currentIndex < lessons.length - 1;
  const nextLessonId = hasNextLesson ? lessons[currentIndex + 1].id : null;
  const activeQuizItem = courseQuizzes.find((q: any) =>
    q.title?.toLowerCase().includes(`bài ${currentLesson?.order || currentLesson?.order_index || (currentIndex + 1)}`)
  ) || courseQuizzes[0];
  const targetQuizId = activeQuizItem?.id || currentLesson?.id || '1';

  const isCurrentCompleted = completedLessonIds.includes(String(currentLesson?.id));

  const handleManualComplete = async () => {
    if (isStaff || !currentLesson) return;
    const lid = String(currentLesson.id);
    if (!completedLessonIds.includes(lid)) {
      const nextCompleted = [...completedLessonIds, lid];
      setCompletedLessonIds(nextCompleted);
      const newPct = Math.round((nextCompleted.length / (lessons.length || 1)) * 100);
      setProgress(newPct);
    }
    try {
      await coursesApi.markLessonComplete(courseId, lid, (currentLesson.duration as number) || 1800);
    } catch (err) {
      console.warn('Lỗi lưu tiến độ bài học:', err);
    }
  };

  const handleLessonChange = (lessonId: string | number) => {
    setActiveLessonId(String(lessonId));
    setInTabAnswers({});
    setInTabSubmitted(false);
    setMobilePlaylistOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-slate-950 text-slate-100 items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-400">Đang nạp bài giảng từ cơ sở dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (lessons.length === 0) {
    return (
      <div className="flex flex-col h-screen bg-slate-950 text-slate-100 items-center justify-center font-sans p-6 text-center">
        <div className="max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-4 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mx-auto">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white mb-1">Khóa học đang được cập nhật</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Khóa học &quot;{courseTitle}&quot; hiện chưa có video bài giảng nào trong cơ sở dữ liệu. Giảng viên đang tiếp tục hoàn thiện học liệu.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => router.push('/courses')}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-md shadow-indigo-500/20"
            >
              Xem các khóa học khác
            </button>
            <button
              onClick={() => router.push(`/courses/${courseId}`)}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Xem giới thiệu khóa
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* ── Top Bar ── */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between shrink-0 z-30 shadow-md">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push(`/courses/${courseId}`);
              }
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 px-2.5 sm:px-3 py-1.5 rounded-lg transition shrink-0"
            title="Quay lại trang trước đó"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Quay lại</span>
          </button>
          <div className="h-4 w-px bg-slate-800 hidden sm:block shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hidden md:inline-block shrink-0">
              Focus Player
            </span>
            <h2 className="text-xs sm:text-sm font-semibold text-slate-200 truncate max-w-[150px] sm:max-w-[260px] md:max-w-md">
              {currentLesson.title}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {isStaff && (
            <Link
              href={`/courses/${courseId}/manage`}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 transition"
              title="Quản lý học liệu của khóa học này"
            >
              <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Quản lý học liệu</span>
            </Link>
          )}

          <div className="w-28 sm:w-40 hidden md:block">
            <ProgressBar progress={progress} label="Tiến độ học tập" className="text-slate-300 text-[11px]" />
          </div>

          {/* Nút mở danh sách bài trên Mobile */}
          <button
            onClick={() => setMobilePlaylistOpen(true)}
            className="lg:hidden flex items-center gap-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition"
            title="Danh sách bài học"
          >
            <ListOrdered className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden xs:inline">Bài học</span>
          </button>

          <Link
            href={`/quiz/${targetQuizId}?courseId=${courseId}`}
            className="flex items-center gap-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 sm:px-3.5 py-1.5 rounded-lg shadow-sm transition shadow-emerald-900/30"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Trắc nghiệm</span>
            <span className="sm:hidden text-[11px]">Quiz</span>
          </Link>

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
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
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
          } hidden lg:flex shrink-0 bg-slate-900/95 border-r border-slate-800 flex-col transition-all duration-300 overflow-hidden z-20`}
        >
          <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Giáo trình ({lessons.length} bài)
              </span>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="text-slate-500 hover:text-slate-300 p-1 rounded-md"
              title="Thu gọn danh sách"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-slate-800/40">
            {lessons.map((lesson, idx) => {
              const isActive = String(lesson.id) === String(activeLessonId);
              const isCompleted = completedLessonIds.includes(String(lesson.id));

              return (
                <button
                  key={lesson.id}
                  onClick={() => handleLessonChange(lesson.id)}
                  className={`w-full text-left p-3 rounded-xl transition flex items-start gap-3 group pt-2.5 ${
                    isActive
                      ? 'bg-indigo-600/15 border border-indigo-500/40 text-white'
                      : 'hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                          isActive
                            ? 'border-indigo-400 text-indigo-300 bg-indigo-500/20'
                            : 'border-slate-600 text-slate-500 group-hover:border-slate-400'
                        }`}
                      >
                        {idx + 1}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-semibold leading-snug line-clamp-2 ${
                        isActive ? 'text-indigo-200' : 'text-slate-300 group-hover:text-white'
                      }`}
                    >
                      {lesson.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {typeof lesson.duration === 'number'
                          ? `${Math.round(lesson.duration / 60)} phút`
                          : lesson.duration || '45 phút'}
                      </span>
                      <span>•</span>
                      <span className="text-indigo-400/80">Có Video & RAG</span>
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
            className="hidden lg:flex absolute left-2 top-3 z-30 bg-slate-800/90 hover:bg-slate-700 text-slate-300 p-2 rounded-xl shadow-lg border border-slate-700 transition"
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
            <div className="relative w-80 max-w-[85vw] bg-slate-900 border-r border-slate-800 flex flex-col z-10 shadow-2xl h-full animate-in slide-in-from-left duration-200">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
                <div className="flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Giáo trình ({lessons.length} bài)
                  </span>
                </div>
                <button
                  onClick={() => setMobilePlaylistOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-slate-800/40">
                {lessons.map((lesson, idx) => {
                  const isActive = String(lesson.id) === String(activeLessonId);
                  const isCompleted = completedLessonIds.includes(String(lesson.id));

                  return (
                    <button
                      key={lesson.id}
                      onClick={() => handleLessonChange(lesson.id)}
                      className={`w-full text-left p-3 rounded-xl transition flex items-start gap-3 pt-2.5 ${
                        isActive
                          ? 'bg-indigo-600/20 border border-indigo-500/40 text-white'
                          : 'hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isCompleted ? (
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                              isActive
                                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/20'
                                : 'border-slate-600 text-slate-500'
                            }`}
                          >
                            {idx + 1}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-xs font-semibold leading-snug line-clamp-2 ${
                            isActive ? 'text-indigo-200' : 'text-slate-300'
                          }`}
                        >
                          {lesson.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {typeof lesson.duration === 'number'
                              ? `${Math.round(lesson.duration / 60)} phút`
                              : lesson.duration || '45 phút'}
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
        <main className="flex-1 flex flex-col overflow-y-auto bg-slate-950 p-3 sm:p-5 lg:p-6 space-y-4 sm:space-y-6 min-w-0">
          <div className="max-w-5xl mx-auto w-full space-y-4 sm:space-y-5">
            {/* Trình phát Video hỗ trợ YouTube Embed & MP4 */}
            <VideoPlayer
              videoUrl={currentLesson.video_url || currentLesson.videoUrl}
              title={currentLesson.title}
              onProgress={(p) => setProgress(Math.max(progress, p))}
              onEnded={() => {
                if (isStaff) return;
                if (!completedLessonIds.includes(String(currentLesson.id))) {
                  setCompletedLessonIds((prev) => [...prev, String(currentLesson.id)]);
                }
                setProgress(100);
                const dur = typeof currentLesson.duration === 'number' ? currentLesson.duration : 2700;
                coursesApi.markLessonComplete(courseId, String(currentLesson.id), dur).catch((err) => {
                  console.warn('Lỗi ghi nhận tiến độ vào PostgreSQL:', err);
                });
              }}
            />

            {/* Thông tin bài học & Thanh điều hướng Tab */}
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
              <div className="px-4 sm:px-6 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/60">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                    Bài {currentLesson.order_index || currentLesson.order || (currentIndex + 1)}
                  </span>
                  <span className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-xs">• {courseTitle}</span>

                  {!isStaff && (
                    isCurrentCompleted ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold shrink-0">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Đã hoàn thành</span>
                      </span>
                    ) : (
                      <button
                        onClick={handleManualComplete}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition shadow-xs shrink-0"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Đánh dấu hoàn thành</span>
                      </button>
                    )
                  )}

                  {hasNextLesson && (
                    <button
                      onClick={() => nextLessonId && handleLessonChange(nextLessonId)}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold transition shrink-0"
                    >
                      <span>Bài kế tiếp</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Tabs điều hướng */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto max-w-full">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 ${
                      activeTab === 'overview'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Nội dung & Transcript
                  </button>
                  <button
                    onClick={() => setActiveTab('materials')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 ${
                      activeTab === 'materials'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Tài liệu Slide
                  </button>
                  <button
                    onClick={() => setActiveTab('quiz')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition shrink-0 ${
                      activeTab === 'quiz'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Quiz ôn tập
                  </button>
                  {/* Tab Chatbot trực tiếp trên Mobile */}
                  <button
                    onClick={() => setActiveTab('chat')}
                    className={`lg:hidden px-3 py-1.5 rounded-lg font-semibold transition shrink-0 flex items-center gap-1 ${
                      activeTab === 'chat'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-indigo-400 hover:text-indigo-200'
                    }`}
                  >
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    AI Tutor
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="p-4 sm:p-6">
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    <h1 className="text-lg sm:text-xl font-bold text-white">{currentLesson.title}</h1>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      {currentLesson.description ||
                        'Nội dung và mục tiêu học tập của bài giảng đang được đồng bộ.'}
                    </p>

                    {/* Phụ đề Transcript & Mốc thời gian */}
                    <div className="mt-4 p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                        <span className="flex items-center gap-1.5 text-indigo-400">
                          <FileCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                          Phụ đề Transcript & Mốc thời gian (Đã đồng bộ Vector pgvector)
                        </span>
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0 font-bold">
                          Lesson-Bounded RAG Active
                        </span>
                      </div>

                      {/* Danh sách các mốc thời gian */}
                      {currentLesson.transcript ? (
                        <div className="space-y-2">
                          {currentLesson.transcript
                            .split('\n')
                            .filter((line) => line.trim())
                            .map((line, idx) => {
                              const match = line.match(/^(\[\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\])\s*(.*)$/);
                              const timeStamp = match ? match[1] : `[0${idx}:00]`;
                              const textContent = match ? match[2] : line;

                              return (
                                <div
                                  key={idx}
                                  className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-indigo-500/40 transition flex items-start gap-3 group"
                                >
                                  <span className="px-2 py-1 rounded-md text-[11px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                                    {timeStamp}
                                  </span>
                                  <p className="text-xs text-slate-300 leading-relaxed flex-1">
                                    {textContent}
                                  </p>
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic py-2">
                          Chưa có nội dung phụ đề transcript được nhập cho bài học này.
                        </p>
                      )}

                      <p className="text-[11px] text-slate-500 italic pt-1">
                        💡 Trợ lý Gia sư AI sẽ ưu tiên dựa trên nội dung bài giảng để giải đáp kiến thức theo sát tài liệu.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'materials' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                        Học liệu & Slide bài giảng đính kèm
                      </h3>
                    </div>

                    {currentLesson.resources_url ? (
                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between hover:border-indigo-500/40 transition group">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 shadow-inner">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white group-hover:text-indigo-300 transition">
                              {currentLesson.resources_url}
                            </p>
                            <p className="text-[11px] text-slate-500">Tài liệu học tập chính thức của bài giảng</p>
                          </div>
                        </div>
                        {currentLesson.resources_url.startsWith('http') ? (
                          <a
                            href={currentLesson.resources_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-600 px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" /> Mở tài liệu trực tuyến
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              alert(`Học liệu "${currentLesson.resources_url}" đã được số hóa và sẵn sàng cho Tra cứu AI RAG.`);
                            }}
                            className="text-xs text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-600 px-3.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" /> Xem học liệu
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
                        <FileText className="w-8 h-8 text-slate-500 mx-auto" />
                        <p className="text-sm font-semibold text-slate-300">Chưa có tài liệu đính kèm cho bài học này</p>
                        <p className="text-xs text-slate-500">Giảng viên có thể tải lên slide bài giảng hoặc file PDF từ trang Quản lý bài học.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'quiz' && (() => {
                  const activeQuizItem = courseQuizzes.find((q: any) =>
                    q.title?.toLowerCase().includes(`bài ${currentLesson.order || currentLesson.order_index || (currentIndex + 1)}`)
                  ) || courseQuizzes[0];
                  const quizQuestionsList = activeQuizItem?.questions || [];
                  const targetQuizId = activeQuizItem?.id || currentLesson.id;

                  return (
                    <div className="space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-indigo-950 to-slate-900 border border-indigo-900/50">
                        <div>
                          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> AI Quiz Generator Bloom Taxonomy
                          </div>
                          <h3 className="text-sm sm:text-base font-bold text-white mt-1">
                            {activeQuizItem?.title || `Trắc nghiệm nhanh củng cố Bài ${currentLesson.order_index || currentLesson.order || (currentIndex + 1)}`}
                          </h3>
                          <p className="text-xs text-slate-400">
                            {activeQuizItem?.description || 'Được sinh tự động từ nội dung bài giảng và tài liệu vector pgvector.'}
                          </p>
                        </div>

                        {activeQuizItem && (
                          <Link
                            href={`/quiz/${targetQuizId}?courseId=${courseId}`}
                            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md shadow-emerald-950 transition shrink-0"
                          >
                            Phòng thi đầy đủ <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>

                      {/* Interactive In-Tab Quiz */}
                      <div className="space-y-4">
                        {quizQuestionsList.length === 0 ? (
                          <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2">
                            <HelpCircle className="w-8 h-8 text-indigo-400 mx-auto opacity-70" />
                            <p className="text-sm font-bold text-white">Chưa có bài trắc nghiệm trong cơ sở dữ liệu cho bài học này</p>
                            <p className="text-xs text-slate-400">Giảng viên có thể sử dụng AI Quiz Studio để sinh bộ đề trắc nghiệm và lưu vào PostgreSQL.</p>
                          </div>
                        ) : (
                          quizQuestionsList.map((q: any, idx: number) => {
                            const num = idx + 1;
                            const options = (q.options || []).map((opt: any, optIdx: number) => ({
                              k: typeof opt === 'object' ? (opt.key || String.fromCharCode(65 + optIdx)) : String.fromCharCode(65 + optIdx),
                              text: typeof opt === 'object' ? (opt.text || String(opt)) : String(opt),
                            }));
                            const correct = q.correct_answer || q.correct || 'A';
                            const explain = q.explanation || 'Được phân tích và suy luận từ tài liệu bài giảng.';
                            const selectedKey = inTabAnswers[num];
                            const isCorrect = selectedKey === correct;

                            return (
                              <div
                                key={num}
                                className={`p-4 rounded-2xl bg-slate-900 border transition ${
                                  inTabSubmitted
                                    ? isCorrect
                                      ? 'border-emerald-500/50 bg-emerald-950/10'
                                      : 'border-red-500/50 bg-red-950/10'
                                    : 'border-slate-800'
                                }`}
                              >
                                <div className="flex items-start gap-2.5 mb-3">
                                  <span className="w-5 h-5 rounded-md bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                    {num}
                                  </span>
                                  <p className="text-xs sm:text-sm font-semibold text-white">
                                    {q.question_text}
                                  </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
                                  {options.map((opt: any) => {
                                    const isOptSelected = selectedKey === opt.k;
                                    return (
                                      <button
                                        key={opt.k}
                                        type="button"
                                        onClick={() => {
                                          if (!inTabSubmitted) {
                                            setInTabAnswers((prev) => ({ ...prev, [num]: opt.k }));
                                          }
                                        }}
                                        className={`p-2.5 rounded-xl border text-left text-xs transition flex items-center gap-2.5 ${
                                          isOptSelected
                                            ? 'bg-indigo-600/30 border-indigo-500 text-white font-bold'
                                            : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                                        }`}
                                      >
                                        <span
                                          className={`w-4 h-4 rounded-full border text-[10px] font-bold flex items-center justify-center shrink-0 ${
                                            isOptSelected
                                              ? 'bg-indigo-500 border-indigo-400 text-white'
                                              : 'border-slate-600 text-slate-500'
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
                                  <div className="mt-3 ml-7 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-1">
                                    <p className="font-bold text-indigo-400 flex items-center gap-1.5">
                                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                      {isCorrect ? '✅ Đáp án chính xác!' : `❌ Chưa đúng! Đáp án đúng là: ${correct}`}
                                    </p>
                                    <p className="text-[11px] text-slate-400 leading-relaxed">
                                      {explain}
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        {!inTabSubmitted ? (
                          <button
                            type="button"
                            onClick={() => setInTabSubmitted(true)}
                            disabled={Object.keys(inTabAnswers).length < 2}
                            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-950 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Kiểm tra kết quả & Lời giải AI
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setInTabSubmitted(false);
                              setInTabAnswers({});
                            }}
                            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
                          >
                            Làm lại câu hỏi
                          </button>
                        )}

                        <Link
                          href={`/quiz/${targetQuizId}?courseId=${courseId}`}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                        >
                          Thi trắc nghiệm có chấm điểm & lưu chứng chỉ <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })()}

                {activeTab === 'chat' && (
                  <div className="h-[480px] rounded-2xl overflow-hidden border border-slate-800 bg-white">
                    <ChatBox
                      lessonId={String(currentLesson.id)}
                      courseId={courseId}
                      lessonTitle={currentLesson.title}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* ── Cột 3: Trợ lý Gia sư AI Desktop (Docked Panel) ── */}
        {isChatOpen && (
          <aside className="hidden lg:flex w-80 xl:w-96 shrink-0 h-full border-l border-slate-800 bg-white flex-col z-20 shadow-2xl transition-all duration-300">
            <ChatBox
              lessonId={String(currentLesson.id)}
              courseId={courseId}
              lessonTitle={currentLesson.title}
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
              <div className="p-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span className="text-xs font-bold">Gia sư Ảo AI 24/7 (Lesson RAG)</span>
                </div>
                <button
                  onClick={() => setMobileChatOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatBox
                  lessonId={String(currentLesson.id)}
                  courseId={courseId}
                  lessonTitle={currentLesson.title}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
