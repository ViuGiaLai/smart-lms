'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  PlusCircle,
  Video,
  FileText,
  Sparkles,
  Eye,
  Trash2,
  CheckCircle2,
  Clock,
  Upload,
  ExternalLink,
  BookOpen,
  Save,
  HelpCircle,
  Edit3,
  Wand2,
  Check,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { coursesApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';

interface LessonItem {
  id: string | number;
  title: string;
  order_index?: number;
  duration?: number;
  video_url?: string;
  transcript?: string;
  resources_url?: string;
}

interface QuizOptionItem {
  key: string;
  text: string;
}

interface GeneratedQuizQuestion {
  question_number: number;
  question_text: string;
  options: QuizOptionItem[];
  correct_option: string;
  explanation: string;
}

export default function CourseManagePage() {
  const { isAuthorized } = useRoleGuard(['instructor', 'admin']);
  const params = useParams();
  const router = useRouter();
  const courseId = (params?.id as string) || '1';

  const [courseTitle, setCourseTitle] = useState('Đang tải thông tin khóa học...');
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [courseQuizzes, setCourseQuizzes] = useState<any[]>([]);
  const [courseStatus, setCourseStatus] = useState<string>('draft');

  // Form thêm bài học mới
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newDuration, setNewDuration] = useState('45');
  const [newTranscript, setNewTranscript] = useState('');
  const [newResourcesUrl, setNewResourcesUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // AI Quiz Studio State
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<GeneratedQuizQuestion[]>([]);
  const [numQuizQuestions, setNumQuizQuestions] = useState(3);
  const [quizDifficulty, setQuizDifficulty] = useState('Medium');

  // Hàm trích xuất YouTube Embed URL an toàn
  const getYouTubeEmbedUrl = (url: string) => {
    if (!url) return '';
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : '';
  };

  // Fetch course details from backend if available and verify ownership
  useEffect(() => {
    let isMounted = true;
    const fetchCourse = async () => {
      try {
        const res = await coursesApi.getById(courseId);
        if (res.data?.data && isMounted) {
          const c = res.data.data;
          const stored = typeof window !== 'undefined' ? localStorage.getItem('currentUser') : null;
          const user = stored ? JSON.parse(stored) : null;
          if (user && user.role !== 'admin' && c.instructor?.id && String(user.id) !== String(c.instructor.id)) {
            alert('Bạn không có quyền quản lý khóa học của giảng viên khác.');
            router.push('/instructor-dashboard');
            return;
          }
          setCourseTitle(c.title || courseTitle);
          setLessons(c.lessons || []);
          setCourseQuizzes(c.quizzes || []);
          setCourseStatus(c.status || 'draft');
        }
      } catch (err) {
        console.error('Lỗi khi nạp dữ liệu khóa học:', err);
      }
    };
    fetchCourse();
    return () => {
      isMounted = false;
    };
  }, [courseId, router]);

  // AI Sinh bộ trắc nghiệm từ nội dung bài giảng (Xem trước trực tiếp từ Gemini mà không lưu đè DB)
  const handleAiGenerateQuiz = async () => {
    const topic = newTitle.trim() || courseTitle;
    setIsGeneratingQuiz(true);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const res = await fetch(`${apiUrl}/api/v1/ai-quiz-gen/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          topic: `${topic}. ${newTranscript.slice(0, 200)}`,
          course_id: parseInt(courseId, 10) || undefined,
          num_questions: numQuizQuestions,
          difficulty: quizDifficulty.toLowerCase(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const mapped: GeneratedQuizQuestion[] = (data.questions || []).map((q: any, idx: number) => ({
          question_number: idx + 1,
          question_text: q.question_text || `Câu hỏi ${idx + 1}`,
          options: (q.options || []).map((opt: any, optIdx: number) => ({
            key: opt.key || String.fromCharCode(65 + optIdx),
            text: opt.text || String(opt),
          })),
          correct_option: q.correct_answer || q.correct_option || 'A',
          explanation: q.explanation || 'Phân tích suy luận từ tài liệu bài giảng.',
        }));
        setQuizQuestions(mapped);
      } else {
        const errJson = await res.json().catch(() => null);
        alert(errJson?.detail || 'Không thể tự động sinh câu hỏi qua AI service. Giảng viên có thể tự thêm câu hỏi hoặc thử lại.');
      }
    } catch (err: any) {
      alert('Lỗi kết nối khi gọi AI: ' + (err.message || 'Vui lòng thử lại'));
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleUpdateQuestionText = (index: number, text: string) => {
    setQuizQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, question_text: text } : q))
    );
  };

  const handleUpdateOptionText = (qIndex: number, optKey: string, text: string) => {
    setQuizQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex
          ? {
              ...q,
              options: q.options.map((opt) => (opt.key === optKey ? { ...opt, text } : opt)),
            }
          : q
      )
    );
  };

  const handleChangeCorrectOption = (qIndex: number, newCorrect: string) => {
    setQuizQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, correct_option: newCorrect } : q))
    );
  };

  const handleRemoveQuestion = (index: number) => {
    setQuizQuestions((prev) =>
      prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, question_number: i + 1 }))
    );
  };

  // Tạo bài học và lưu kèm bộ Quiz
  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    const orderIndex = lessons.length + 1;
    const durationSeconds = parseInt(newDuration, 10) * 60 || 2700;

    const newLessonData: LessonItem = {
      id: Date.now(),
      title: newTitle.trim(),
      order_index: orderIndex,
      duration: durationSeconds,
      video_url: newVideoUrl.trim() || undefined,
      transcript: newTranscript.trim() || undefined,
      resources_url: newResourcesUrl.trim() || undefined,
    };

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // 1. Tạo bài học trong database qua instructor API
      const res = await fetch(`${apiUrl}/api/v1/courses/${courseId}/lessons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: newLessonData.title,
          order_index: newLessonData.order_index,
          duration: newLessonData.duration,
          video_url: newLessonData.video_url,
          transcript: newLessonData.transcript,
          resources_url: newLessonData.resources_url,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setLessons((prev) => [...prev, created]);
      } else {
        const errData = await res.json().catch(() => null);
        alert('Tạo bài học thất bại: ' + (errData?.detail || 'Lỗi máy chủ'));
        return;
      }

      // 2. Nếu có bộ câu hỏi Quiz đã duyệt, lưu vào bảng quizzes
      if (quizQuestions.length > 0) {
        try {
          await fetch(`${apiUrl}/api/v1/courses/${courseId}/quizzes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              title: `Trắc nghiệm ôn tập: ${newTitle.trim()}`,
              description: `Bộ đề củng cố kiến thức bài giảng #${orderIndex}`,
              time_limit: 600,
              pass_score: 0.6,
              questions: quizQuestions.map((q, idx) => ({
                question_text: q.question_text,
                options: q.options,
                correct_answer: q.correct_option,
                explanation: q.explanation,
                order_index: idx + 1,
              })),
            }),
          });
        } catch (quizErr) {
          console.warn('Lỗi khi lưu đề thi vào PostgreSQL:', quizErr);
        }
      }
    } catch (err: any) {
      alert('Lỗi kết nối khi tạo bài học: ' + (err.message || 'Vui lòng thử lại'));
      return;
    } finally {
      setIsSubmitting(false);
      setShowAddForm(false);
      setNewTitle('');
      setNewVideoUrl('');
      setNewTranscript('');
      setQuizQuestions([]);
      setSuccessMessage('🎉 Đã thêm bài học & bộ Quiz thành công vào hệ thống!');
      setTimeout(() => setSuccessMessage(''), 4000);
    }
  };

  const handleDeleteLesson = async (lessonId: string | number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa bài học này khỏi cơ sở dữ liệu?')) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/v1/courses/${courseId}/lessons/${lessonId}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok || res.status === 204) {
        setLessons((prev) => prev.filter((l) => l.id !== lessonId));
      } else {
        const errJson = await res.json().catch(() => null);
        alert(errJson?.detail || 'Không thể xóa bài học trên cơ sở dữ liệu.');
      }
    } catch (err: any) {
      alert('Lỗi kết nối khi xóa bài học: ' + (err.message || 'Thử lại sau'));
    }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs font-semibold text-slate-500">
        Đang xác thực quyền Giảng viên...
      </div>
    );
  }

  const embedUrl = getYouTubeEmbedUrl(newVideoUrl);

  return (
    <div className="pb-32 md:pb-16 font-sans">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/instructor-dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Bảng điều khiển Giảng viên
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/quiz/bank"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-indigo-600 px-3.5 py-1.5 rounded-xl shadow-2xs transition"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" /> Ngân hàng đề thi
            </Link>

            <Link
              href={`/courses/${courseId}/learn?preview=true`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-3.5 py-1.5 rounded-xl shadow-2xs transition"
            >
              <Eye className="w-3.5 h-3.5" /> Xem trước bài giảng (Focus Player)
            </Link>
          </div>
        </div>

        {/* Course Header Banner */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-200">
                Khóa học #{courseId}
              </span>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                courseStatus === 'published'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {courseStatus === 'published' ? '✓ Đã xuất bản' : '✏️ Bản nháp'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {courseTitle}
            </h1>
            <p className="text-xs text-slate-500">
              Quản lý học liệu đa phương tiện (Video YouTube, Slide PDF), trích xuất Transcript cho pgvector và duyệt Bộ đề trắc nghiệm AI
            </p>
          </div>

          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md shadow-indigo-100 transition shrink-0"
          >
            <PlusCircle className="w-4 h-4" /> Soạn thảo bài học mới
          </button>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {successMessage}
          </div>
        )}

        {/* Form thêm bài học tích hợp Video YouTube + Slide + AI Quiz Generator */}
        {showAddForm && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-indigo-400 shadow-lg space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    Studio Soạn thảo Bài giảng & Nạp Học liệu AI
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Dữ liệu bạn nạp tại đây sẽ hiển thị trực tiếp cho học viên và làm tri thức cho Trợ lý Gia sư AI.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold px-2 py-1"
              >
                Đóng ✕
              </button>
            </div>

            <form onSubmit={handleCreateLesson} className="space-y-5">
              {/* 1. Tiêu đề & Thời lượng */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tiêu đề bài học *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ví dụ: Bài 4: Tích hợp Vector Database và RAG Pipeline"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Thời lượng ước tính (phút)
                  </label>
                  <input
                    type="number"
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* 2. Khối Video YouTube với Live Preview */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-rose-600" />
                    Đường dẫn Video YouTube bài giảng
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Hỗ trợ link: https://www.youtube.com/watch?v=... hoặc https://youtu.be/...
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    placeholder="Dán đường dẫn video YouTube (ví dụ: https://www.youtube.com/watch?v=...)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                {/* Trình phát Video Preview thu nhỏ */}
                {embedUrl && (
                  <div className="pt-2">
                    <p className="text-[11px] font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5 text-indigo-600" /> Xem trước Video sẽ phát cho sinh viên:
                    </p>
                    <div className="w-full max-w-md aspect-video rounded-xl overflow-hidden border border-slate-300 shadow-sm bg-black">
                      <iframe
                        src={embedUrl}
                        title="Video Preview"
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Khối Tài liệu Slide PDF & Transcript */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    Tài liệu Slide bài giảng (PDF / URL)
                  </label>
                  <input
                    type="text"
                    value={newResourcesUrl}
                    onChange={(e) => setNewResourcesUrl(e.target.value)}
                    placeholder="Tên file hoặc link tài liệu (Ví dụ: Slide_BaiGiang.pdf)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-emerald-600 font-medium mt-1">
                    ✓ Slide này sẽ hiển thị ở tab "Tài liệu Slide" và được nạp vào pgvector cho AI Tutor.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Nội dung Transcript có mốc thời gian
                    </label>
                  </div>
                  <textarea
                    rows={4}
                    value={newTranscript}
                    onChange={(e) => setNewTranscript(e.target.value)}
                    placeholder="[00:00 - 05:00] Giới thiệu mục tiêu bài học&#10;[05:01 - 20:00] Trình bày lý thuyết trọng tâm&#10;[20:01 - 40:00] Hướng dẫn thực hành chi tiết"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono leading-relaxed"
                  />
                </div>
              </div>

              {/* 4. Khối AI Tự Động Sinh Quiz & Teacher Review */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-50/70 via-indigo-50/50 to-white border border-indigo-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-indigo-950 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      AI Quiz Generator & Kiểm duyệt Câu hỏi (Teacher Studio)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      AI sẽ tự động đọc nội dung bài học và sinh câu hỏi trắc nghiệm chuẩn Bloom. Bạn có thể duyệt và chỉnh sửa trực tiếp.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={numQuizQuestions}
                      onChange={(e) => setNumQuizQuestions(parseInt(e.target.value, 10))}
                      className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-semibold"
                    >
                      <option value={3}>3 câu hỏi</option>
                      <option value={5}>5 câu hỏi</option>
                    </select>

                    <button
                      type="button"
                      onClick={handleAiGenerateQuiz}
                      disabled={isGeneratingQuiz}
                      className="inline-flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm transition disabled:opacity-50"
                    >
                      {isGeneratingQuiz ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>AI đang sinh đề...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>AI Sinh Bộ Đề Ôn Tập</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Danh sách câu hỏi AI sinh ra để Giảng viên duyệt & chỉnh sửa */}
                {quizQuestions.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <p className="text-xs font-bold text-indigo-900">
                      Danh sách câu hỏi ôn tập của bài ({quizQuestions.length} câu) - Click để sửa hoặc đổi đáp án đúng:
                    </p>

                    {quizQuestions.map((q, qIdx) => (
                      <div
                        key={qIdx}
                        className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg shrink-0 mt-1">
                            Câu #{q.question_number}
                          </span>
                          <input
                            type="text"
                            value={q.question_text}
                            onChange={(e) => handleUpdateQuestionText(qIdx, e.target.value)}
                            className="w-full text-xs font-bold text-slate-900 border-b border-dashed border-slate-300 focus:border-indigo-500 focus:outline-none pb-0.5"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveQuestion(qIdx)}
                            className="text-slate-400 hover:text-red-500 text-xs p-1"
                            title="Xóa câu này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* 4 Lựa chọn A, B, C, D */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {q.options.map((opt) => {
                            const isCorrect = q.correct_option === opt.key;
                            return (
                              <div
                                key={opt.key}
                                onClick={() => handleChangeCorrectOption(qIdx, opt.key)}
                                className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                                  isCorrect
                                    ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 font-bold'
                                    : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'
                                }`}
                              >
                                <span
                                  className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                                    isCorrect
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-white text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {opt.key}
                                </span>
                                <input
                                  type="text"
                                  value={opt.text}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => handleUpdateOptionText(qIdx, opt.key, e.target.value)}
                                  className="w-full bg-transparent focus:outline-none text-xs"
                                />
                                {isCorrect && (
                                  <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                                    Đúng
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <p className="text-[11px] text-slate-500 italic">
                          💡 Giải thích: {q.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newTitle.trim()}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-100 transition flex items-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSubmitting ? 'Đang lưu bài học & Bộ Quiz...' : 'Lưu bài học & Xuất bản'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Danh sách bài học hiện tại */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Danh sách bài giảng khóa học ({lessons.length} bài)
            </h2>
            <span className="text-xs text-slate-400">Đồng bộ 100% với Focus Player của Sinh viên</span>
          </div>

          <div className="space-y-3">
            {lessons.map((lesson, idx) => (
              <div
                key={lesson.id}
                className="p-4 rounded-2xl border border-slate-200 hover:border-slate-300 transition bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                      {lesson.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {lesson.duration ? `${Math.round(lesson.duration / 60)} phút` : '45 phút'}
                      </span>

                      {lesson.video_url && (
                        <span className="flex items-center gap-1 text-rose-600 font-semibold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                          <Video className="w-3 h-3" />
                          Video YouTube HD
                        </span>
                      )}

                      {lesson.resources_url && (
                        <span className="flex items-center gap-1 text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                          <FileText className="w-3 h-3" />
                          {lesson.resources_url}
                        </span>
                      )}

                      <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        pgvector RAG Ready
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Link
                    href={`/courses/${courseId}/learn?lessonId=${lesson.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-indigo-700 text-xs font-bold transition shadow-2xs"
                    title="Mở phòng học trực tuyến của Sinh viên"
                  >
                    <Eye className="w-3.5 h-3.5" /> Xem bài học
                  </Link>

                  <button
                    onClick={() => handleDeleteLesson(lesson.id)}
                    className="p-1.5 rounded-xl bg-white border border-slate-200 hover:bg-red-50 text-slate-400 hover:text-red-600 text-xs transition"
                    title="Xóa bài học"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Danh sách Bộ đề thi trắc nghiệm của khóa học ── */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md border border-purple-200">
                  Khảo thí & Đánh giá
                </span>
                <span className="text-xs text-slate-400">Đồng bộ PostgreSQL</span>
              </div>
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mt-1">
                Bộ đề thi trắc nghiệm của khóa học ({courseQuizzes.length} đề thi)
              </h2>
              <p className="text-xs text-slate-500">
                Các đề thi này hiển thị tại tab &ldquo;Quiz ôn tập&rdquo; trong phòng học của sinh viên và tính điểm cấp Chứng chỉ.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/quiz/bank"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-indigo-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600" /> Ngân hàng đề thi
              </Link>
              <Link
                href={`/quiz/generate?courseId=${courseId}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Tạo thêm đề với AI
              </Link>
            </div>
          </div>

          {courseQuizzes.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
              <Layers className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-700">Khóa học này chưa có bộ đề thi nào trong PostgreSQL</p>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                Hãy sử dụng Trợ lý AI để tự động tạo bộ câu hỏi Bloom Taxonomy chuẩn giáo trình chỉ trong vài giây.
              </p>
              <Link
                href={`/quiz/generate?courseId=${courseId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition mt-2 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Tạo đề thi đầu tiên cho khóa này
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {courseQuizzes.map((quiz, qIdx) => (
                <div
                  key={quiz.id}
                  className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-200 hover:shadow-xs transition bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      Q{qIdx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-200">
                          Đề #{quiz.id}
                        </span>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                          {quiz.title}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                        {quiz.description || 'Đề thi trắc nghiệm đánh giá kiến thức bài học.'}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-700">
                          {quiz.questions?.length || 0} câu hỏi
                        </span>
                        <span>•</span>
                        <span>Tự động chấm điểm & cấp chứng chỉ</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <Link
                      href={`/quiz/${quiz.id}?courseId=${courseId}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition"
                      title="Làm thử bài thi như học viên"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Làm thử
                    </Link>
                    <Link
                      href="/quiz/bank"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                      title="Quản lý trong Ngân hàng đề thi"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" /> Xem chi tiết
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
