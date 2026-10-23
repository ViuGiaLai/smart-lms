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
import { coursesApi, instructorApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LessonItem {
  id: string | number;
  title: string;
  order_index?: number;
  duration?: number;
  durationText?: string;
  video_url?: string;
  transcript?: string;
  resources_url?: string;
}

type DocumentUploadState = 'idle' | 'uploading' | 'processing' | 'ready' | 'error';

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
  const courseId = (params?.id as string) || '';

  const [courseTitle, setCourseTitle] = useState('Đang tải thông tin khóa học...');
  const [courseSlug, setCourseSlug] = useState('');
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
  const [documentFiles, setDocumentFiles] = useState<Record<string, File | undefined>>({});
  const [documentStates, setDocumentStates] = useState<Record<string, DocumentUploadState>>({});
  const [documentMessages, setDocumentMessages] = useState<Record<string, string>>({});

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

  // API trả duration dạng "45m" hoặc số giây tuỳ endpoint; chuẩn hoá về giây
  const parseDurationSeconds = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const hours = value.match(/(\d+)\s*h/i);
      const minutes = value.match(/(\d+)\s*m/i);
      if (hours || minutes) {
        return (hours ? parseInt(hours[1], 10) : 0) * 3600 + (minutes ? parseInt(minutes[1], 10) : 0) * 60;
      }
      const seconds = parseInt(value, 10);
      return Number.isFinite(seconds) ? seconds : 0;
    }
    return 0;
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
          setCourseTitle(c.title || 'Khóa học chưa có tiêu đề');
          setCourseSlug(c.slug || '');
          setLessons(
            (c.lessons || []).map((lesson: any) => ({
              ...lesson,
              duration: parseDurationSeconds(lesson.duration),
              video_url: lesson.video_url ?? lesson.videoUrl ?? '',
              resources_url: lesson.resources_url ?? '',
              transcript: lesson.transcript ?? '',
            })),
          );
          setCourseQuizzes(c.quizzes || []);
          setCourseStatus(c.status || 'draft');
        }
      } catch (err) {
        console.error('Lỗi khi nạp dữ liệu khóa học:', err);
        if (isMounted) setCourseTitle('Không thể tải thông tin khóa học');
      }
    };
    fetchCourse();
    return () => {
      isMounted = false;
    };
  }, [courseId, router]);

  // Đồng bộ trạng thái học liệu RAG từ AI Service (qua instructor/materials)
  // để sau khi tải lại trang vẫn biết bài học nào đã có embedding trong pgvector.
  useEffect(() => {
    let isMounted = true;
    instructorApi
      .getMaterials()
      .then((res) => {
        if (!isMounted) return;
        const courses = res.data?.data?.courses || [];
        const current = courses.find((item: any) => String(item.id) === String(courseId));
        if (!current) return;
        const readyStates: Record<string, DocumentUploadState> = {};
        const readyMessages: Record<string, string> = {};
        for (const lesson of current.lessons || []) {
          const chunkCount = Number(lesson.chunkCount) || 0;
          if (chunkCount > 0) {
            readyStates[String(lesson.id)] = 'ready';
            readyMessages[String(lesson.id)] = `Đã có ${chunkCount} đoạn tri thức trong pgvector.`;
          }
        }
        setDocumentStates((prev) => ({ ...readyStates, ...prev }));
        setDocumentMessages((prev) => ({ ...readyMessages, ...prev }));
      })
      .catch(() => {
        // Không chặn trang quản lý nếu AI Service/pgvector tạm thời không phản hồi.
      });
    return () => {
      isMounted = false;
    };
  }, [courseId]);

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
        const mapped: GeneratedQuizQuestion[] = (data.questions || []).map((q: any, idx: number) => {
          const rawOptions: any[] = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
          const originalKeys = rawOptions.map((opt, optIdx) =>
            typeof opt === 'object' && opt?.key ? String(opt.key).toUpperCase() : String.fromCharCode(65 + optIdx),
          );
          const rawCorrect = String(q.correct_answer || q.correct_option || 'A').toUpperCase();
          const correctIdx = originalKeys.indexOf(rawCorrect);
          const mappedOptions = ['A', 'B', 'C', 'D'].map((key, optIdx) => {
            const opt = rawOptions[optIdx];
            return {
              key,
              text: opt === undefined ? '' : typeof opt === 'object' ? String(opt?.text ?? '') : String(opt),
            };
          });

          return {
            question_number: idx + 1,
            question_text: q.question_text || q.question || `Câu hỏi ${idx + 1}`,
            options: mappedOptions,
            correct_option: String.fromCharCode(65 + (correctIdx >= 0 ? correctIdx : 0)),
            explanation: String(q.explanation || '').trim(),
          };
        });
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

  const handleUpdateExplanation = (qIndex: number, text: string) => {
    setQuizQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, explanation: text } : q))
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
    if (!newTitle.trim() || isSubmitting) return;

    if (quizQuestions.length > 0) {
      const invalidIndex = quizQuestions.findIndex(
        (q) =>
          !q.question_text.trim() ||
          q.options.length !== 4 ||
          q.options.some((o) => !o.text.trim()) ||
          !q.explanation.trim(),
      );
      if (invalidIndex >= 0) {
        alert(`Câu ${invalidIndex + 1}: vui lòng nhập đủ nội dung câu hỏi, 4 đáp án và giải thích.`);
        return;
      }
    }

    setIsSubmitting(true);
    const orderIndex =
      lessons.reduce((max, lesson) => Math.max(max, Number(lesson.order_index) || 0), 0) + 1;
    const durationSeconds = (parseInt(newDuration, 10) || 45) * 60;
    const selectedDocumentFile = documentFiles.new;
    const pendingQuizQuestions = quizQuestions;

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // 1. Tạo bài học trong database
      const res = await fetch(`${apiUrl}/api/v1/courses/${courseId}/lessons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          order_index: orderIndex,
          duration: durationSeconds,
          video_url: newVideoUrl.trim() || undefined,
          transcript: newTranscript.trim() || undefined,
          resources_url: newResourcesUrl.trim() || undefined,
        }),
      });

      const created = await res.json().catch(() => null);
      if (!res.ok) {
        const detail =
          typeof created?.detail === 'string' ? created.detail : created?.detail?.[0]?.msg || 'Lỗi máy chủ khi tạo bài học';
        throw new Error(detail);
      }

      setLessons((prev) => [
        ...prev,
        {
          ...created,
          duration: parseDurationSeconds(created?.duration ?? durationSeconds),
          video_url: created?.video_url ?? newVideoUrl.trim(),
          resources_url: created?.resources_url ?? newResourcesUrl.trim(),
          transcript: created?.transcript ?? newTranscript.trim(),
        },
      ]);

      if (selectedDocumentFile && created?.id) {
        await uploadDocument(created.id, selectedDocumentFile);
      }

      // 2. Lưu bộ đề đã duyệt (nếu có)
      if (pendingQuizQuestions.length > 0) {
        const quizRes = await fetch(`${apiUrl}/api/v1/courses/${courseId}/quizzes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            lesson_id: created?.id ? Number(created.id) : null,
            title: `Trắc nghiệm ôn tập: ${newTitle.trim()}`,
            description: `Bộ đề củng cố kiến thức bài giảng "${newTitle.trim()}"`,
            time_limit: 600,
            pass_score: 0.6,
            questions: pendingQuizQuestions.map((q, idx) => ({
              question_text: q.question_text,
              options: q.options,
              correct_answer: q.correct_option,
              explanation: q.explanation,
              order_index: idx + 1,
            })),
          }),
        });

        if (!quizRes.ok) {
          const quizErrorData = await quizRes.json().catch(() => null);
          const detail =
            typeof quizErrorData?.detail === 'string'
              ? quizErrorData.detail
              : quizErrorData?.detail?.[0]?.msg || 'Lỗi không xác định';
          alert(`Bài học đã được tạo nhưng chưa lưu được bộ đề: ${detail}`);
        }
      }

      setShowAddForm(false);
      setNewTitle('');
      setNewVideoUrl('');
      setNewTranscript('');
      setNewResourcesUrl('');
      setDocumentFiles({});
      setQuizQuestions([]);
      setSuccessMessage('Đã thêm bài học và bộ đề trắc nghiệm vào hệ thống!');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err: any) {
      alert('Không thể tạo bài học: ' + (err.message || 'Vui lòng thử lại'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const uploadDocument = async (lessonId: string | number, file: File) => {
    const key = String(lessonId);
    setDocumentStates((prev) => ({ ...prev, [key]: 'uploading' }));
    setDocumentMessages((prev) => ({ ...prev, [key]: `Đang tải ${file.name}...` }));

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(
        `${apiUrl}/api/v1/courses/${courseId}/lessons/${lessonId}/documents/upload`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || 'Không thể xử lý tài liệu');
      }

      setDocumentStates((prev) => ({ ...prev, [key]: 'ready' }));
      setDocumentMessages((prev) => ({
        ...prev,
        [key]: `${file.name} đã được parse, tạo embedding và liên kết với bài học.`,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lỗi không xác định khi upload tài liệu';
      setDocumentStates((prev) => ({ ...prev, [key]: 'error' }));
      setDocumentMessages((prev) => ({ ...prev, [key]: message }));
    }
  };

  const handlePublishCourse = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/v1/courses/${courseId}/publish`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || 'Không thể xuất bản khóa học');
      }
      setCourseStatus('published');
      setSuccessMessage('Khóa học đã được xuất bản.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể xuất bản khóa học');
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
        setLessons((prev) => prev.filter((l) => String(l.id) !== String(lessonId)));
        setCourseQuizzes((prev) =>
          prev.map((quiz) =>
            String(quiz.lesson_id) === String(lessonId) ? { ...quiz, lesson_id: null } : quiz,
          ),
        );
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
      <div className="flex min-h-screen items-center justify-center text-xs font-semibold text-muted-foreground">
        Đang xác thực quyền Giảng viên...
      </div>
    );
  }

  const embedUrl = getYouTubeEmbedUrl(newVideoUrl);

  return (
    <div className="pb-32 md:pb-16 font-sans">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/instructor-dashboard">
              <ArrowLeft /> Bảng điều khiển Giảng viên
            </Link>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/quiz/bank">
                <Layers className="text-primary" /> Ngân hàng đề thi
              </Link>
            </Button>

            <Button variant="outline" size="sm" asChild className="text-primary">
              <Link href={`/courses/${courseId}/learn?preview=true`}>
                <Eye /> Xem trước bài giảng
              </Link>
            </Button>
          </div>
        </div>

        {/* Course Header Banner */}
        <div className="flex flex-col justify-between rounded-3xl border border-border bg-card p-6 shadow-sm gap-4 sm:flex-row sm:items-start sm:p-8 md:flex-row md:items-center">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info">Khóa học #{courseId}</Badge>
              {courseSlug && <Badge variant="outline">/{courseSlug}</Badge>}
              <Badge variant={courseStatus === 'published' ? 'success' : 'warning'}>
                {courseStatus === 'published' ? '✓ Đã xuất bản' : '✏️ Bản nháp'}
              </Badge>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
              {courseTitle}
            </h1>
            <p className="text-xs text-muted-foreground">
              Quản lý học liệu đa phương tiện (Video YouTube, Slide PDF), trích xuất Transcript cho pgvector và duyệt Bộ đề trắc nghiệm AI
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => setShowAddForm(true)} className="shrink-0">
              <PlusCircle /> Soạn thảo bài học mới
            </Button>
            {courseStatus !== 'published' && (
              <Button type="button" variant="success" onClick={handlePublishCourse} className="shrink-0">
                <CheckCircle2 /> Xuất bản khóa học
              </Button>
            )}
          </div>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-800 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {successMessage}
          </div>
        )}

        {/* Form thêm bài học tích hợp Video YouTube + Slide + AI Quiz Generator */}
        {showAddForm && (
          <div className="space-y-6 rounded-3xl border-2 border-primary/60 bg-card p-6 shadow-lg sm:p-8 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-foreground">
                    Studio Soạn thảo Bài giảng & Nạp Học liệu AI
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Dữ liệu bạn nạp tại đây sẽ hiển thị trực tiếp cho học viên và làm tri thức cho Trợ lý Gia sư AI.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddForm(false)}
                className="text-muted-foreground"
              >
                Đóng
              </Button>
            </div>

            <form onSubmit={handleCreateLesson} className="space-y-5">
              {/* 1. Tiêu đề & Thời lượng */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="manage-lesson-title">
                    Tiêu đề bài học <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="manage-lesson-title"
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ví dụ: Bài 4: Tích hợp Vector Database và RAG Pipeline"
                    className="font-semibold"
                  />
                  <Label htmlFor="manage-lesson-file" className="mt-3 block">
                    Upload học liệu để AI Tutor xử lý
                  </Label>
                  <Input
                    id="manage-lesson-file"
                    type="file"
                    accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setDocumentFiles((prev) => ({ ...prev, new: file }));
                      }
                    }}
                    className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Tài liệu sẽ được upload và xử lý RAG sau khi bài học được tạo.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="manage-lesson-duration">Thời lượng ước tính (phút)</Label>
                  <Input
                    id="manage-lesson-duration"
                    type="number"
                    min={1}
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                    className="font-semibold"
                  />
                </div>
              </div>

              {/* 2. Khối Video YouTube với Live Preview */}
                <div className="rounded-2xl border border-border bg-muted/50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="manage-lesson-video" className="flex items-center gap-1.5">
                    <Video className="h-4 w-4 text-rose-600" />
                    Đường dẫn Video YouTube bài giảng
                  </Label>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Hỗ trợ link youtube.com/watch?v=... hoặc youtu.be/...
                  </span>
                </div>

                <Input
                  id="manage-lesson-video"
                  type="url"
                  value={newVideoUrl}
                  onChange={(e) => setNewVideoUrl(e.target.value)}
                  placeholder="Dán đường dẫn video YouTube (ví dụ: https://www.youtube.com/watch?v=...)"
                  className="font-mono text-xs"
                />

                {/* Trình phát Video Preview thu nhỏ */}
                {embedUrl && (
                  <div className="pt-2">
                    <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                      <Eye className="w-3.5 h-3.5 text-indigo-600" /> Xem trước Video sẽ phát cho sinh viên:
                    </p>
                    <div className="aspect-video w-full max-w-md overflow-hidden rounded-xl border-border shadow-sm bg-black">
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
                <div className="space-y-1.5">
                  <Label htmlFor="manage-lesson-resources" className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    Tài liệu Slide bài giảng (PDF / DOCX / PPTX)
                  </Label>
                  <Input
                    id="manage-lesson-resources"
                    type="text"
                    value={newResourcesUrl}
                    onChange={(e) => setNewResourcesUrl(e.target.value)}
                    placeholder="Tên file hoặc link tài liệu (Ví dụ: Slide_BaiGiang.pdf)"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] font-medium text-emerald-600">
                    Slide này sẽ hiển thị ở tab &ldquo;Tài liệu Slide&rdquo; và được nạp vào pgvector cho AI Tutor.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="manage-lesson-transcript">Nội dung Transcript có mốc thời gian</Label>
                  <Textarea
                    id="manage-lesson-transcript"
                    rows={4}
                    value={newTranscript}
                    onChange={(e) => setNewTranscript(e.target.value)}
                    placeholder={
                      '[00:00 - 05:00] Giới thiệu mục tiêu bài học\n[05:01 - 20:00] Trình bày lý thuyết trọng tâm\n[20:01 - 40:00] Hướng dẫn thực hành chi tiết'
                    }
                    className="font-mono text-xs leading-relaxed"
                  />
                </div>
              </div>

              {/* 4. Khối AI Tự Động Sinh Quiz & Teacher Review */}
              <div className="space-y-4 rounded-2xl border border-primary/30 bg-gradient-to-r from-purple-500/10 via-primary/5 to-transparent p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-1.5 text-xs font-bold text-primary sm:text-sm">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      AI Quiz Generator & Kiểm duyệt Câu hỏi (Teacher Studio)
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      AI sẽ tự động đọc nội dung bài học và sinh câu hỏi trắc nghiệm chuẩn Bloom. Bạn có thể duyệt và chỉnh sửa trực tiếp.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={String(numQuizQuestions)}
                      onValueChange={(value) => setNumQuizQuestions(parseInt(value, 10))}
                    >
                      <SelectTrigger className="h-9 w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 câu hỏi</SelectItem>
                        <SelectItem value="5">5 câu hỏi</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      type="button"
                      variant="purple"
                      onClick={handleAiGenerateQuiz}
                      disabled={isGeneratingQuiz}
                    >
                      <Sparkles className={cn(isGeneratingQuiz && 'animate-spin')} />
                      {isGeneratingQuiz ? 'AI đang sinh đề...' : 'AI Sinh Bộ Đề Ôn Tập'}
                    </Button>
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
                        className="space-y-3 rounded-xl border border-border bg-card p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <Badge variant="secondary" className="mt-0.5 shrink-0">
                            Câu #{q.question_number}
                          </Badge>
                          <Input
                            type="text"
                            value={q.question_text}
                            onChange={(e) => handleUpdateQuestionText(qIdx, e.target.value)}
                            aria-label={`Nội dung câu hỏi ${q.question_number}`}
                            className="h-8 flex-1 border-0 border-b border-dashed border-border/60 px-0 text-xs font-bold shadow-none focus-visible:border-primary focus-visible:ring-0"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleRemoveQuestion(qIdx)}
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            title="Xóa câu này"
                          >
                            <Trash2 />
                          </Button>
                        </div>

                        {/* 4 Lựa chọn A, B, C, D */}
                        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                          {q.options.map((opt) => {
                            const isCorrect = q.correct_option === opt.key;
                            return (
                              <div
                                key={opt.key}
                                onClick={() => handleChangeCorrectOption(qIdx, opt.key)}
                                className={cn(
                                  'flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 transition',
                                  isCorrect
                                    ? 'border-emerald-500/40 bg-emerald-500/10 font-bold text-emerald-950'
                                    : 'border-border bg-muted/50 text-foreground/80 hover:border-ring/40',
                                )}
                              >
                                <span
                                  className={cn(
                                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-black',
                                    isCorrect
                                      ? 'bg-emerald-600 text-white'
                                      : 'border-border bg-card text-muted-foreground',
                                  )}
                                >
                                  {opt.key}
                                </span>
                                <Input
                                  type="text"
                                  value={opt.text}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => handleUpdateOptionText(qIdx, opt.key, e.target.value)}
                                  aria-label={`Đáp án ${opt.key}`}
                                  className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                                />
                                {isCorrect && (
                                  <Badge className="shrink-0 bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">
                                    Đúng
                                  </Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="space-y-1">
                          <Label
                            htmlFor={`manage-quiz-explanation-${qIdx}`}
                            className="text-[11px] text-muted-foreground"
                          >
                            Giải thích đáp án (bắt buộc)
                          </Label>
                          <Textarea
                            id={`manage-quiz-explanation-${qIdx}`}
                            rows={2}
                            value={q.explanation}
                            onChange={(e) => handleUpdateExplanation(qIdx, e.target.value)}
                            placeholder="Vì sao đáp án này đúng?"
                            className="text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 border-t border-border pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  Hủy
                </Button>
                <Button type="submit" disabled={isSubmitting || !newTitle.trim()}>
                  <Save />
                  {isSubmitting ? 'Đang lưu bài học & Bộ Quiz...' : 'Lưu bài học & Xuất bản'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Danh sách bài học hiện tại */}
        <div className="space-y-4 rounded-3xl border border-border/90 bg-card p-6 shadow-sm sm:p-8">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-foreground">
              Danh sách bài giảng khóa học ({lessons.length} bài)
            </h2>
            <span className="text-xs text-muted-foreground">Đồng bộ 100% với Focus Player của Sinh viên</span>
          </div>

          <div className="space-y-3">
            {lessons.map((lesson, idx) => (
              <div
                key={lesson.id}
              className="flex flex-col justify-between rounded-2xl border border-border/80 bg-muted/40 p-4 transition-colors hover:border-ring/40 gap-3 sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                    {idx + 1}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold leading-snug text-foreground sm:text-sm">
                      {lesson.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground/70" />
                        {lesson.durationText ||
                          (lesson.duration ? `${Math.round(lesson.duration / 60)} phút` : 'Chưa cập nhật')}
                      </span>

                      {lesson.video_url && (
                        <Badge variant="destructive" className="rounded-md px-2 py-0.5 text-[10px] font-semibold">
                          <Video className="w-3 h-3" />
                          Video YouTube HD
                        </Badge>
                      )}

                      {lesson.resources_url && (
                        <Badge variant="info" className="rounded-md px-2 py-0.5 text-[10px] font-medium">
                          <FileText className="w-3 h-3" />
                          {lesson.resources_url}
                        </Badge>
                      )}

                      {documentStates[String(lesson.id)] === 'ready' ? (
                        <Badge variant="success" className="rounded-md px-2 py-0.5 text-[10px] font-semibold">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> RAG đã xử lý
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="rounded-md px-2 py-0.5 text-[10px] font-medium">
                          <FileText className="w-3 h-3" /> Chưa có học liệu RAG
                        </Badge>
                      )}
                    </div>
                    {documentMessages[String(lesson.id)] && (
                      <p className={`mt-2 text-[11px] ${
                        documentStates[String(lesson.id)] === 'error' ? 'text-destructive' : 'text-muted-foreground'
                      }`}>
                        {documentMessages[String(lesson.id)]}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                  <Button variant="outline" size="sm" asChild>
                    <label className="cursor-pointer">
                      <Upload /> Tải PDF/DOCX/PPTX
                      <input
                        type="file"
                        accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadDocument(lesson.id, file);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/courses/${courseId}/learn?lessonId=${lesson.id}`}
                      title="Mở phòng học trực tuyến của Sinh viên"
                    >
                      <Eye /> Xem bài học
                    </Link>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDeleteLesson(lesson.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Xóa bài học"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Danh sách Bộ đề thi trắc nghiệm của khóa học ── */}
        <div className="space-y-4 rounded-3xl border border-border/90 bg-card p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="purple" className="rounded-md text-[10px] font-bold uppercase tracking-wider">
                  Khảo thí & Đánh giá
                </Badge>
                <span className="text-xs text-muted-foreground">Đồng bộ PostgreSQL</span>
              </div>
              <h2 className="mt-1 text-sm font-extrabold uppercase tracking-wider text-foreground">
                Bộ đề thi trắc nghiệm của khóa học ({courseQuizzes.length} đề thi)
              </h2>
              <p className="text-xs text-muted-foreground">
                Các đề thi này hiển thị tại tab &ldquo;Quiz ôn tập&rdquo; trong phòng học của sinh viên và tính điểm cấp Chứng chỉ.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/quiz/bank">
                  <Layers className="text-primary" /> Ngân hàng đề thi
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link href={`/quiz/generate?courseId=${courseId}`}>
                  <Sparkles className="text-amber-500" /> Tạo thêm đề với AI
                </Link>
              </Button>
            </div>
          </div>

          {courseQuizzes.length === 0 ? (
            <div className="space-y-2 rounded-2xl border border-dashed border-border bg-muted/40 p-8 text-center">
              <Layers className="w-8 h-8 text-muted-foreground/70 mx-auto" />
              <p className="text-xs font-bold text-foreground">Khóa học này chưa có bộ đề thi nào trong PostgreSQL</p>
              <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                Hãy sử dụng Trợ lý AI để tự động tạo bộ câu hỏi Bloom Taxonomy chuẩn giáo trình chỉ trong vài giây.
              </p>
              <Button size="sm" asChild className="mt-2">
                <Link href={`/quiz/generate?courseId=${courseId}`}>
                  <Sparkles className="text-amber-500" /> Tạo đề thi đầu tiên cho khóa này
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {courseQuizzes.map((quiz, qIdx) => (
                <div
                  key={quiz.id}
                className="flex flex-col justify-between rounded-2xl border border-border/80 bg-muted/40 p-4 transition-colors hover:border-ring/40 hover:shadow-xs gap-3 sm:flex-row sm:items-center"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-xs font-bold text-purple-600">
                      Q{qIdx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="info" className="rounded text-[10px] font-bold">
                          Đề #{quiz.id}
                        </Badge>
                        <h3 className="text-xs font-bold text-foreground sm:text-sm">
                          {quiz.title}
                        </h3>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {quiz.description || 'Đề thi trắc nghiệm đánh giá kiến thức bài học.'}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground/80">
                          {quiz.questions?.length || 0} câu hỏi
                        </span>
                        {quiz.lesson_id && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[220px]">
                              Bài học:{' '}
                              {lessons.find((lesson) => String(lesson.id) === String(quiz.lesson_id))?.title ||
                                `#${quiz.lesson_id}`}
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span>Tự động chấm điểm & cấp chứng chỉ</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={`/quiz/${quiz.id}?courseId=${courseId}`}
                        target="_blank"
                        title="Làm thử bài thi như học viên"
                      >
                        <ExternalLink /> Làm thử
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/quiz/bank" title="Quản lý trong Ngân hàng đề thi">
                        <Eye /> Xem chi tiết
                      </Link>
                    </Button>
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
