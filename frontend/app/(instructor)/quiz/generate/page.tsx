'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { instructorApi } from '@/lib/api';
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Copy,
  Save,
  Cpu,
  Layers,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

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
  const [lessonId, setLessonId] = useState('');
  const [lessonsByCourse, setLessonsByCourse] = useState<
    Record<string, { id: string; title: string; order?: number }[]>
  >({});
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
          const mapped: { id: string; title: string; description: string }[] = res.data.data.map((c: any) => ({
            id: String(c.id),
            title: c.title,
            description: c.shortDescription || c.description || '',
          }));
          setCoursesList(mapped);
          const requestedCourseId =
            typeof window !== 'undefined'
              ? new URLSearchParams(window.location.search).get('courseId')
              : null;
          const preferred = mapped.find((c) => c.id === requestedCourseId) || mapped[0];
          setCourseId(preferred.id);
          if (preferred.description) setContent(preferred.description);

          try {
            const materialsRes = await instructorApi.getMaterials();
            const materialCourses: any[] = materialsRes.data?.data?.courses || [];
            const lessonMap: Record<string, { id: string; title: string; order?: number }[]> = {};
            materialCourses.forEach((course: any) => {
              const lessons: { id: string; title: string; order?: number }[] = (course.lessons || []).map(
                (lesson: any) => ({
                  id: String(lesson.id),
                  title: lesson.title,
                  order: lesson.order,
                }),
              );
              lessonMap[String(course.id)] = lessons.sort((a, b) => (a.order || 0) - (b.order || 0));
            });
            setLessonsByCourse(lessonMap);

            const requestedLessonId =
              typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search).get('lessonId')
                : null;
            const preferredLessons = lessonMap[preferred.id] || [];
            setLessonId(
              requestedLessonId && preferredLessons.some((lesson) => lesson.id === requestedLessonId)
                ? requestedLessonId
                : '',
            );
          } catch (err) {
            console.error('Lỗi khi tải danh sách bài học:', err);
          }
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
            options: opts,
            correct_option: q.correct_answer || q.correct_option || 'A',
            explanation: q.explanation || '',
          };
        });

        setGeneratedQuiz({
          title: data.title || `Bộ đề trắc nghiệm AI (${difficulty})`,
          course_title:
            coursesList.find((c) => c.id === courseId)?.title || 'Khóa học đã chọn',
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
    if (!courseId) {
      setErrorMessage('Vui lòng chọn khóa học trước khi lưu bộ đề.');
      return;
    }
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
          lesson_id: lessonId ? Number(lessonId) : null,
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
    <div className="pb-16 font-sans">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/instructor-dashboard">
                <ArrowLeft className="h-3.5 w-3.5" /> Bảng Giảng viên
              </Link>
            </Button>

            <Button asChild variant="outline" size="sm" className="text-primary">
              <Link href="/quiz/bank">
                <Layers className="h-3.5 w-3.5" /> Ngân hàng đề thi
              </Link>
            </Button>
          </div>

          <Badge variant="info" className="w-fit gap-1 px-2.5 py-1 text-[11px] font-bold">
            <Cpu className="h-3.5 w-3.5" /> Google Gemini + Pydantic Schema
          </Badge>
        </div>

        {/* ── Form Section ── */}
        <Card className="rounded-3xl">
          <CardContent className="space-y-6 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
                    AI Quiz Generator (Tự động sinh đề trắc nghiệm)
                  </h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Phân tích tài liệu bài giảng, trích xuất thông tin trọng tâm và sinh bộ câu hỏi 4 lựa chọn chuẩn hóa
                  </p>
                </div>
              </div>

              <div className="hidden sm:block">
                <Badge variant="success" className="px-3 py-1 text-xs font-bold">
                  Tiết kiệm 80% thời gian soạn đề
                </Badge>
              </div>
            </div>

            {errorMessage && (
              <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Chọn khóa học từ Database */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Chọn khóa học áp dụng đề thi (Từ Cơ sở dữ liệu):
              </label>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                {coursesList.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCourseId(c.id);
                      if (c.description) setContent(c.description);
                    }}
                    className={cn(
                      buttonVariants({ variant: 'outline' }),
                      'h-auto block px-3 py-3 text-left text-xs leading-tight',
                      courseId === c.id
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-900 hover:bg-emerald-500/20'
                        : 'text-muted-foreground'
                    )}
                  >
                    <p className="truncate font-bold">{c.title}</p>
                    <p className="mt-1 line-clamp-1 text-[11px] font-normal">{c.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleGenerate} className="space-y-5">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">
                    Nội dung tài liệu / Slide bài giảng / Phụ đề video cần sinh đề:
                  </label>
                  <span className="text-[11px] text-muted-foreground">{content.length} ký tự</span>
                </div>
                <Textarea
                  rows={5}
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Dán nội dung giáo trình, bài giảng, hoặc bản tóm tắt bài học vào đây..."
                  className="text-xs leading-relaxed sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-foreground">
                    Số lượng câu hỏi cần sinh
                  </label>
                  <select
                    value={numQuestions}
                    onChange={(e) => setNumQuestions(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3.5 text-xs font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value={3}>3 câu hỏi (Khảo sát nhanh)</option>
                    <option value={5}>5 câu hỏi (Củng cố bài học)</option>
                    <option value={10}>10 câu hỏi (Kiểm tra 15 phút)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-foreground">
                    Cấp độ nhận thức (Bloom&apos;s Taxonomy)
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3.5 text-xs font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="Mixed">Hỗn hợp (Nhận biết - Thông hiểu - Vận dụng)</option>
                    <option value="Easy">Dễ (Nhận biết &amp; Nhớ lại)</option>
                    <option value="Medium">Trung bình (Thông hiểu &amp; Áp dụng)</option>
                    <option value="Hard">Khó (Phân tích &amp; Đánh giá)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-foreground">
                    Khóa học sở hữu
                  </label>
                  <select
                    value={courseId}
                    onChange={(e) => {
                      setCourseId(e.target.value);
                      setLessonId('');
                      const selected = coursesList.find((c) => c.id === e.target.value);
                      if (selected && selected.description && !content.trim()) {
                        setContent(selected.description);
                      }
                    }}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3.5 text-xs font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-foreground">
                    Bài học liên kết (tùy chọn)
                  </label>
                  <select
                    value={lessonId}
                    onChange={(e) => setLessonId(e.target.value)}
                    disabled={!courseId || !(lessonsByCourse[courseId]?.length)}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3.5 text-xs font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Không gắn bài học cụ thể</option>
                    {(lessonsByCourse[courseId] || []).map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.order ? `Bài ${lesson.order}: ` : ''}
                        {lesson.title}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Gắn đề với bài học để học viên thấy đúng bài trắc nghiệm khi đang học.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="success"
                  size="lg"
                  disabled={isLoading || !content.trim()}
                >
                  {isLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Đang gọi AI phân tích &amp; sinh đề Structured JSON...
                    </>
                  ) : (
                    <>
                      <Sparkles />
                      Bắt đầu sinh đề trắc nghiệm bằng AI
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── Generated Quiz Result Section ── */}
        {generatedQuiz && (
          <Card className="space-y-6 rounded-3xl shadow-md">
            <CardContent className="space-y-6 p-6 sm:p-8">
              {/* Header Result */}
              <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-center">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="success" className="text-[11px] font-bold">
                      Đã hoàn thành sinh đề
                    </Badge>
                    <span className="text-xs text-muted-foreground">• {generatedQuiz.total_questions} câu hỏi</span>
                    <span className="text-xs text-muted-foreground">• Cấp độ: {generatedQuiz.difficulty_level}</span>
                  </div>
                  <h2 className="text-lg font-extrabold text-foreground">{generatedQuiz.title}</h2>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" /> Đã sao chép!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Sao chép bộ đề
                      </>
                    )}
                  </Button>

                  <Button variant="default" size="sm" onClick={handleSaveToCourse}>
                    {savedSuccess ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Đã lưu vào ngân hàng!
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5" /> Lưu vào ngân hàng đề
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Banner Thông báo Lưu Thành Công vào Ngân Hàng Đề Thi */}
              {savedSuccess && (
                <div className="flex flex-col justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                      <CheckCircle2 className="h-4 w-4" />
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

                  <div className="flex shrink-0 items-center gap-2">
                    <Button asChild variant="success" size="sm">
                      <Link href="/quiz/bank">
                        <Layers className="h-3.5 w-3.5" />
                        <span>Xem trong Ngân hàng đề</span>
                      </Link>
                    </Button>
                    {savedQuizId && (
                      <Button asChild variant="outline" size="sm" className="text-emerald-700">
                        <Link href={`/quiz/${savedQuizId}?courseId=${courseId}`} target="_blank">
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Làm thử đề</span>
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Questions List */}
              <div className="space-y-4">
                {generatedQuiz.questions.map((q) => (
                  <div
                    key={q.question_number}
                    className="space-y-3.5 rounded-2xl border border-border/80 bg-muted/40 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">
                          {q.question_number}
                        </span>
                        <h3 className="text-sm font-bold leading-snug text-foreground">
                          {q.question_text}
                        </h3>
                      </div>

                      {q.difficulty && (
                        <Badge variant="secondary" className="shrink-0 rounded-md text-[11px] font-semibold">
                          {q.difficulty}
                        </Badge>
                      )}
                    </div>

                    {/* 4 Options */}
                    <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-2">
                      {q.options.map((opt) => {
                        const isCorrect = opt.key === q.correct_option;
                        return (
                          <div
                            key={opt.key}
                            className={`flex items-center justify-between rounded-xl border p-3 text-xs transition ${
                              isCorrect
                                ? 'border-emerald-500/40 bg-emerald-500/10 font-semibold text-emerald-900'
                                : 'border-border bg-card text-foreground/80'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold ${
                                  isCorrect
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-muted text-foreground/70'
                                }`}
                              >
                                {opt.key}
                              </span>
                              <span>{opt.text}</span>
                            </div>

                            {isCorrect && (
                              <Badge
                                variant="success"
                                className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                              >
                                Đáp án đúng
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation */}
                    <div className="space-y-1 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 text-[11px] font-bold text-primary">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        Giải thích sư phạm chi tiết:
                      </span>
                      <p className="leading-relaxed">{q.explanation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
