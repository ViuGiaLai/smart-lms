'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Zap,
  Check,
  Plus,
  Trash2,
  Video,
  DollarSign,
  Eye,
  ArrowRight,
  Database,
  Cpu,
  FileText,
  HelpCircle,
  Clock,
  Layers,
  Wand2,
  BookOpen,
} from 'lucide-react';
import { coursesApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';

interface LessonDraft {
  id: string;
  title: string;
  duration: number; // minutes
  videoUrl: string;
  resourcesUrl: string;
  transcript: string;
}

interface QuizOptionDraft {
  key: string;
  text: string;
}

interface QuizQuestionDraft {
  question_number: number;
  question_text: string;
  options: QuizOptionDraft[];
  correct_option: string;
  explanation: string;
}

interface QuizDraft {
  lessonIndex: number;
  lessonTitle: string;
  title: string;
  passScore: number;
  questions: QuizQuestionDraft[];
}

const PRESET_THUMBNAILS = [
  {
    name: 'Python & Trí tuệ Nhân tạo',
    category: 'AI & Data',
    url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=700&auto=format&fit=crop&q=80',
  },
  {
    name: 'Backend & Lập trình Hệ thống',
    category: 'Backend',
    url: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=700&auto=format&fit=crop&q=80',
  },
  {
    name: 'Frontend Web & React.js',
    category: 'Frontend',
    url: 'https://images.unsplash.com/photo-1593720213428-28a5b9e94613?w=700&auto=format&fit=crop&q=80',
  },
  {
    name: 'Cơ sở Dữ liệu & Cloud DevOps',
    category: 'Cloud & DB',
    url: 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=700&auto=format&fit=crop&q=80',
  },
];

export default function CreateCoursePage() {
  const { isAuthorized } = useRoleGuard(['instructor', 'admin']);
  const router = useRouter();

  // Wizard active step: 1 = Khóa học, 2 = Video & Slide, 3 = AI Quiz Studio
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  // View mode: 'wizard' (từng bước) hoặc 'all-in-one' (hiển thị toàn bộ 3 phần trên 1 trang)
  const [viewMode, setViewMode] = useState<'wizard' | 'all-in-one'>('wizard');

  // ── Step 1: Course Meta (Khởi tạo rỗng, không hardcode) ──
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Trí tuệ Nhân tạo & Khoa học Dữ liệu');
  const [level, setLevel] = useState('beginner');
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState('0');
  const [statusVal, setStatusVal] = useState<'published' | 'draft'>('published');
  const [thumbnail, setThumbnail] = useState(PRESET_THUMBNAILS[0].url);
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [newOutcome, setNewOutcome] = useState('');
  const [prerequisites, setPrerequisites] = useState<string[]>([]);
  const [newPrereq, setNewPrereq] = useState('');

  // ── Step 2: Lessons Management ──
  const [lessons, setLessons] = useState<LessonDraft[]>([]);
  const [activeLessonIndex, setActiveLessonIndex] = useState(0);

  // Form thêm bài học mới
  const [showAddLessonForm, setShowAddLessonForm] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonDuration, setNewLessonDuration] = useState('45');
  const [newLessonVideoUrl, setNewLessonVideoUrl] = useState('');
  const [newLessonResourcesUrl, setNewLessonResourcesUrl] = useState('');
  const [newLessonTranscript, setNewLessonTranscript] = useState('');

  // ── Step 3: AI Quiz Studio ──
  const [quizzes, setQuizzes] = useState<QuizDraft[]>([]);
  const [selectedLessonForQuiz, setSelectedLessonForQuiz] = useState<number>(0);
  const [numQuizQuestions, setNumQuizQuestions] = useState<number>(3);
  const [quizDifficulty, setQuizDifficulty] = useState<string>('Medium');
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);

  // Submission & UI States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Hàm trích xuất YouTube Embed URL
  const getYouTubeEmbedUrl = (url: string) => {
    if (!url) return '';
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : '';
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    const generatedSlug = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    setSlug(generatedSlug);
  };

  // Thêm / Xóa Chuẩn đầu ra
  const handleAddOutcome = () => {
    if (!newOutcome.trim()) return;
    setOutcomes([...outcomes, newOutcome.trim()]);
    setNewOutcome('');
  };

  const handleRemoveOutcome = (idx: number) => {
    setOutcomes(outcomes.filter((_, i) => i !== idx));
  };

  // Thêm / Xóa Tiền quyết
  const handleAddPrereq = () => {
    if (!newPrereq.trim()) return;
    setPrerequisites([...prerequisites, newPrereq.trim()]);
    setNewPrereq('');
  };

  const handleRemovePrereq = (idx: number) => {
    setPrerequisites(prerequisites.filter((_, i) => i !== idx));
  };

  // Thêm bài học mới vào danh sách
  const handleAddNewLesson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLessonTitle.trim()) return;

    const newLesson: LessonDraft = {
      id: `lesson-${Date.now()}`,
      title: newLessonTitle.trim(),
      duration: parseInt(newLessonDuration, 10) || 45,
      videoUrl: newLessonVideoUrl.trim(),
      resourcesUrl: newLessonResourcesUrl.trim(),
      transcript: newLessonTranscript.trim(),
    };

    setLessons([...lessons, newLesson]);
    setNewLessonTitle('');
    setNewLessonVideoUrl('');
    setNewLessonDuration('45');
    setNewLessonResourcesUrl('');
    setNewLessonTranscript('');
    setShowAddLessonForm(false);
    setActiveLessonIndex(lessons.length);
  };

  const handleRemoveLesson = (idx: number) => {
    const updated = lessons.filter((_, i) => i !== idx);
    setLessons(updated);
    if (activeLessonIndex >= updated.length) {
      setActiveLessonIndex(Math.max(0, updated.length - 1));
    }
  };

  // AI Sinh bộ câu hỏi trắc nghiệm từ bài học qua AI Service thật
  const handleAiGenerateQuizForLesson = async () => {
    if (lessons.length === 0) {
      setErrorMsg('Vui lòng thêm ít nhất một bài học ở Bước 2 trước khi tạo Quiz.');
      return;
    }
    const targetLesson = lessons[selectedLessonForQuiz] || lessons[0];
    if (!targetLesson) return;

    setIsGeneratingQuiz(true);
    setErrorMsg('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const promptTopic = [
        targetLesson.title,
        targetLesson.resourcesUrl ? `Tài liệu slide: ${targetLesson.resourcesUrl}` : '',
        targetLesson.transcript ? targetLesson.transcript.slice(0, 500) : '',
      ]
        .filter(Boolean)
        .join('. ');

      const res = await fetch(`${apiUrl}/api/v1/ai-quiz-gen/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          topic: promptTopic,
          num_questions: numQuizQuestions,
          difficulty: quizDifficulty.toLowerCase(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const mappedQuestions: QuizQuestionDraft[] = (data.questions || []).map((q: any, idx: number) => ({
          question_number: idx + 1,
          question_text: q.question_text || q.question || `Câu hỏi ${idx + 1}: ${targetLesson.title}`,
          options: (q.options || []).map((opt: any, optIdx: number) => ({
            key: typeof opt === 'object' ? opt.key || String.fromCharCode(65 + optIdx) : String.fromCharCode(65 + optIdx),
            text: typeof opt === 'object' ? opt.text || String(opt) : String(opt),
          })),
          correct_option: q.correct_option || q.correct_answer || 'A',
          explanation: q.explanation || 'Phân tích suy luận từ tài liệu bài học.',
        }));

        const newQuizDraft: QuizDraft = {
          lessonIndex: selectedLessonForQuiz,
          lessonTitle: targetLesson.title,
          title: `Bộ trắc nghiệm AI: ${targetLesson.title}`,
          passScore: 0.6,
          questions: mappedQuestions,
        };

        setQuizzes((prev) => {
          const existingIdx = prev.findIndex((q) => q.lessonIndex === selectedLessonForQuiz);
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx] = newQuizDraft;
            return updated;
          }
          return [...prev, newQuizDraft];
        });
      } else {
        const errJson = await res.json().catch(() => null);
        setErrorMsg(errJson?.detail || 'Không thể sinh câu hỏi qua AI lúc này. Vui lòng thử lại sau.');
      }
    } catch (err: any) {
      setErrorMsg('Lỗi kết nối AI: ' + (err.message || 'Vui lòng kiểm tra lại kết nối.'));
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  // Cập nhật câu hỏi trắc nghiệm
  const handleUpdateQuestionText = (quizIdx: number, qIdx: number, text: string) => {
    setQuizzes((prev) => {
      const updated = [...prev];
      updated[quizIdx].questions[qIdx].question_text = text;
      return updated;
    });
  };

  const handleUpdateOptionText = (quizIdx: number, qIdx: number, optKey: string, text: string) => {
    setQuizzes((prev) => {
      const updated = [...prev];
      const targetOpt = updated[quizIdx].questions[qIdx].options.find((o) => o.key === optKey);
      if (targetOpt) targetOpt.text = text;
      return updated;
    });
  };

  const handleChangeCorrectOption = (quizIdx: number, qIdx: number, newKey: string) => {
    setQuizzes((prev) => {
      const updated = [...prev];
      updated[quizIdx].questions[qIdx].correct_option = newKey;
      return updated;
    });
  };

  const handleRemoveQuestion = (quizIdx: number, qIdx: number) => {
    setQuizzes((prev) => {
      const updated = [...prev];
      updated[quizIdx].questions = updated[quizIdx].questions
        .filter((_, i) => i !== qIdx)
        .map((q, idx) => ({ ...q, question_number: idx + 1 }));
      return updated;
    });
  };

  const handleAddCustomQuestion = (quizIdx: number) => {
    setQuizzes((prev) => {
      const updated = [...prev];
      const currentQuestions = updated[quizIdx].questions;
      const newQ: QuizQuestionDraft = {
        question_number: currentQuestions.length + 1,
        question_text: '',
        options: [
          { key: 'A', text: '' },
          { key: 'B', text: '' },
          { key: 'C', text: '' },
          { key: 'D', text: '' },
        ],
        correct_option: 'A',
        explanation: '',
      };
      updated[quizIdx].questions.push(newQ);
      return updated;
    });
  };

  // ── HOÀN TẤT VÀ LƯU TOÀN BỘ VÀO CƠ SỞ DỮ LIỆU POSTGRESQL ──
  const handleMasterSubmit = async () => {
    if (!title.trim()) {
      setActiveStep(1);
      setErrorMsg('Vui lòng nhập tên khóa học ở Bước 1.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (lessons.length === 0) {
      setActiveStep(2);
      setErrorMsg('Vui lòng thêm ít nhất một bài học ở Bước 2 trước khi lưu.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('Đang khởi tạo khóa học và đồng bộ vào cơ sở dữ liệu PostgreSQL...');

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // 1. Lưu Khóa học (Course)
      const formattedDescription = [
        description.trim() || 'Khóa học đào tạo trực tuyến chuẩn chất lượng tích hợp Gia sư AI 24/7.',
        '\n\n### Mục tiêu và Chuẩn đầu ra:',
        ...outcomes.map((o) => `- ${o}`),
        '\n\n### Yêu cầu tiên quyết:',
        ...prerequisites.map((p) => `- ${p}`),
      ].join('\n');

      const coursePayload = {
        title: title.trim(),
        description: formattedDescription,
        category,
        level,
        price: isFree ? 0 : parseFloat(price) || 0,
        thumbnail: thumbnail.trim(),
        status: statusVal,
      };

      const courseRes = await coursesApi.createCourse(coursePayload);
      const newCourseId = courseRes.data?.data?.id || courseRes.data?.id;

      if (!newCourseId) {
        throw new Error('Không nhận được mã ID khóa học từ máy chủ');
      }

      // 2. Lưu danh sách Bài học (Lessons) kèm Video & Slide
      for (let i = 0; i < lessons.length; i++) {
        const les = lessons[i];
        await fetch(`${apiUrl}/api/v1/courses/${newCourseId}/lessons`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            title: les.title,
            order_index: i + 1,
            duration: les.duration * 60,
            video_url: les.videoUrl,
            transcript: les.transcript,
            resources_url: les.resourcesUrl,
          }),
        });
      }

      // 3. Lưu danh sách Quizzes đã được Giảng viên duyệt
      for (const quiz of quizzes) {
        if (quiz.questions && quiz.questions.length > 0) {
          await fetch(`${apiUrl}/api/v1/courses/${newCourseId}/quizzes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              title: quiz.title,
              description: `Bộ đề củng cố kiến thức cho ${quiz.lessonTitle}`,
              time_limit: 600,
              pass_score: quiz.passScore || 0.6,
              questions: quiz.questions.map((q) => ({
                question_text: q.question_text,
                options: q.options,
                correct_answer: q.correct_option,
                explanation: q.explanation,
                order_index: q.question_number,
              })),
            }),
          });
        }
      }

      setSuccessMsg('🎉 Lưu khóa học, toàn bộ bài giảng và các bộ đề trắc nghiệm AI thành công vào PostgreSQL!');
      setTimeout(() => {
        router.push(`/courses/${newCourseId}`);
      }, 1200);
    } catch (err: any) {
      console.error('Lỗi khi lưu khóa học:', err);
      setErrorMsg('Lỗi lưu dữ liệu: ' + (err.response?.data?.detail || err.message || 'Vui lòng thử lại.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-500 font-semibold">
        Đang xác thực quyền Giảng viên...
      </div>
    );
  }

  const currentLessonPreview = lessons[activeLessonIndex] || lessons[0];
  const activeYoutubeEmbed = currentLessonPreview ? getYouTubeEmbedUrl(currentLessonPreview.videoUrl) : '';

  return (
    <div className="font-sans pb-28 text-slate-800">
      {/* ── Toolbar: Chế độ hiển thị & Lưu khóa học ── */}
      <div className="bg-white border-b border-slate-200/90 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-extrabold text-slate-900 tracking-tight">
              Tạo Khóa học & Soạn Đề thi AI
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              Studio
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="bg-slate-100 p-0.5 rounded-xl flex items-center text-xs font-bold mr-1">
              <button
                type="button"
                onClick={() => setViewMode('wizard')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  viewMode === 'wizard' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Từng bước (Wizard)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all-in-one')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  viewMode === 'all-in-one' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hiển thị Tất cả trên 1 trang
              </button>
            </div>

            <button
              type="button"
              onClick={handleMasterSubmit}
              disabled={isSubmitting || !title.trim()}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold shadow-sm shadow-emerald-200 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>Đang lưu vào PostgreSQL...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Lưu & Xuất bản Khóa học
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* ── BĂNG BANNER TIẾN TRÌNH 3 BƯỚC (WIZARD PIPELINE HERO) ── */}
        <div className="mb-6 bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                step: 1,
                title: 'Bước 1: Thông tin Khóa học',
                desc: 'Tên, mô tả, danh mục, cấp độ & ảnh bìa',
                color: 'indigo',
              },
              {
                step: 2,
                title: 'Bước 2: Video & Slide Bài giảng',
                desc: 'Nhúng YouTube live preview, slide PDF & transcript',
                color: 'emerald',
              },
              {
                step: 3,
                title: 'Bước 3: AI Quiz Studio',
                desc: 'AI sinh đề Bloom, Giảng viên duyệt & sửa đáp án',
                color: 'purple',
              },
            ].map((s) => {
              const isCurrent = activeStep === s.step;
              const isPast = activeStep > s.step;
              return (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => {
                    setActiveStep(s.step as any);
                    if (viewMode === 'all-in-one') {
                      const el = document.getElementById(`section-step-${s.step}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                  className={`text-left p-4 rounded-2xl border transition relative flex items-start gap-3.5 ${
                    isCurrent
                      ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-500/20'
                      : isPast
                      ? 'border-emerald-300 bg-emerald-50/20 hover:border-emerald-400'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      isCurrent
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : isPast
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isPast ? <Check className="w-4 h-4" /> : s.step}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-extrabold ${isCurrent ? 'text-indigo-900' : 'text-slate-900'}`}>
                      {s.title}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{s.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Thông báo Alert */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-3 shadow-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-3 shadow-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-semibold">{successMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ================= CỘT TRÁI: NỘI DUNG 3 BƯỚC (8 COLS) ================= */}
          <div className="lg:col-span-8 space-y-8">
            {/* ══════════════════════════════════════════════════════════════════════
                BƯỚC 1: THÔNG TIN KHÓA HỌC
               ══════════════════════════════════════════════════════════════════════ */}
            {(viewMode === 'all-in-one' || activeStep === 1) && (
              <section id="section-step-1" className="space-y-6">
                <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                        1
                      </div>
                      <div>
                        <h2 className="text-base font-extrabold text-slate-900">
                          Thông tin Định danh Khóa học
                        </h2>
                        <p className="text-xs text-slate-500">
                          Tiêu đề, mô tả và chuẩn đầu ra sư phạm theo khung đánh giá
                        </p>
                      </div>
                    </div>

                    <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> AI Engine Ready
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Tên khóa học <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      placeholder="Ví dụ: Lập trình Python & Phát triển Ứng dụng AI Thông minh"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Đường dẫn tĩnh (Slug)
                    </label>
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="lap-trinh-python-ai..."
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-slate-50 text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Mô tả tổng quan học phần
                    </label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Nhập mô tả mục tiêu tổng quát, chuẩn đầu ra và nội dung đào tạo..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Danh mục</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                      >
                        <option value="Trí tuệ Nhân tạo & Khoa học Dữ liệu">Trí tuệ Nhân tạo & Khoa học Dữ liệu</option>
                        <option value="Lập trình Web Fullstack">Lập trình Web Fullstack</option>
                        <option value="Lập trình Backend & Microservices">Lập trình Backend & Microservices</option>
                        <option value="Cơ sở Dữ liệu & pgvector">Cơ sở Dữ liệu & pgvector</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Cấp độ</label>
                      <select
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                      >
                        <option value="beginner">Cơ bản (Beginner)</option>
                        <option value="intermediate">Trung cấp (Intermediate)</option>
                        <option value="advanced">Nâng cao (Advanced)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Chính sách Học phí</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsFree(true);
                            setPrice('0');
                          }}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                            isFree ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Miễn phí
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsFree(false);
                            if (price === '0') setPrice('299000');
                          }}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                            !isFree ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Có phí
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chọn Ảnh Thumbnail */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Ảnh đại diện Khóa học (Thumbnail)
                    </h3>
                    <span className="text-[11px] text-slate-400">Chọn mẫu hoặc dán URL tùy ý</span>
                  </div>

                  <div>
                    <input
                      type="url"
                      value={thumbnail}
                      onChange={(e) => setThumbnail(e.target.value)}
                      placeholder="Dán liên kết ảnh đại diện (https://...)"
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-3"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {PRESET_THUMBNAILS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => setThumbnail(preset.url)}
                        className={`p-2 rounded-2xl border text-left transition ${
                          thumbnail === preset.url
                            ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="aspect-video w-full rounded-xl overflow-hidden bg-slate-100 mb-1.5 relative">
                          <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                          {thumbnail === preset.url && (
                            <div className="absolute top-1.5 right-1.5 bg-indigo-600 text-white p-1 rounded-full">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] font-bold text-slate-800 truncate">{preset.name}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chuẩn đầu ra & Tiên quyết */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                      Sinh viên sẽ học được gì? (Learning Outcomes)
                    </h3>
                    <div className="space-y-2">
                      {outcomes.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-1">
                          Chưa có chuẩn đầu ra nào. Hãy nhập nội dung và bấm &quot;Thêm&quot; bên dưới.
                        </p>
                      ) : (
                        outcomes.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="flex-1 font-medium text-slate-800">{item}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveOutcome(idx)}
                              className="text-slate-400 hover:text-red-500 p-1"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <input
                        type="text"
                        value={newOutcome}
                        onChange={(e) => setNewOutcome(e.target.value)}
                        placeholder="Thêm chuẩn đầu ra mới..."
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddOutcome}
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
                      >
                        Thêm
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                      Yêu cầu tiên quyết (Prerequisites)
                    </h3>
                    <div className="space-y-2">
                      {prerequisites.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-1">
                          Chưa có yêu cầu tiên quyết nào. Hãy nhập nội dung và bấm &quot;Thêm&quot; bên dưới.
                        </p>
                      ) : (
                        prerequisites.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                            <span className="flex-1 font-medium text-slate-800">{item}</span>
                            <button
                              type="button"
                              onClick={() => handleRemovePrereq(idx)}
                              className="text-slate-400 hover:text-red-500 p-1"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <input
                        type="text"
                        value={newPrereq}
                        onChange={(e) => setNewPrereq(e.target.value)}
                        placeholder="Thêm yêu cầu tiên quyết..."
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddPrereq}
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
                      >
                        Thêm
                      </button>
                    </div>
                  </div>
                </div>

                {viewMode === 'wizard' && (
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveStep(2)}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-md shadow-indigo-200"
                    >
                      <span>Tiếp tục: Bước 2 (Video & Slide Bài giảng)</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* ══════════════════════════════════════════════════════════════════════
                BƯỚC 2: QUẢN LÝ BÀI GIẢNG & IMPORT VIDEO/SLIDE
               ══════════════════════════════════════════════════════════════════════ */}
            {(viewMode === 'all-in-one' || activeStep === 2) && (
              <section id="section-step-2" className="space-y-6">
                <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                        2
                      </div>
                      <div>
                        <h2 className="text-base font-extrabold text-slate-900">
                          Quản lý Bài giảng & Import Video/Slide
                        </h2>
                        <p className="text-xs text-slate-500">
                          Dán link YouTube (xem trước Focus Player), nạp tài liệu Slide PDF cho pgvector và đồng bộ Transcript
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAddLessonForm(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm Bài học mới
                    </button>
                  </div>

                  {/* Form thêm bài học mới */}
                  {showAddLessonForm && (
                    <form onSubmit={handleAddNewLesson} className="p-5 rounded-2xl bg-emerald-50/40 border border-emerald-200 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider">
                          Soạn bài học #{lessons.length + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAddLessonForm(false)}
                          className="text-xs text-slate-400 hover:text-slate-600"
                        >
                          Hủy
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="sm:col-span-3">
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Tiêu đề bài học <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={newLessonTitle}
                            onChange={(e) => setNewLessonTitle(e.target.value)}
                            placeholder="Ví dụ: Bài 3: Xây dựng RAG Pipeline với LangChain và pgvector"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Thời lượng (phút)</label>
                          <input
                            type="number"
                            value={newLessonDuration}
                            onChange={(e) => setNewLessonDuration(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                          />
                        </div>
                      </div>

                      {/* Video URL YouTube / MP4 */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                          <Video className="w-3.5 h-3.5 text-indigo-600" />
                          Liên kết Video (YouTube URL hoặc MP4)
                        </label>
                        <input
                          type="url"
                          value={newLessonVideoUrl}
                          onChange={(e) => setNewLessonVideoUrl(e.target.value)}
                          placeholder="https://www.youtube.com/watch?v=..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white"
                        />
                      </div>

                      {/* Tài liệu Slide đính kèm */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-emerald-600" />
                          Tài liệu Slide bài giảng (PDF / PPTX)
                        </label>
                        <input
                          type="text"
                          value={newLessonResourcesUrl}
                          onChange={(e) => setNewLessonResourcesUrl(e.target.value)}
                          placeholder="Slide_03_LangChain_pgvector_Architecture.pdf"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-mono"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          AI tự động phân đoạn Semantic Chunking và nạp vector 1536 chiều vào pgvector làm tri thức cho Trợ lý Gia sư ảo.
                        </p>
                      </div>

                      {/* Transcript */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-bold text-slate-700">Transcript nội dung bài giảng</label>
                        </div>
                        <textarea
                          rows={3}
                          value={newLessonTranscript}
                          onChange={(e) => setNewLessonTranscript(e.target.value)}
                          placeholder="[00:00 - 05:00] Khởi động nội dung..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs"
                        >
                          Lưu vào danh sách bài học
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Danh sách các bài giảng hiện tại */}
                  <div className="space-y-3">
                    {lessons.length === 0 ? (
                      <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl space-y-2 bg-slate-50/50">
                        <Video className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="text-xs font-bold text-slate-700">Chưa có bài học nào trong khóa học này</p>
                        <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                          Bấm nút &quot;+ Thêm Bài học mới&quot; ở trên để nhập tiêu đề, liên kết YouTube và tài liệu slide cho bài học.
                        </p>
                      </div>
                    ) : (
                      lessons.map((les, idx) => (
                        <div
                          key={les.id}
                          className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            activeLessonIndex === idx
                              ? 'border-emerald-500 bg-emerald-50/20 shadow-2xs'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 ${
                                activeLessonIndex === idx ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <h4 className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                                {les.title}
                              </h4>
                              <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-400" /> {les.duration} phút
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1 truncate text-indigo-600 font-medium">
                                  <Video className="w-3 h-3 text-indigo-500" />
                                  {les.videoUrl ? 'YouTube Video OK' : 'Chưa có video'}
                                </span>
                                <span>•</span>
                                <span className="truncate text-emerald-600 font-medium flex items-center gap-1">
                                  <FileText className="w-3 h-3" />
                                  {les.resourcesUrl || 'Chưa đính kèm slide'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => setActiveLessonIndex(idx)}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 text-xs font-semibold transition flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" /> Xem thử Player
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveLesson(idx)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition"
                              title="Xóa bài học"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {viewMode === 'wizard' && (
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveStep(1)}
                      className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 inline mr-1" /> Quay lại Bước 1
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveStep(3)}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-md shadow-indigo-200"
                    >
                      <span>Tiếp tục: Bước 3 (AI Quiz Studio & Kiểm duyệt)</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* ══════════════════════════════════════════════════════════════════════
                BƯỚC 3: AI QUIZ STUDIO (SINH ĐỀ & KIỂM DUYỆT)
               ══════════════════════════════════════════════════════════════════════ */}
            {(viewMode === 'all-in-one' || activeStep === 3) && (
              <section id="section-step-3" className="space-y-6">
                <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-xs space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                        3
                      </div>
                      <div>
                        <h2 className="text-base font-extrabold text-slate-900">
                          AI Quiz Studio: Tự động Sinh Đề & Giảng viên Kiểm duyệt
                        </h2>
                        <p className="text-xs text-slate-500">
                          AI đọc Slide & Transcript để tạo trắc nghiệm Bloom; Giảng viên toàn quyền đổi đáp án đúng và sửa câu hỏi
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Thanh điều khiển sinh đề AI */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 border border-purple-200/80 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          Chọn bài học để AI sinh bộ đề:
                        </label>
                        {lessons.length === 0 ? (
                          <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
                            Chưa có bài học nào. Hãy quay lại Bước 2 để thêm bài học trước.
                          </div>
                        ) : (
                          <select
                            value={selectedLessonForQuiz}
                            onChange={(e) => setSelectedLessonForQuiz(parseInt(e.target.value, 10))}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                          >
                            {lessons.map((l, idx) => (
                              <option key={l.id} value={idx}>
                                Bài {idx + 1}: {l.title}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="w-full sm:w-32">
                        <label className="block text-xs font-bold text-slate-800 mb-1">Số câu hỏi</label>
                        <select
                          value={numQuizQuestions}
                          onChange={(e) => setNumQuizQuestions(parseInt(e.target.value, 10))}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                        >
                          <option value={3}>3 câu</option>
                          <option value={4}>4 câu</option>
                          <option value={5}>5 câu</option>
                        </select>
                      </div>

                      <div className="w-full sm:w-36">
                        <label className="block text-xs font-bold text-slate-800 mb-1">Độ khó Bloom</label>
                        <select
                          value={quizDifficulty}
                          onChange={(e) => setQuizDifficulty(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                        >
                          <option value="Easy">Nhận biết (Easy)</option>
                          <option value="Medium">Thông hiểu (Medium)</option>
                          <option value="Hard">Vận dụng (Hard)</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <span className="text-[11px] text-slate-500">
                        AI tham chiếu Slide bài học & Transcript để sinh câu hỏi trắc nghiệm 4 lựa chọn chuẩn kiến thức.
                      </span>
                      <button
                        type="button"
                        onClick={handleAiGenerateQuizForLesson}
                        disabled={isGeneratingQuiz || lessons.length === 0}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm shadow-purple-200 transition disabled:opacity-50 shrink-0"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isGeneratingQuiz ? 'animate-spin' : ''}`} />
                        {isGeneratingQuiz ? 'AI đang phân tích...' : '✨ Yêu cầu AI Sinh Bộ Trắc Nghiệm'}
                      </button>
                    </div>
                  </div>

                  {/* Danh sách các bộ Quiz đã sinh */}
                  {quizzes.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-3xl space-y-2">
                      <HelpCircle className="w-10 h-10 text-slate-300 mx-auto" />
                      <p className="text-xs font-bold text-slate-700">Chưa có bộ đề trắc nghiệm nào</p>
                      <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                        Bấm nút &quot;Yêu cầu AI Sinh Bộ Trắc Nghiệm&quot; ở trên để AI tạo câu hỏi từ slide bài giảng.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {quizzes.map((quiz, quizIdx) => (
                        <div key={quizIdx} className="p-5 rounded-3xl bg-slate-50 border border-slate-200 space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                            <div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 uppercase">
                                Bộ đề trắc nghiệm AI
                              </span>
                              <h3 className="font-bold text-sm text-slate-900 mt-1">{quiz.title}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-500">
                                {quiz.questions.length} câu hỏi
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAddCustomQuestion(quizIdx)}
                                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition flex items-center gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" /> Thêm câu hỏi
                              </button>
                            </div>
                          </div>

                          {/* Danh sách từng câu hỏi */}
                          <div className="space-y-4">
                            {quiz.questions.map((q, qIdx) => (
                              <div key={q.question_number} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                                    {q.question_number}
                                  </span>
                                  <input
                                    type="text"
                                    value={q.question_text}
                                    onChange={(e) => handleUpdateQuestionText(quizIdx, qIdx, e.target.value)}
                                    className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveQuestion(quizIdx, qIdx)}
                                    className="text-slate-400 hover:text-red-600 transition p-1"
                                    title="Xóa câu hỏi"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>

                                {/* 4 Lựa chọn A, B, C, D */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                  {q.options.map((opt) => (
                                    <div
                                      key={opt.key}
                                      className={`flex items-center gap-2 p-2 rounded-xl border transition ${
                                        q.correct_option === opt.key
                                          ? 'border-emerald-500 bg-emerald-50/40 text-emerald-900 ring-1 ring-emerald-400'
                                          : 'border-slate-200 bg-slate-50/50 text-slate-700'
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => handleChangeCorrectOption(quizIdx, qIdx, opt.key)}
                                        className={`w-6 h-6 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 transition ${
                                          q.correct_option === opt.key
                                           ? 'bg-emerald-600 text-white shadow-2xs'
                                            : 'bg-white text-slate-500 border border-slate-300'
                                        }`}
                                        title="Bấm để đặt làm đáp án đúng"
                                      >
                                        {opt.key}
                                      </button>
                                      <input
                                        type="text"
                                        value={opt.text}
                                        onChange={(e) => handleUpdateOptionText(quizIdx, qIdx, opt.key, e.target.value)}
                                        className="flex-1 bg-transparent text-xs font-medium focus:outline-none"
                                      />
                                    </div>
                                  ))}
                                </div>

                                {/* Giải thích sư phạm */}
                                <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-start gap-1.5">
                                  <span className="font-bold text-slate-700 shrink-0">Giải thích:</span>
                                  <span>{q.explanation}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Nút Hoàn tất Master Submit */}
                <div className="flex items-center justify-between pt-2">
                  {viewMode === 'wizard' ? (
                    <button
                      type="button"
                      onClick={() => setActiveStep(2)}
                      className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 inline mr-1" /> Quay lại Bước 2
                    </button>
                  ) : <div />}

                  <button
                    type="button"
                    onClick={handleMasterSubmit}
                    disabled={isSubmitting || !title.trim()}
                    className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition shadow-lg shadow-emerald-200 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSubmitting ? 'Đang lưu vào PostgreSQL...' : 'Lưu Khóa học & Toàn bộ Đề thi vào PostgreSQL'}</span>
                  </button>
                </div>
              </section>
            )}
          </div>

          {/* ================= CỘT PHẢI: LIVE PREVIEW & VIDEO VIEWER (4 COLS) ================= */}
          <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-28">
            {/* Live Video Preview Box */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-md space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-800">Trình phát thử Focus Player</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                  {activeYoutubeEmbed ? 'YouTube Live' : 'Sẵn sàng'}
                </span>
              </div>

              {/* YouTube Player Preview */}
              <div className="aspect-video w-full rounded-2xl overflow-hidden bg-slate-950 relative border border-slate-800 shadow-xs">
                {activeYoutubeEmbed ? (
                  <iframe
                    src={activeYoutubeEmbed}
                    title="Preview Video Player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-slate-500 space-y-2">
                    <Video className="w-8 h-8 text-slate-600" />
                    <p className="text-xs font-medium text-slate-400">
                      {lessons.length === 0
                        ? 'Chưa có bài học nào. Thêm bài học ở Bước 2 để phát thử.'
                        : 'Bài học chưa có link video YouTube. Nhập link video ở Bước 2.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Thông tin bài học đang xem */}
              {lessons.length > 0 && currentLessonPreview && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                    Bài {activeLessonIndex + 1} ({currentLessonPreview.duration} phút)
                  </span>
                  <p className="text-xs font-bold text-slate-800 line-clamp-1">{currentLessonPreview.title}</p>
                  {currentLessonPreview.resourcesUrl && (
                    <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                      <FileText className="w-3 h-3 text-emerald-500" /> {currentLessonPreview.resourcesUrl}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Course Card Preview */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-md space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-800">Thẻ khóa học hiển thị</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                  {statusVal === 'published' ? 'Công khai' : 'Bản nháp'}
                </span>
              </div>

              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-2xs">
                <div className="aspect-video w-full bg-slate-100 relative overflow-hidden flex items-center justify-center">
                  {thumbnail ? (
                    <img src={thumbnail} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-slate-100 to-indigo-50 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                      <BookOpen className="w-8 h-8 text-slate-300 mb-1" />
                      <span className="text-[11px] font-semibold">Chưa chọn ảnh thumbnail</span>
                    </div>
                  )}
                  <div className="absolute top-2.5 left-2.5">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/90 text-slate-800 shadow-2xs">
                      {level === 'beginner' ? 'Cơ bản' : level === 'intermediate' ? 'Trung cấp' : 'Nâng cao'}
                    </span>
                  </div>
                  <div className="absolute top-2.5 right-2.5">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-600 text-white shadow-2xs flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AI Tutor
                    </span>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">{category}</p>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900 leading-snug line-clamp-2">
                    {title || 'Tên khóa học sẽ hiển thị tại đây...'}
                  </h4>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="font-extrabold text-slate-900">
                      {isFree ? 'Miễn phí' : `${Number(price || 0).toLocaleString('vi-VN')} đ`}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {lessons.length} bài học • {quizzes.length} bộ đề
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bảo chứng AI Smart LMS */}
            <div className="bg-gradient-to-br from-indigo-950 to-slate-900 rounded-3xl p-5 text-white shadow-lg space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold">Cơ chế AI Studio Smart LMS</span>
              </div>
              <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                Tất cả slide bài giảng và transcript sẽ được tự động phân mảnh và nạp vào pgvector khi lưu. Bộ trắc nghiệm bám sát thang đo Bloom và do Giảng viên trực tiếp phê duyệt đáp án.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
