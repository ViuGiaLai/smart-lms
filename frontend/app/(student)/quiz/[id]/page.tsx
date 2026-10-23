'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Award, Sparkles, BookOpen, AlertCircle, RefreshCw } from 'lucide-react';
import { coursesApi } from '@/lib/api';

interface QuestionOption {
  key: string;
  text: string;
}

interface QuestionItem {
  id: number;
  question_number: number;
  question_text: string;
  options: QuestionOption[];
  correct?: string;
  explanation: string;
}

interface ActiveQuizData {
  id: number;
  title: string;
  description?: string;
  pass_score: number;
  lesson_id?: number | null;
  questions: QuestionItem[];
}

export default function StudentQuizPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const quizIdParam = (params?.id as string) || '';
  const courseId = searchParams?.get('courseId') || '';

  const [activeQuiz, setActiveQuiz] = useState<ActiveQuizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [calculatedScore, setCalculatedScore] = useState(0);
  const [isPassed, setIsPassed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [correctAnswers, setCorrectAnswers] = useState<Record<number, string>>({});
  const [startedAt, setStartedAt] = useState<number>(0);

  const [resolvedCourseId, setResolvedCourseId] = useState<string>(courseId);

  // Nạp dữ liệu bộ đề từ PostgreSQL qua RESTful API
  useEffect(() => {
    let isMounted = true;
    const fetchQuizData = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

        // 1. Thử lấy trực tiếp theo /api/v1/quizzes/{id}
        let matched: any = null;
        try {
          const directRes = await fetch(`${apiUrl}/api/v1/quizzes/${quizIdParam}`, {
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
          if (directRes.ok) {
            matched = await directRes.json();
            if (matched?.course_id) {
              setResolvedCourseId(String(matched.course_id));
            }
          }
        } catch {}

        // 2. Nếu chưa tìm thấy, tra cứu theo danh sách quiz của khóa học
        if (!matched && courseId) {
          const res = await fetch(`${apiUrl}/api/v1/courses/${courseId}/quizzes`, {
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
          if (res.ok) {
            const list: any[] = await res.json();
            if (list && list.length > 0) {
              matched = list.find((q) => String(q.id) === String(quizIdParam)) || list[0];
            }
          }
        }

        if (matched && isMounted) {
          const mappedQuestions: QuestionItem[] = (matched.questions || []).map((q: any, idx: number) => ({
            id: q.id || idx + 1,
            question_number: idx + 1,
            question_text: q.question_text || `Câu hỏi ${idx + 1}`,
            options: (q.options || []).map((opt: any, optIdx: number) => ({
              key: typeof opt === 'object' ? (opt.key || String.fromCharCode(65 + optIdx)) : String.fromCharCode(65 + optIdx),
              text: typeof opt === 'object' ? (opt.text || String(opt)) : String(opt),
            })),
            correct: undefined,
            explanation: q.explanation || 'Chưa có giải thích cho câu hỏi này.',
          }));

          setActiveQuiz({
            id: matched.id,
            title: matched.title || `Đề kiểm tra trắc nghiệm #${quizIdParam}`,
            description: matched.description || 'Được đồng bộ từ cơ sở dữ liệu PostgreSQL.',
            pass_score: matched.pass_score || 0.6,
            lesson_id: matched.lesson_id ?? null,
            questions: mappedQuestions,
          });
        } else if (isMounted) {
          setErrorMessage('Không tìm thấy bài trắc nghiệm trong cơ sở dữ liệu.');
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(err.message || 'Lỗi kết nối đến máy chủ cơ sở dữ liệu.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchQuizData();
    return () => {
      isMounted = false;
    };
  }, [courseId, quizIdParam]);

  const questions = activeQuiz?.questions || [];

  useEffect(() => {
    if (activeQuiz) setStartedAt(Date.now());
  }, [activeQuiz]);

  const handleSelect = (questionId: number, optKey: string) => {
    if (isSubmitted) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optKey }));
  };

  const handleSubmit = async () => {
    if (!activeQuiz || questions.length === 0) return;
    setSubmitting(true);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const timeSpent = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 1000)) : 0;

      // Nộp bài trực tiếp vào PostgreSQL để backend chấm điểm và lưu QuizSubmission
      let res = await fetch(`${apiUrl}/api/v1/quizzes/${activeQuiz.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          answers,
          time_spent: timeSpent,
        }),
      });

      if (!res.ok) {
        const targetCId = resolvedCourseId || courseId;
        if (targetCId) {
          res = await fetch(`${apiUrl}/api/v1/courses/${targetCId}/quizzes/${activeQuiz.id}/submit`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              answers,
              time_spent: timeSpent,
            }),
          });
        }
      }

      if (res.ok) {
        const subData = await res.json();
        const scoreVal = Math.round((subData.score || 0) * questions.length);
        const answerMap = (subData.results || []).reduce((acc: Record<number, string>, result: any) => {
          if (result.question_id && result.correct_answer) {
            acc[result.question_id] = result.correct_answer;
          }
          return acc;
        }, {});
        setCorrectAnswers(answerMap);
        setCalculatedScore(scoreVal);
        setIsPassed(subData.passed || scoreVal >= questions.length * activeQuiz.pass_score);
        setIsSubmitted(true);

        // Nếu đạt yêu cầu, cập nhật tiến độ bài học trong cơ sở dữ liệu
        const targetCId = resolvedCourseId || courseId;
        if (subData.passed && activeQuiz.lesson_id && targetCId) {
          coursesApi.markLessonComplete(targetCId, String(activeQuiz.lesson_id), 0).catch(() => {});
        }
      } else {
        throw new Error('Không thể nộp bài lên máy chủ. Vui lòng thử lại.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể nộp bài. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      const backCourseId = resolvedCourseId || courseId;
      router.push(backCourseId ? `/courses/${backCourseId}/learn` : '/courses');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Đang tải đề thi từ cơ sở dữ liệu PostgreSQL...</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !activeQuiz || questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Không tìm thấy bài trắc nghiệm</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {errorMessage || 'Chưa có bộ câu hỏi ôn tập cho bài học này trong hệ thống.'}
          </p>
          <div className="pt-2 flex items-center gap-3">
            <button
              onClick={handleGoBack}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition"
            >
              Quay lại khóa học
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28 md:pb-12 font-sans">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleGoBack}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white hover:bg-indigo-50 border border-slate-200 px-3.5 py-2 rounded-xl shadow-2xs transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại bài giảng (Bài {quizIdParam})</span>
          </button>

          <Link
            href={resolvedCourseId || courseId ? `/courses/${resolvedCourseId || courseId}` : '/courses'}
            className="text-xs text-slate-500 hover:text-slate-800 font-medium transition"
          >
            Về tổng quan khóa học
          </Link>
        </div>

        {/* Header Quiz Banner */}
        <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white shadow-xl space-y-2 relative overflow-hidden">
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-amber-300" />
            Đề kiểm tra AI Bloom Taxonomy • Bài ${quizIdParam}
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white">
            {activeQuiz.title}
          </h1>
          <p className="text-xs text-indigo-200/80 max-w-xl">
            {activeQuiz.description || 'Bộ câu hỏi được đồng bộ trực tiếp từ cơ sở dữ liệu PostgreSQL.'}
          </p>
        </div>

        {/* Questions List */}
        {!isSubmitted ? (
          <div className="space-y-4">
            {questions.map((q) => (
              <div
                key={q.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-3"
              >
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {q.question_number}
                  </span>
                  <p className="text-xs sm:text-sm font-bold text-slate-800 leading-snug">
                    {q.question_text}
                  </p>
                </div>

                <div className="space-y-2 pl-9">
                  {q.options.map((opt) => {
                    const isSelected = answers[q.id] === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => handleSelect(q.id, opt.key)}
                        className={`w-full text-left p-3 rounded-xl border text-xs transition flex items-center gap-3 ${
                          isSelected
                            ? 'bg-indigo-50/80 border-indigo-600 text-indigo-900 font-bold ring-2 ring-indigo-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full border text-[11px] font-bold flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-slate-300 text-slate-500'
                          }`}
                        >
                          {opt.key}
                        </span>
                        <span className="flex-1">{opt.text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={submitting || Object.keys(answers).length < questions.length}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold shadow-lg shadow-emerald-200 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? 'Đang chấm điểm trên máy chủ...' : `Nộp bài & Chấm điểm (${Object.keys(answers).length}/${questions.length} câu)`}
              </button>
            </div>
          </div>
        ) : (
          /* Results View with AI Explanations */
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center shadow-inner">
                <Award className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-slate-900">Kết quả Kiểm tra của bạn</h2>
              <div className="text-3xl font-black text-indigo-600">
                {calculatedScore} / {questions.length}
              </div>
              <p className="text-xs text-slate-500">
                {isPassed
                  ? '🎉 Xuất sắc! Bạn đã vượt qua bài kiểm tra và được ghi nhận tiến độ vào PostgreSQL.'
                  : '👍 Bạn đã hoàn thành bài kiểm tra. Hãy xem lại giải thích chi tiết bên dưới để ôn tập lại nhé!'}
              </p>
              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={() => {
                    setIsSubmitted(false);
                    setAnswers({});
                  }}
                  className="px-5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Làm lại bài thi
                </button>
                <button
                  onClick={handleGoBack}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-100"
                >
                  Tiếp tục xem video bài giảng
                </button>
              </div>
            </div>

            {/* Explanations */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Giải thích đáp án chi tiết từ AI Tutor
              </h3>
              {questions.map((q) => {
                const isCorrect = answers[q.id] === correctAnswers[q.id];
                return (
                  <div
                    key={q.id}
                    className={`bg-white rounded-2xl p-5 border shadow-2xs space-y-3 ${
                      isCorrect ? 'border-emerald-200' : 'border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs sm:text-sm font-bold text-slate-900">
                        Câu {q.question_number}: {q.question_text}
                      </p>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                          isCorrect
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {isCorrect ? 'Đúng' : 'Chưa đúng'}
                      </span>
                    </div>

                    <div className="text-xs space-y-1 text-slate-600 pl-4 border-l-2 border-slate-200">
                      <p>
                        Đáp án của bạn:{' '}
                        <span className="font-bold">{answers[q.id] || 'Chưa chọn'}</span>
                      </p>
                      <p>
                        Đáp án chính xác:{' '}
                        <span className="font-bold text-emerald-600">{correctAnswers[q.id] || '—'}</span>
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                      <p className="font-bold text-indigo-700 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Giải thích sư phạm:
                      </p>
                      <p className="leading-relaxed text-slate-600">{q.explanation}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
