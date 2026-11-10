'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';

import { instructorApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/page-skeleton';

interface CourseOption {
  id: string;
  title: string;
  lessons: Array<{ id: string; title: string }>;
}

interface RubricRow {
  name: string;
  description: string;
  maxScore: number;
}

interface CriterionScore {
  criteria_name: string;
  criteria_description?: string;
  max_score: number;
  earned_score: number;
  comment?: string;
}

interface GradingRecord {
  id: string;
  studentName: string;
  studentEmail?: string | null;
  question?: string | null;
  studentAnswer: string;
  courseId?: string | null;
  lessonId?: string | null;
  totalScore: number;
  maxTotalScore: number;
  percentage: number;
  gradeLevel: string;
  criteriaScores: CriterionScore[];
  overallFeedback?: string | null;
  strengths: string[];
  improvements: string[];
  createdAt?: string | null;
}

const DEFAULT_RUBRIC: RubricRow[] = [
  { name: 'Nắm vững kiến thức', description: 'Độ chính xác và đầy đủ của kiến thức chuyên môn', maxScore: 4 },
  { name: 'Lập luận và phân tích', description: 'Mạch lập luận, khả năng phân tích và liên hệ', maxScore: 3 },
  { name: 'Trình bày và ngôn ngữ', description: 'Cấu trúc bài viết, diễn đạt rõ ràng', maxScore: 3 },
];

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function InstructorGradingPage() {
  const { isAuthorized } = useRoleGuard(['instructor', 'admin']);

  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);

  const [courseId, setCourseId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [question, setQuestion] = useState('');
  const [studentAnswer, setStudentAnswer] = useState('');
  const [referenceAnswer, setReferenceAnswer] = useState('');
  const [rubric, setRubric] = useState<RubricRow[]>(DEFAULT_RUBRIC);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GradingRecord | null>(null);

  const [history, setHistory] = useState<GradingRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === courseId) || null,
    [courses, courseId],
  );
  const totalMaxScore = useMemo(
    () => Math.round(rubric.reduce((sum, row) => sum + (Number(row.maxScore) || 0), 0) * 100) / 100,
    [rubric],
  );

  const loadCourses = useCallback(async () => {
    setLoadingCourses(true);
    try {
      const res = await instructorApi.getMaterials();
      const payload = res.data?.data;
      const rows = Array.isArray(payload?.courses) ? payload.courses : [];
      setCourses(
        rows.map((course: any) => ({
          id: String(course.id),
          title: course.title,
          lessons: Array.isArray(course.lessons)
            ? course.lessons.map((lesson: any) => ({ id: String(lesson.id), title: lesson.title }))
            : [],
        })),
      );
    } catch {
      setCourses([]);
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await instructorApi.getGradingHistory({ limit: 20 });
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      setHistory(rows);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;
    void loadCourses();
    void loadHistory();
  }, [isAuthorized, loadCourses, loadHistory]);

  const updateRubricRow = (index: number, patch: Partial<RubricRow>) => {
    setRubric((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  };

  const addRubricRow = () => {
    if (rubric.length >= 8) return;
    setRubric((prev) => [...prev, { name: '', description: '', maxScore: 1 }]);
  };

  const removeRubricRow = (index: number) => {
    setRubric((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setResult(null);

    if (!studentName.trim()) {
      setError('Vui lòng nhập tên học viên.');
      return;
    }
    if (studentAnswer.trim().length < 20) {
      setError('Bài làm cần có ít nhất 20 ký tự để AI chấm có căn cứ.');
      return;
    }
    const invalidRubric = rubric.some((row) => !row.name.trim() || row.maxScore <= 0);
    if (invalidRubric) {
      setError('Mỗi tiêu chí cần có tên và điểm tối đa lớn hơn 0.');
      return;
    }
    if (totalMaxScore <= 0) {
      setError('Tổng điểm tối đa của rubric phải lớn hơn 0.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await instructorApi.evaluateEssay({
        studentName: studentName.trim(),
        studentEmail: studentEmail.trim() || undefined,
        question: question.trim() || undefined,
        studentAnswer: studentAnswer.trim(),
        referenceAnswer: referenceAnswer.trim() || undefined,
        rubric,
        courseId: courseId ? Number(courseId) : null,
        lessonId: lessonId ? Number(lessonId) : null,
        maxTotalScore: totalMaxScore,
      });
      const data = res.data?.data as GradingRecord | undefined;
      if (data) {
        setResult(data);
        setHistory((prev) => [data, ...prev.filter((row) => row.id !== data.id)].slice(0, 20));
      }
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Không chấm được bài này. Kiểm tra AI Service (cổng 8001) rồi thử lại.';
      setError(String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa kết quả chấm này? Hành động không thể hoàn tác.')) return;
    try {
      await instructorApi.deleteGrading(id);
      setHistory((prev) => prev.filter((row) => row.id !== id));
      setResult((prev) => (prev?.id === id ? null : prev));
    } catch {
      setError('Không xóa được kết quả chấm. Vui lòng thử lại.');
    }
  };

  if (!isAuthorized) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 pb-16 font-sans sm:px-6 lg:px-8">
      <PageHeader
        badges={[
          { label: 'Chấm bài tự luận', variant: 'info' },
          { label: 'AI theo Rubric', variant: 'success' },
        ]}
        title="Chấm bài tự luận bằng AI"
        description="Định nghĩa tiêu chí chấm, dán bài làm của học viên và nhận điểm từng tiêu chí kèm nhận xét. Kết quả được lưu lại để đối chiếu sau."
        actions={[
          {
            label: 'Làm mới lịch sử',
            icon: <RefreshCw className={`h-4 w-4 ${historyLoading ? 'animate-spin' : ''}`} />,
            onClick: () => void loadHistory(),
            disabled: historyLoading,
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Thông tin bài chấm</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs font-medium text-foreground">
                  Khóa học
                  <select
                    value={courseId}
                    onChange={(event) => {
                      setCourseId(event.target.value);
                      setLessonId('');
                    }}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Không gắn khóa học</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 text-xs font-medium text-foreground">
                  Bài học
                  <select
                    value={lessonId}
                    onChange={(event) => setLessonId(event.target.value)}
                    disabled={!selectedCourse}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    <option value="">Không gắn bài học</option>
                    {selectedCourse?.lessons.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 text-xs font-medium text-foreground">
                  Học viên
                  <Input
                    value={studentName}
                    onChange={(event) => setStudentName(event.target.value)}
                    placeholder="Nguyễn Văn A"
                    maxLength={255}
                  />
                </label>

                <label className="space-y-1.5 text-xs font-medium text-foreground">
                  Email (không bắt buộc)
                  <Input
                    type="email"
                    value={studentEmail}
                    onChange={(event) => setStudentEmail(event.target.value)}
                    placeholder="sinhvien@donga.edu.vn"
                    maxLength={255}
                  />
                </label>
              </div>

              <label className="block space-y-1.5 text-xs font-medium text-foreground">
                Đề bài / câu hỏi
                <Textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ví dụ: Phân tích ưu điểm của kiến trúc Event Loop trong Python..."
                  rows={2}
                  maxLength={4000}
                />
              </label>

              <label className="block space-y-1.5 text-xs font-medium text-foreground">
                Bài làm của học viên
                <Textarea
                  value={studentAnswer}
                  onChange={(event) => setStudentAnswer(event.target.value)}
                  placeholder="Dán nội dung bài làm tự luận..."
                  rows={7}
                  maxLength={20000}
                />
                <span className="block text-right text-[11px] font-normal text-muted-foreground">
                  {studentAnswer.trim().length}/20000 ký tự
                </span>
              </label>

              <label className="block space-y-1.5 text-xs font-medium text-foreground">
                Đáp án tham khảo (không bắt buộc)
                <Textarea
                  value={referenceAnswer}
                  onChange={(event) => setReferenceAnswer(event.target.value)}
                  placeholder="Giảng viên có thể dán đáp án chuẩn để AI đối chiếu..."
                  rows={3}
                  maxLength={8000}
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Bảng tiêu chí (Rubric)</h2>
                </div>
                <Badge variant="secondary">Tổng điểm tối đa: {totalMaxScore}</Badge>
              </div>

              <div className="space-y-3">
                {rubric.map((row, index) => (
                  <div key={index} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_90px_40px]">
                    <div className="space-y-2">
                      <Input
                        value={row.name}
                        onChange={(event) => updateRubricRow(index, { name: event.target.value })}
                        placeholder={`Tên tiêu chí ${index + 1}`}
                        maxLength={160}
                      />
                      <Input
                        value={row.description}
                        onChange={(event) => updateRubricRow(index, { description: event.target.value })}
                        placeholder="Mô tả yêu cầu của tiêu chí"
                        maxLength={1000}
                      />
                    </div>
                    <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
                      Điểm tối đa
                      <Input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={row.maxScore}
                        onChange={(event) =>
                          updateRubricRow(index, { maxScore: Number(event.target.value) })
                        }
                      />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRubricRow(index)}
                      disabled={rubric.length <= 1}
                      aria-label="Xóa tiêu chí"
                      className="self-end text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={addRubricRow} disabled={rubric.length >= 8}>
                Thêm tiêu chí
              </Button>
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <Button type="submit" disabled={submitting} className="min-w-[180px]">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang chấm bài...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Chấm bài bằng AI
                </>
              )}
            </Button>
          </div>
        </form>

        <div className="space-y-6">
          {result ? (
            <Card className="border-primary/20">
              <CardContent className="space-y-4 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Kết quả chấm
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">
                      {result.totalScore}
                      <span className="text-sm font-normal text-muted-foreground"> / {result.maxTotalScore}</span>
                    </p>
                  </div>
                  <Badge variant={result.percentage >= 50 ? 'success' : 'warning'}>
                    {result.gradeLevel} · {Math.round(result.percentage)}%
                  </Badge>
                </div>

                <div className="space-y-3">
                  {result.criteriaScores.map((score, index) => {
                    const percent =
                      score.max_score > 0 ? Math.min(100, (score.earned_score / score.max_score) * 100) : 0;
                    return (
                      <div key={`${score.criteria_name}-${index}`} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-foreground">{score.criteria_name}</span>
                          <span className="text-muted-foreground">
                            {score.earned_score}/{score.max_score}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                        </div>
                        {score.comment && (
                          <p className="text-[11px] leading-relaxed text-muted-foreground">{score.comment}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {result.overallFeedback && (
                  <div className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed text-foreground">
                    {result.overallFeedback}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Điểm mạnh
                    </p>
                    <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                      {(result.strengths.length > 0 ? result.strengths : ['Chưa có nhận xét']).map((item, idx) => (
                        <li key={idx}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-amber-700">
                      <Sparkles className="h-3.5 w-3.5" /> Cần cải thiện
                    </p>
                    <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                      {(result.improvements.length > 0 ? result.improvements : ['Chưa có nhận xét']).map((item, idx) => (
                        <li key={idx}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-6">
                <EmptyState
                  icon={<Sparkles className="h-5 w-5" />}
                  title="Chưa có kết quả"
                  description="Điền bài làm và bấm “Chấm bài bằng AI” để xem điểm từng tiêu chí cùng nhận xét chi tiết."
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-3 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Lịch sử chấm gần đây</h2>
                <Badge variant="secondary">{history.length}</Badge>
              </div>

              {historyLoading ? (
                <p className="text-xs text-muted-foreground">Đang tải lịch sử...</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground">Chưa có bài nào được chấm.</p>
              ) : (
                <div className="divide-y divide-border">
                  {history.map((row) => (
                    <div key={row.id} className="flex items-start justify-between gap-3 py-3">
                      <button
                        type="button"
                        onClick={() => setResult(row)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-xs font-semibold text-foreground">{row.studentName}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {row.totalScore}/{row.maxTotalScore} điểm · {row.gradeLevel} · {formatDate(row.createdAt)}
                        </p>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDelete(row.id)}
                        aria-label="Xóa kết quả chấm"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
