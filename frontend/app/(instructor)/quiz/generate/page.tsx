'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { instructorApi } from '@/lib/api';
import {
  ArrowLeft,
  Sparkles,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  Save,
  HelpCircle,
  Cpu,
  Layers,
  ChevronRight,
  Flame,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface QuestionOption {
  key: string;
  text: string;
}

interface GeneratedQuestion {
  question_number: number;
  question_text: string;
  options: QuestionOption[];
  correct_option: string;
  explanation: string;
  difficulty?: string;
}

interface GeneratedQuizSet {
  title: string;
  course_title: string;
  difficulty_level: string;
  total_questions: number;
  questions: GeneratedQuestion[];
}

export default function AIQuizGeneratePage() {
  const [courseId, setCourseId] = useState('');
  const [content, setContent] = useState('');
  const [numQuestions, setNumQuestions] = useState(3);
  const [difficulty, setDifficulty] = useState('Mixed');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [savedQuizId, setSavedQuizId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatedQuiz, setGeneratedQuiz] = useState<GeneratedQuizSet | null>(null);
  const [coursesList, setCoursesList] = useState<{ id: string; title: string; description: string }[]>([]);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await instructorApi.getCourses();
        if (res.data?.data && res.data.data.length > 0) {
          const mapped = res.data.data.map((c: any) => ({
            id: String(c.id),
            title: c.title,
            description: c.shortDescription || c.description || '',
          }));
          setCoursesList(mapped);
          setCourseId(mapped[0].id);
        }
      } catch (err) {
        console.error('Lỗi khi tải danh sách khóa học:', err);
      }
    };
    fetchCourses();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsLoading(true);
    setSavedSuccess(false);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const response = await fetch(`${apiUrl}/api/v1/ai-quiz-gen/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          topic: content,
          course_id: courseId ? parseInt(courseId, 10) : undefined,
          num_questions: numQuestions,
          difficulty: difficulty.toLowerCase(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const mappedQuestions: GeneratedQuestion[] = (data.questions || []).map((q: any, idx: number) => {
          let opts: QuestionOption[] = [];
          if (Array.isArray(q.options)) {
            opts = q.options.map((opt: any, optIdx: number) => {
              if (typeof opt === 'object' && opt !== null) {
                return {
                  key: opt.key || String.fromCharCode(65 + optIdx),
                  text: opt.text || String(opt),
                };
              }
              return {
                key: String.fromCharCode(65 + optIdx),
                text: String(opt),
              };
            });
          }
          return {
            question_number: idx + 1,
            question_text: q.question_text || q.question || `Câu hỏi ${idx + 1}`,
            options: opts.length > 0 ? opts : [
              { key: 'A', text: 'Lựa chọn A' },
              { key: 'B', text: 'Lựa chọn B' },
              { key: 'C', text: 'Lựa chọn C' },
              { key: 'D', text: 'Lựa chọn D' },
            ],
            correct_option: q.correct_answer || q.correct_option || 'A',
            explanation: q.explanation || 'Được phân tích và suy luận từ tài liệu bài giảng.',
          };
        });

        setGeneratedQuiz({
          title: data.title || `Bộ đề trắc nghiệm AI (${difficulty})`,
          course_title: `Khóa học #${courseId}`,
          difficulty_level: difficulty,
          total_questions: mappedQuestions.length,
          questions: mappedQuestions,
        });
        setErrorMessage(null);
      } else {
        const errJson = await response.json().catch(() => null);
        const detail = errJson?.detail || 'Không thể tạo đề trắc nghiệm qua AI service.';
        setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi kết nối khi gửi yêu cầu sinh câu hỏi trắc nghiệm.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!generatedQuiz) return;
    const text = generatedQuiz.questions
      .map(
        (q) =>
          `Câu ${q.question_number}: ${q.question_text}\n${q.options
            .map((o) => `[${o.key}] ${o.text}`)
            .join('\n')}\n=> Đáp án đúng: ${q.correct_option}\nLời giải thích: ${q.explanation}\n`
      )
      .join('\n-------------------------\n\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveToCourse = async () => {
    if (!generatedQuiz || !generatedQuiz.questions.length) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/v1/courses/${courseId}/quizzes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: generatedQuiz.title,
          description: `Đề thi trắc nghiệm AI độ khó ${generatedQuiz.difficulty_level}`,
          time_limit: 600,
          pass_score: 0.6,
          questions: generatedQuiz.questions.map((q, idx) => ({
            question_text: q.question_text,
            options: q.options,
            correct_answer: q.correct_option,
            explanation: q.explanation,
            order_index: idx + 1,
          })),
        }),
      });
      if (res.ok) {
        const savedData = await res.json().catch(() => null);
        if (savedData?.id) {
          setSavedQuizId(savedData.id);
        }
        setSavedSuccess(true);
      } else {
        const errJson = await res.json().catch(() => null);
        alert(errJson?.detail || 'Lưu bộ đề vào khóa học thất bại.');
      }
    } catch (err: any) {
      alert('Lỗi kết nối khi lưu bộ đề: ' + (err.message || 'Thử lại sau'));
    }
  };

  return (
    <div className="font-sans pb-16">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/instructor-dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs self-start"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Bảng Giảng viên
            </Link>

            <Link
              href="/quiz/bank"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-800 transition bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 shadow-2xs"
            >
              <Layers className="w-3.5 h-3.5" /> Ngân hàng đề thi
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5" /> Google Gemini + Pydantic Schema
            </span>
          </div>
        </div>

        {/* ── Form Section ── */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-200">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  AI Quiz Generator (Tự động sinh đề trắc nghiệm)
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Phân tích tài liệu bài giảng, trích xuất thông tin trọng tâm và sinh bộ câu hỏi 4 lựa chọn chuẩn hóa
                </p>
              </div>
            </div>

            <div className="text-right hidden sm:block">
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                Tiết kiệm 80% thời gian soạn đề
              </span>
            </div>
          </div>

          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Chọn khóa học từ Database */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              Chọn khóa học áp dụng đề thi (Từ Cơ sở dữ liệu):
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {coursesList.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCourseId(c.id);
                    if (c.description) setContent(c.description);
                  }}
                  className={`text-left p-3 rounded-xl border text-xs transition ${
                    courseId === c.id
                      ? 'border-emerald-500 bg-emerald-50/60 text-emerald-900 font-medium'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50/50'
                  }`}
                >
                  <p className="font-bold truncate">{c.title}</p>
                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-1">{c.description}</p>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Nội dung tài liệu / Slide bài giảng / Phụ đề video cần sinh đề:
                </label>
                <span className="text-[11px] text-slate-400">{content.length} ký tự</span>
              </div>
              <textarea
                rows={5}
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Dán nội dung giáo trình, bài giảng, hoặc bản tóm tắt bài học vào đây..."
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white bg-slate-50/40 transition font-sans leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Số lượng câu hỏi cần sinh
                </label>
                <select
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value={3}>3 câu hỏi (Khảo sát nhanh)</option>
                  <option value={5}>5 câu hỏi (Củng cố bài học)</option>
                  <option value={10}>10 câu hỏi (Kiểm tra 15 phút)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Cấp độ nhận thức (Bloom&apos;s Taxonomy)
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="Mixed">Hỗn hợp (Nhận biết - Thông hiểu - Vận dụng)</option>
                  <option value="Easy">Dễ (Nhận biết & Nhớ lại)</option>
                  <option value="Medium">Trung bình (Thông hiểu & Áp dụng)</option>
                  <option value="Hard">Khó (Phân tích & Đánh giá)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Khóa học sở hữu
                </label>
                <select
                  value={courseId}
                  onChange={(e) => {
                    setCourseId(e.target.value);
                    const selected = coursesList.find((c) => c.id === e.target.value);
                    if (selected && selected.description && !content.trim()) {
                      setContent(selected.description);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  {coursesList.length === 0 ? (
                    <option value="">Chưa có khóa học nào</option>
                  ) : (
                    coursesList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isLoading || !content.trim()}
                className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs text-white shadow-md transition ${
                  isLoading
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                }`}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang gọi AI phân tích & sinh đề Structured JSON...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Bắt đầu sinh đề trắc nghiệm bằng AI
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* ── Generated Quiz Result Section ── */}
        {generatedQuiz && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-md space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Header Result */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                    Đã hoàn thành sinh đề
                  </span>
                  <span className="text-xs text-slate-400">• {generatedQuiz.total_questions} câu hỏi</span>
                  <span className="text-xs text-slate-400">• Cấp độ: {generatedQuiz.difficulty_level}</span>
                </div>
                <h2 className="text-lg font-extrabold text-slate-900">{generatedQuiz.title}</h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" /> Đã sao chép!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Sao chép bộ đề
                    </>
                  )}
                </button>

                <button
                  onClick={handleSaveToCourse}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition"
                >
                  {savedSuccess ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /> Đã lưu vào ngân hàng!
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" /> Lưu vào ngân hàng đề
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Banner Thông báo Lưu Thành Công vào Ngân Hàng Đề Thi */}
            {savedSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-900">
                      Đã lưu thành công bộ đề vào Ngân hàng đề thi!
                    </h4>
                    <p className="text-[11px] text-emerald-700">
                      Bộ đề trắc nghiệm này đã sẵn sàng cho học viên làm bài và kiểm tra.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href="/quiz/bank"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Xem trong Ngân hàng đề</span>
                  </Link>
                  {savedQuizId && (
                    <Link
                      href={`/quiz/${savedQuizId}?courseId=${courseId}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Làm thử đề</span>
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Questions List */}
            <div className="space-y-4">
              {generatedQuiz.questions.map((q) => (
                <div
                  key={q.question_number}
                  className="p-5 rounded-2xl border border-slate-200/90 bg-slate-50/40 space-y-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {q.question_number}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {q.question_text}
                      </h3>
                    </div>

                    {q.difficulty && (
                      <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md shrink-0">
                        {q.difficulty}
                      </span>
                    )}
                  </div>

                  {/* 4 Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {q.options.map((opt) => {
                      const isCorrect = opt.key === q.correct_option;
                      return (
                        <div
                          key={opt.key}
                          className={`p-3 rounded-xl border text-xs flex items-center justify-between transition ${
                            isCorrect
                              ? 'bg-emerald-50/80 border-emerald-400 text-emerald-900 font-semibold'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[11px] ${
                                isCorrect
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {opt.key}
                            </span>
                            <span>{opt.text}</span>
                          </div>

                          {isCorrect && (
                            <span className="text-[10px] font-bold text-emerald-700 uppercase bg-emerald-100 px-1.5 py-0.5 rounded">
                              Đáp án đúng
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation */}
                  <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 space-y-1">
                    <span className="font-bold text-indigo-700 flex items-center gap-1 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                      Giải thích sư phạm chi tiết:
                    </span>
                    <p className="leading-relaxed text-slate-600">{q.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
