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
  Search,
  RefreshCw,
  FileCheck,
} from 'lucide-react';
import { instructorApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';

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
      <div className="flex min-h-screen items-center justify-center font-sans">
        <div className="animate-pulse text-xs font-semibold text-muted-foreground">
          Đang xác thực quyền truy cập Ngân hàng đề thi...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 font-sans">
      {/* ── HEADER ── */}
      <PageHeader
        badges={[
          { label: 'Khảo thí & Ngân hàng đề thi', variant: 'info' },
          { label: 'Đồng bộ PostgreSQL', variant: 'success' },
        ]}
        title="Ngân hàng Đề thi Trắc nghiệm"
        description={
          isAdmin
            ? 'Quản lý tập trung toàn bộ bộ đề kiểm tra trắc nghiệm của hệ thống. Học viên chỉ làm bài từ trang khóa học của mình.'
            : 'Quản lý các bộ đề kiểm tra trắc nghiệm thuộc khóa học bạn phụ trách. Học viên chỉ làm bài từ trang khóa học của mình.'
        }
        actions={[
          {
            label: 'Làm mới',
            icon: (
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-primary' : ''}`} />
            ),
            onClick: fetchQuizzes,
            disabled: loading,
          },
          {
            label: 'Sinh đề thi mới bằng AI',
            icon: <Sparkles className="h-4 w-4" />,
            href: '/quiz/generate',
          },
        ]}
      />

      {/* ── THỐNG KÊ NHANH ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Layers} label="Tổng số bộ đề thi đã lưu" value={quizzes.length} accent="primary" loading={loading} />
        <StatCard icon={FileCheck} label="Tổng số câu hỏi trắc nghiệm" value={totalQuestionsSum} accent="emerald" loading={loading} />
        <StatCard icon={BookOpen} label="Khóa học đã thiết lập đề thi" value={uniqueCourses.length} accent="purple" loading={loading} />
      </div>

      {/* ── THANH CÔNG CỤ TÌM KIẾM & BỘ LỌC ── */}
      <Card className="p-4">
        <CardContent className="flex flex-col items-stretch justify-between gap-3 p-0 sm:flex-row sm:items-center">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Tìm theo tên đề thi, nội dung hoặc khóa học..."
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
              value={selectedCourseFilter}
              onChange={(e) => setSelectedCourseFilter(e.target.value)}
              className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Tất cả khóa học ({quizzes.length})</option>
              {uniqueCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* ── DANH SÁCH BỘ ĐỀ THI TRẮC NGHIỆM ── */}
      {loading ? (
        <div className="space-y-3.5">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-5">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16 rounded-md" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-5 w-20 rounded-md" />
                </div>
                <Skeleton className="h-4 w-72" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </Card>
          ))}
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title="Chưa có đề thi nào trong ngân hàng"
          description={
            searchQuery || selectedCourseFilter !== 'all'
              ? 'Không tìm thấy bộ đề phù hợp với bộ lọc tìm kiếm hiện tại.'
              : 'Bạn chưa lưu đề thi nào cho các khóa học của mình. Hãy sử dụng Trợ lý AI để tự động tạo đề thi theo chuẩn Bloom chỉ trong vài giây!'
          }
        >
          <Button asChild variant="default" size="sm">
            <Link href="/quiz/generate">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Tạo đề thi đầu tiên với AI</span>
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredQuizzes.map((quiz) => (
            <Card
              key={quiz.id}
              className="group transition-colors hover:border-ring/40 hover:shadow-md"
            >
              <CardContent className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="info" className="rounded-md text-[10px] font-bold">
                      Đề #{quiz.id}
                    </Badge>
                    <span className="flex max-w-xs items-center gap-1 truncate text-xs font-bold text-foreground/80">
                      <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{quiz.courseTitle}</span>
                    </span>
                    {quiz.isAiGenerated && (
                      <Badge variant="purple" className="rounded-md text-[10px] font-semibold">
                        <Sparkles className="h-3 w-3 text-purple-500" />
                        AI Bloom
                      </Badge>
                    )}
                  </div>

                  <h3 className="truncate text-sm font-bold text-foreground transition-colors group-hover:text-primary">
                    {quiz.title}
                  </h3>

                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {quiz.description || 'Không có mô tả chi tiết'}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileCheck className="h-3.5 w-3.5 text-emerald-500" />
                      <strong className="font-semibold text-foreground/80">{quiz.totalQuestions}</strong> câu hỏi
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                      <strong className="font-semibold text-foreground/80">{Math.round(quiz.timeLimit / 60)}</strong> phút
                    </span>
                    <span className="flex items-center gap-1">
                      <Award className="h-3.5 w-3.5 text-violet-500" />
                      Điểm đạt: <strong className="font-semibold text-foreground/80">{Math.round(quiz.passScore * 100)}%</strong>
                    </span>
                    {quiz.createdAt && (
                      <span className="hidden text-[10px] text-muted-foreground/60 sm:inline-block">
                        Tạo lúc: {quiz.createdAt}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex shrink-0 items-center gap-2 border-t border-border pt-3 md:border-t-0 md:pt-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedQuizPreview(quiz)}
                    title="Xem các câu hỏi và đáp án chi tiết"
                  >
                    <Eye className="text-muted-foreground group-hover:text-primary" />
                    <span>Xem câu hỏi</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => handleDeleteQuiz(quiz.courseId, quiz.id)}
                    disabled={deletingId === quiz.id}
                    title="Xóa đề thi khỏi ngân hàng"
                  >
                    <Trash2 className="text-muted-foreground transition-colors hover:text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── MODAL XEM CHI TIẾT CÂU HỎI & ĐÁP ÁN (shadcn Dialog) ── */}
      <Dialog open={Boolean(selectedQuizPreview)} onOpenChange={(open) => !open && setSelectedQuizPreview(null)}>
        <DialogContent
          className="flex max-h-[85vh] flex-col p-0"
          aria-describedby={undefined}
        >
          {selectedQuizPreview && (
            <>
              <DialogHeader className="border-b border-border bg-muted/50 text-left">
                <div className="flex items-center gap-2 pr-8">
                  <Badge variant="info" className="rounded text-[10px] font-bold">
                    Đề #{selectedQuizPreview.id}
                  </Badge>
                  <span className="text-xs font-semibold text-foreground/80">
                    {selectedQuizPreview.courseTitle}
                  </span>
                </div>
                <DialogTitle className="pt-1">{selectedQuizPreview.title}</DialogTitle>
                <DialogDescription className="sr-only">
                  Chi tiết câu hỏi và đáp án của đề thi #{selectedQuizPreview.id}
                </DialogDescription>
              </DialogHeader>

              {/* Modal Questions List */}
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                {selectedQuizPreview.questions && selectedQuizPreview.questions.length > 0 ? (
                  selectedQuizPreview.questions.map((q, idx) => (
                    <div key={q.id || idx} className="space-y-3 rounded-2xl border border-border bg-muted/50 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-primary">Câu {idx + 1}:</span>
                        <span className="text-xs font-medium text-muted-foreground">1 điểm</span>
                      </div>
                      <p className="text-xs font-semibold leading-relaxed text-foreground">
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
                              className={`flex items-center justify-between rounded-xl border p-2.5 text-xs ${
                                isCorrect
                                  ? 'border-emerald-500/40 bg-emerald-500/10 font-semibold text-emerald-900'
                                  : 'border-border bg-card text-muted-foreground'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold ${
                                    isCorrect ? 'bg-emerald-600 text-white' : 'bg-muted text-foreground/70'
                                  }`}
                                >
                                  {optKey}
                                </span>
                                <span>{optText}</span>
                              </div>
                              {isCorrect && (
                                <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-700">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Đáp án đúng
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Explanation */}
                      {q.explanation && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-900">
                          <span className="font-bold">Giải thích: </span>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    Bộ đề này chưa có danh sách câu hỏi chi tiết trong hệ thống.
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <DialogFooter className="border-t border-border bg-muted/50">
                <span className="mr-auto text-xs font-medium text-muted-foreground">
                  Tổng cộng: {selectedQuizPreview.questions?.length || 0} câu hỏi
                </span>
                <Button variant="outline" size="sm" onClick={() => setSelectedQuizPreview(null)}>
                  Đóng
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
