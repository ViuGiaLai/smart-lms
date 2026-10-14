'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Layers,
  Sparkles,
  BookOpen,
  Clock,
  Award,
  CheckCircle2,
  Trash2,
  Eye,
  PlusCircle,
  Search,
  RefreshCw,
  HelpCircle,
  ChevronRight,
  X,
  FileCheck,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { instructorApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';

interface QuestionItem {
  id: number;
  questionNumber: number;
  questionText: string;
  options: any[];
  correctAnswer: any;
  explanation: string;
}

interface QuizBankItem {
  id: number;
  courseId: string;
  courseTitle: string;
  title: string;
  description: string;
  timeLimit: number;
  passScore: number;
  totalQuestions: number;
  isAiGenerated: boolean;
  createdAt: string;
  questions: QuestionItem[];
}

export default function QuizBankPage() {
  const { isAuthorized, user } = useRoleGuard(['instructor', 'admin']);
  const isAdmin = user?.role === 'admin';

  const [quizzes, setQuizzes] = useState<QuizBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('all');
  const [selectedQuizPreview, setSelectedQuizPreview] = useState<QuizBankItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchQuizzes = async () => {
    setLoading(true);
    try {
      const res = await instructorApi.getQuizzes();
      const list = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      setQuizzes(list);
    } catch (err) {
      console.error('Lỗi khi tải ngân hàng đề thi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchQuizzes();
    }
  }, [isAuthorized]);

  const handleDeleteQuiz = async (courseId: string, quizId: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa bộ đề thi này khỏi ngân hàng đề?')) return;
    setDeletingId(quizId);
    try {
      await instructorApi.deleteQuiz(courseId, quizId);
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
      if (selectedQuizPreview?.id === quizId) {
        setSelectedQuizPreview(null);
      }
    } catch (err: any) {
      alert('Lỗi khi xóa bộ đề: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDeletingId(null);
    }
  };

  // Lấy danh sách các khóa học duy nhất để làm bộ lọc
  const uniqueCourses = Array.from(
    new Map(quizzes.map((q) => [q.courseId, { id: q.courseId, title: q.courseTitle }])).values()
  );

  // Lọc danh sách đề thi theo tìm kiếm và khóa học
  const filteredQuizzes = quizzes.filter((q) => {
    const matchesSearch =
      q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.courseTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.description && q.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCourse = selectedCourseFilter === 'all' || q.courseId === selectedCourseFilter;
    return matchesSearch && matchesCourse;
  });

  const totalQuestionsSum = quizzes.reduce((acc, curr) => acc + (curr.totalQuestions || 0), 0);

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="animate-pulse text-xs font-semibold text-slate-500">
          Đang xác thực quyền truy cập Ngân hàng đề thi...
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans space-y-6 pb-16">
      {/* ── HEADER BANNER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
              Khảo thí & Ngân hàng đề thi
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Đồng bộ PostgreSQL
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Ngân hàng Đề thi Trắc nghiệm
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            {isAdmin
              ? 'Quản lý tập trung toàn bộ bộ đề kiểm tra trắc nghiệm của hệ thống. Học viên chỉ làm bài từ trang khóa học của mình.'
              : 'Quản lý các bộ đề kiểm tra trắc nghiệm thuộc khóa học bạn phụ trách. Học viên chỉ làm bài từ trang khóa học của mình.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={fetchQuizzes}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-slate-50 transition"
            title="Tải lại danh sách"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          <Link
            href="/quiz/generate"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold shadow-md shadow-indigo-200 transition"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Sinh đề thi mới bằng AI</span>
          </Link>
        </div>
      </div>

      {/* ── THỐNG KÊ NHANH ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-black text-slate-900">{quizzes.length}</div>
            <div className="text-xs text-slate-500 font-medium">Tổng số bộ đề thi đã lưu</div>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-black text-slate-900">{totalQuestionsSum}</div>
            <div className="text-xs text-slate-500 font-medium">Tổng số câu hỏi trắc nghiệm</div>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-black text-slate-900">{uniqueCourses.length}</div>
            <div className="text-xs text-slate-500 font-medium">Khóa học đã thiết lập đề thi</div>
          </div>
        </div>
      </div>

      {/* ── THANH CÔNG CỤ TÌM KIẾM & BỘ LỌC ── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm theo tên đề thi, nội dung hoặc khóa học..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-medium hidden md:block">Lọc theo khóa:</label>
          <select
            value={selectedCourseFilter}
            onChange={(e) => setSelectedCourseFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Tất cả khóa học ({quizzes.length})</option>
            {uniqueCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── DANH SÁCH BỘ ĐỀ THI TRẮC NGHIỆM ── */}
      {loading ? (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Đang tải danh sách đề thi từ PostgreSQL...</p>
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Chưa có đề thi nào trong ngân hàng</h3>
          <p className="text-xs text-slate-500 max-w-md">
            {searchQuery || selectedCourseFilter !== 'all'
              ? 'Không tìm thấy bộ đề phù hợp với bộ lọc tìm kiếm hiện tại.'
              : 'Bạn chưa lưu đề thi nào cho các khóa học của mình. Hãy sử dụng Trợ lý AI để tự động tạo đề thi theo chuẩn Bloom chỉ trong vài giây!'}
          </p>
          <Link
            href="/quiz/generate"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm mt-2"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Tạo đề thi đầu tiên với AI</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredQuizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-200 hover:shadow-md transition flex flex-col md:flex-row md:items-center justify-between gap-4 group"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Đề #{quiz.id}
                  </span>
                  <span className="text-xs font-bold text-slate-600 truncate max-w-xs flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                    <span>{quiz.courseTitle}</span>
                  </span>
                  {quiz.isAiGenerated && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">
                      <Sparkles className="w-3 h-3 text-violet-500" />
                      AI Bloom
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition truncate">
                  {quiz.title}
                </h3>

                <p className="text-xs text-slate-500 line-clamp-1">{quiz.description || 'Không có mô tả chi tiết'}</p>

                <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pt-1">
                  <span className="flex items-center gap-1">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <strong className="text-slate-700 font-semibold">{quiz.totalQuestions}</strong> câu hỏi
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <strong className="text-slate-700 font-semibold">{Math.round(quiz.timeLimit / 60)}</strong> phút
                  </span>
                  <span className="flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-violet-500" />
                    Điểm đạt: <strong className="text-slate-700 font-semibold">{Math.round(quiz.passScore * 100)}%</strong>
                  </span>
                  {quiz.createdAt && (
                    <span className="text-slate-400 text-[10px] hidden sm:inline-block">
                      Tạo lúc: {quiz.createdAt}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                {/* Nút Xem chi tiết bộ câu hỏi */}
                <button
                  onClick={() => setSelectedQuizPreview(quiz)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 text-xs font-semibold text-slate-700 transition"
                  title="Xem các câu hỏi và đáp án chi tiết"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-600" />
                  <span>Xem câu hỏi</span>
                </button>

                {/* Nút Xóa đề thi */}
                <button
                  onClick={() => handleDeleteQuiz(quiz.courseId, quiz.id)}
                  disabled={deletingId === quiz.id}
                  className="p-2 rounded-xl border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                  title="Xóa đề thi khỏi ngân hàng"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MODAL XEM CHI TIẾT CÂU HỎI & ĐÁP ÁN (DRAWER PREVIEW) ── */}
      {selectedQuizPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                    Đề #{selectedQuizPreview.id}
                  </span>
                  <span className="text-xs font-semibold text-slate-600">
                    {selectedQuizPreview.courseTitle}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 pt-1">
                  {selectedQuizPreview.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedQuizPreview(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Questions List */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {selectedQuizPreview.questions && selectedQuizPreview.questions.length > 0 ? (
                selectedQuizPreview.questions.map((q, idx) => (
                  <div key={q.id || idx} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-indigo-700">Câu {idx + 1}:</span>
                      <span className="text-xs text-slate-400 font-medium">1 điểm</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 leading-relaxed">
                      {q.questionText}
                    </p>

                    {/* Options list */}
                    <div className="space-y-1.5 pt-1">
                      {(q.options || []).map((opt: any, optIdx: number) => {
                        const optKey = typeof opt === 'object' ? opt.key || String.fromCharCode(65 + optIdx) : String.fromCharCode(65 + optIdx);
                        const optText = typeof opt === 'object' ? opt.text || String(opt) : String(opt);
                        const isCorrect =
                          String(optKey).toUpperCase() === String(q.correctAnswer).toUpperCase() ||
                          optIdx === q.correctAnswer;

                        return (
                          <div
                            key={optIdx}
                            className={`p-2.5 rounded-xl text-xs flex items-center justify-between border ${
                              isCorrect
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                : 'bg-white border-slate-200 text-slate-600'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                                  isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {optKey}
                              </span>
                              <span>{optText}</span>
                            </div>
                            {isCorrect && (
                              <span className="text-[10px] uppercase font-bold text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Đáp án đúng
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation */}
                    {q.explanation && (
                      <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900">
                        <span className="font-bold">Giải thích: </span>
                        {q.explanation}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  Bộ đề này chưa có danh sách câu hỏi chi tiết trong hệ thống.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="text-xs text-slate-500 font-medium">
                Tổng cộng: {selectedQuizPreview.questions?.length || 0} câu hỏi
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedQuizPreview(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
