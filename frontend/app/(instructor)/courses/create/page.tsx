'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Check,
  Plus,
  Trash2,
  Video,
  Eye,
  ArrowRight,
  FileText,
  HelpCircle,
  Clock,
  BookOpen,
} from 'lucide-react';
import { coursesApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LessonDraft {
  id: string;
  title: string;
  duration: number; // minutes
  videoUrl: string;
  resourcesUrl: string;
  transcript: string;
  documentFile?: File;
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
  const [category, setCategory] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [level, setLevel] = useState('beginner');
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState('');
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
  const [newLessonDocumentFile, setNewLessonDocumentFile] = useState<File | undefined>();

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

  // Gợi ý danh mục lấy từ dữ liệu thật trong DB thay vì hardcode ở client.
  useEffect(() => {
    let isMounted = true;
    coursesApi
      .getCategories({ status: 'all' })
      .then((res) => {
        const names = (res.data?.data || [])
          .map((item: { name?: string }) => item?.name?.trim())
          .filter((name: string | undefined): name is string => Boolean(name));
        if (isMounted) setCategoryOptions(names);
      })
      .catch(() => {
        // Không chặn việc tạo khóa học nếu endpoint gợi ý tạm lỗi.
      });
    return () => {
      isMounted = false;
    };
  }, []);

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
      documentFile: newLessonDocumentFile,
    };

    setLessons([...lessons, newLesson]);
    setNewLessonTitle('');
    setNewLessonVideoUrl('');
    setNewLessonDuration('45');
    setNewLessonResourcesUrl('');
    setNewLessonTranscript('');
    setNewLessonDocumentFile(undefined);
    setShowAddLessonForm(false);
    setActiveLessonIndex(lessons.length);
  };

  const handleRemoveLesson = (idx: number) => {
    const updated = lessons.filter((_, i) => i !== idx);
    setLessons(updated);
    if (activeLessonIndex >= updated.length) {
      setActiveLessonIndex(Math.max(0, updated.length - 1));
    }

    // Đồng bộ lại bộ đề: bỏ đề của bài bị xóa và dời index các bài phía sau
    setQuizzes((prev) =>
      prev
        .filter((q) => q.lessonIndex !== idx)
        .map((q) => (q.lessonIndex > idx ? { ...q, lessonIndex: q.lessonIndex - 1 } : q)),
    );
    setSelectedLessonForQuiz((prev) => Math.min(prev, Math.max(0, updated.length - 1)));
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
        targetLesson.transcript ? targetLesson.transcript.slice(0, 30000) : '',
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
        const mappedQuestions: QuizQuestionDraft[] = (data.questions || []).map((q: any, idx: number) => {
          const rawOptions: any[] = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
          const originalKeys = rawOptions.map((opt, optIdx) =>
            typeof opt === 'object' && opt?.key ? String(opt.key).toUpperCase() : String.fromCharCode(65 + optIdx),
          );
          const rawCorrect = String(q.correct_option || q.correct_answer || 'A').toUpperCase();
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
            question_text: q.question_text || q.question || `Câu hỏi ${idx + 1}: ${targetLesson.title}`,
            options: mappedOptions,
            correct_option: String.fromCharCode(65 + (correctIdx >= 0 ? correctIdx : 0)),
            explanation: String(q.explanation || '').trim(),
          };
        });

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

  const handleUpdateExplanation = (quizIdx: number, qIdx: number, text: string) => {
    setQuizzes((prev) => {
      const updated = [...prev];
      updated[quizIdx].questions[qIdx].explanation = text;
      return updated;
    });
  };

  const handleRemoveQuiz = (quizIdx: number) => {
    setQuizzes((prev) => prev.filter((_, i) => i !== quizIdx));
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

  // Chuyển bài học đang soạn trong form thành bản nháp để không bị mất khi lưu khóa học
  const buildPendingLesson = (): LessonDraft | null => {
    if (!showAddLessonForm || !newLessonTitle.trim()) return null;
    return {
      id: `lesson-${Date.now()}`,
      title: newLessonTitle.trim(),
      duration: parseInt(newLessonDuration, 10) || 45,
      videoUrl: newLessonVideoUrl.trim(),
      resourcesUrl: newLessonResourcesUrl.trim(),
      transcript: newLessonTranscript.trim(),
      documentFile: newLessonDocumentFile,
    };
  };

  // Kiểm tra dữ liệu đề trắc nghiệm trước khi ghi để tránh tạo khóa học dở dang
  const validateQuizDrafts = (): string | null => {
    for (const quiz of quizzes) {
      for (let i = 0; i < quiz.questions.length; i++) {
        const q = quiz.questions[i];
        const label = `Câu ${i + 1} của "${quiz.title}"`;
        if (!q.question_text.trim()) return `${label} chưa có nội dung câu hỏi.`;
        if (q.options.length !== 4) return `${label} phải có đúng 4 đáp án A, B, C, D.`;
        if (q.options.some((o) => !o.text.trim())) return `${label} còn đáp án trống.`;
        if (!q.explanation.trim()) return `${label} chưa có giải thích đáp án.`;
      }
    }
    return null;
  };

  // ── HOÀN TẤT VÀ LƯU TOÀN BỘ VÀO CƠ SỞ DỮ LIỆU POSTGRESQL ──
  const handleMasterSubmit = async () => {
    if (isSubmitting) return;

    if (!title.trim()) {
      setActiveStep(1);
      setErrorMsg('Vui lòng nhập tên khóa học ở Bước 1.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (!isFree && (!price.trim() || Number(price) <= 0)) {
      setActiveStep(1);
      setErrorMsg('Vui lòng nhập học phí hợp lệ (lớn hơn 0) hoặc chọn Miễn phí.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const pendingLesson = buildPendingLesson();
    const lessonsToSave = pendingLesson ? [...lessons, pendingLesson] : lessons;

    const quizError = validateQuizDrafts();
    if (quizError) {
      setActiveStep(3);
      setErrorMsg(quizError);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (lessonsToSave.length === 0) {
      setActiveStep(2);
      setErrorMsg(
        showAddLessonForm
          ? 'Bài học đang soạn chưa có tiêu đề. Vui lòng nhập tiêu đề rồi bấm "Lưu bài học".'
          : 'Vui lòng thêm ít nhất một bài học ở Bước 2 trước khi lưu.',
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (pendingLesson) {
      setLessons(lessonsToSave);
      setShowAddLessonForm(false);
    }

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('Đang khởi tạo khóa học và đồng bộ vào cơ sở dữ liệu PostgreSQL...');

    let createdCourseId: number | null = null;

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // 1. Lưu Khóa học (Course)
      const descriptionParts = [
        description.trim() || 'Khóa học đào tạo trực tuyến chuẩn chất lượng tích hợp Gia sư AI 24/7.',
      ];
      if (outcomes.length > 0) {
        descriptionParts.push('\n\n### Mục tiêu và Chuẩn đầu ra:', ...outcomes.map((o) => `- ${o}`));
      }
      if (prerequisites.length > 0) {
        descriptionParts.push('\n\n### Yêu cầu tiên quyết:', ...prerequisites.map((p) => `- ${p}`));
      }
      const formattedDescription = descriptionParts.join('\n');

      const coursePayload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        description: formattedDescription,
        category: category.trim(),
        level,
        price: isFree ? 0 : Number(price) || 0,
        thumbnail: thumbnail.trim(),
        status: statusVal,
      };

      const courseRes = await coursesApi.createCourse(coursePayload);
      const newCourseId = courseRes.data?.data?.id || courseRes.data?.id;

      if (!newCourseId) {
        throw new Error('Không nhận được mã ID khóa học từ máy chủ');
      }
      createdCourseId = newCourseId;

      // 2. Lưu danh sách Bài học (Lessons) kèm Video & Slide
      const createdLessonIds: number[] = [];
      for (let i = 0; i < lessonsToSave.length; i++) {
        const les = lessonsToSave[i];
        const lessonResponse = await fetch(`${apiUrl}/api/v1/courses/${newCourseId}/lessons`, {
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
        const lessonData = await lessonResponse.json().catch(() => null);
        if (!lessonResponse.ok) {
          throw new Error(lessonData?.detail || `Không thể tạo bài học "${les.title}"`);
        }
        const lessonId = lessonData?.id || lessonData?.data?.id;
        if (lessonId) {
          createdLessonIds[i] = Number(lessonId);
        }
        if (les.documentFile && lessonId) {
          const formData = new FormData();
          formData.append('file', les.documentFile);
          const uploadResponse = await fetch(
            `${apiUrl}/api/v1/courses/${newCourseId}/lessons/${lessonId}/documents/upload`,
            {
              method: 'POST',
              headers: token ? { Authorization: 'Bearer ' + token } : {},
              body: formData,
            },
          );
          const uploadData = await uploadResponse.json().catch(() => null);
          if (!uploadResponse.ok) {
            throw new Error(
              uploadData?.detail || `Không thể import tài liệu cho bài học "${les.title}"`,
            );
          }
        }
      }

      // 3. Lưu danh sách Quizzes đã được Giảng viên duyệt
      for (const quiz of quizzes) {
        if (quiz.questions && quiz.questions.length > 0) {
          const quizResponse = await fetch(`${apiUrl}/api/v1/courses/${newCourseId}/quizzes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              lesson_id: createdLessonIds[quiz.lessonIndex] ?? null,
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

          if (!quizResponse.ok) {
            const quizErrorData = await quizResponse.json().catch(() => null);
            const detail =
              typeof quizErrorData?.detail === 'string'
                ? quizErrorData.detail
                : quizErrorData?.detail?.[0]?.msg || `Không thể lưu bộ đề "${quiz.title}"`;
            throw new Error(detail);
          }
        }
      }

      setSuccessMsg('Lưu khóa học, toàn bộ bài giảng và các bộ đề trắc nghiệm AI thành công vào PostgreSQL!');
      setTimeout(() => {
        router.push(`/courses/${newCourseId}/manage`);
      }, 1200);
    } catch (err: any) {
      console.error('Lỗi khi lưu khóa học:', err);
      const rawDetail = err.response?.data?.detail;
      const detail =
        typeof rawDetail === 'string'
          ? rawDetail
          : Array.isArray(rawDetail)
          ? rawDetail.map((d: any) => d?.msg || '').filter(Boolean).join('; ')
          : err.message || 'Vui lòng thử lại.';
      setSuccessMsg('');
      if (createdCourseId) {
        setErrorMsg(
          `Khóa học #${createdCourseId} đã được tạo nhưng lưu bài giảng/đề thi gặp lỗi: ${detail}. Vào trang Quản lý khóa học để kiểm tra và bổ sung phần còn thiếu.`,
        );
      } else {
        setErrorMsg('Lỗi lưu dữ liệu: ' + detail);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-xs font-semibold text-slate-500">
        Đang xác thực quyền Giảng viên...
      </div>
    );
  }

  const currentLessonPreview = lessons[activeLessonIndex] || lessons[0];
  const activeYoutubeEmbed = currentLessonPreview ? getYouTubeEmbedUrl(currentLessonPreview.videoUrl) : '';

  return (
    <div className="pb-28 font-sans text-slate-800">
      {/* ── Toolbar: Chế độ hiển thị & Lưu khóa học ── */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-extrabold tracking-tight text-foreground">
              Tạo Khóa học & Soạn Đề thi AI
            </h1>
            <Badge variant="info">Studio</Badge>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label="Chế độ hiển thị">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={viewMode === 'wizard'}
                onClick={() => setViewMode('wizard')}
                className={cn(
                  'h-7 rounded-md px-2.5',
                  viewMode === 'wizard' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground',
                )}
              >
                Từng bước
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={viewMode === 'all-in-one'}
                onClick={() => setViewMode('all-in-one')}
                className={cn(
                  'h-7 rounded-md px-2.5',
                  viewMode === 'all-in-one' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground',
                )}
              >
                Tất cả
              </Button>
            </div>

            <Button
              size="sm"
              onClick={handleMasterSubmit}
              disabled={isSubmitting || !title.trim()}
              variant="success"
              className="shrink-0"
            >
              <CheckCircle2 />
              {isSubmitting ? 'Đang lưu...' : 'Lưu khóa học'}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        {/* ── BĂNG BANNER TIẾN TRÌNH 3 BƯỚC (WIZARD PIPELINE HERO) ── */}
        <Card className="mb-6 rounded-3xl">
          <CardContent className="p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {[
                {
                  step: 1,
                  title: 'Bước 1: Thông tin Khóa học',
                  desc: 'Tên, mô tả, danh mục, cấp độ & ảnh bìa',
                },
                {
                  step: 2,
                  title: 'Bước 2: Video & Slide Bài giảng',
                  desc: 'Nhúng YouTube live preview, slide PDF & transcript',
                },
                {
                  step: 3,
                  title: 'Bước 3: AI Quiz Studio',
                  desc: 'AI sinh đề Bloom, Giảng viên duyệt & sửa đáp án',
                },
              ].map((s) => {
                const isCurrent = activeStep === s.step;
                const isPast = activeStep > s.step;
                return (
                  <Button
                    key={s.step}
                    type="button"
                    variant="outline"
                    aria-current={isCurrent ? 'step' : undefined}
                    onClick={() => {
                      setActiveStep(s.step as any);
                      if (viewMode === 'all-in-one') {
                        const el = document.getElementById(`section-step-${s.step}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    className={cn(
                      'h-auto items-center justify-start gap-2.5 whitespace-normal rounded-xl p-3 text-left',
                      isCurrent && 'border-primary bg-primary/5 ring-2 ring-primary/20',
                      isPast && 'border-emerald-300 bg-emerald-50/40',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold',
                        isCurrent
                          ? 'bg-primary text-primary-foreground'
                          : isPast
                          ? 'bg-emerald-600 text-white'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {isPast ? <Check /> : s.step}
                    </div>
                    <div className="min-w-0">
                      <p className={cn('text-[11px] font-bold', isCurrent ? 'text-primary' : 'text-foreground')}>
                        {s.title}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-[10px] font-medium text-muted-foreground">{s.desc}</p>
                    </div>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Thông báo Alert */}
        {errorMsg && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          {/* ================= CỘT TRÁI: NỘI DUNG 3 BƯỚC (8 COLS) ================= */}
          <div className="space-y-8 lg:col-span-8">
            {/* ══════════════════════════════════════════════════════════════════════
                BƯỚC 1: THÔNG TIN KHÓA HỌC
               ══════════════════════════════════════════════════════════════════════ */}
            {(viewMode === 'all-in-one' || activeStep === 1) && (
              <section id="section-step-1" className="space-y-6">
                <Card className="rounded-3xl">
                  <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 font-bold text-primary">
                        1
                      </div>
                      <div>
                        <CardTitle>Thông tin Định danh Khóa học</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Tiêu đề, mô tả và chuẩn đầu ra sư phạm theo khung đánh giá
                        </p>
                      </div>
                    </div>
                    <Badge variant="info" className="px-3 py-1 text-[11px]">
                      <Sparkles /> AI Engine Ready
                    </Badge>
                  </CardHeader>

                  <CardContent className="space-y-5 pt-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="course-title">
                        Tên khóa học <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="course-title"
                        required
                        value={title}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        placeholder="Ví dụ: Lập trình Python & Phát triển Ứng dụng AI Thông minh"
                        className="font-semibold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="course-slug">Đường dẫn tĩnh (Slug)</Label>
                      <Input
                        id="course-slug"
                        value={slug}
                        readOnly
                        placeholder="Tự động sinh từ tên khóa học..."
                        className="cursor-default bg-muted font-mono text-xs text-muted-foreground"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Slug được hệ thống sinh tự động từ tên khóa học khi lưu.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="course-description">Mô tả tổng quan học phần</Label>
                      <Textarea
                        id="course-description"
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Nhập mô tả mục tiêu tổng quát, chuẩn đầu ra và nội dung đào tạo..."
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="course-category">Danh mục</Label>
                        <Input
                          id="course-category"
                          list="category-suggestions"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          placeholder="Chọn hoặc nhập danh mục mới..."
                          className="font-semibold"
                        />
                        <datalist id="category-suggestions">
                          {categoryOptions.map((c) => (
                            <option key={c} value={c} />
                          ))}
                        </datalist>
                        <p className="text-[11px] text-muted-foreground">Có thể tự nhập danh mục riêng.</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="course-level">Cấp độ</Label>
                        <Select value={level} onValueChange={setLevel}>
                          <SelectTrigger id="course-level">
                            <SelectValue placeholder="Chọn cấp độ" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="beginner">Cơ bản (Beginner)</SelectItem>
                            <SelectItem value="intermediate">Trung cấp (Intermediate)</SelectItem>
                            <SelectItem value="advanced">Nâng cao (Advanced)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Chính sách Học phí</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={isFree ? 'success' : 'outline'}
                            aria-pressed={isFree}
                            onClick={() => {
                              setIsFree(true);
                              setPrice('');
                            }}
                            className="flex-1"
                          >
                            Miễn phí
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={!isFree ? 'default' : 'outline'}
                            aria-pressed={!isFree}
                            onClick={() => setIsFree(false)}
                            className="flex-1"
                          >
                            Có phí
                          </Button>
                        </div>

                        {!isFree && (
                          <div className="space-y-1.5 pt-1.5">
                            <Label htmlFor="course-price" className="text-muted-foreground">
                              Học phí (VNĐ)
                            </Label>
                            <Input
                              id="course-price"
                              type="text"
                              inputMode="numeric"
                              value={price}
                              onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, '').slice(0, 12))}
                              placeholder="Nhập học phí, ví dụ: 499000"
                              className="font-semibold"
                            />
                            <p className="text-[11px] text-muted-foreground">
                              {price && Number(price) > 0
                                ? `${Number(price).toLocaleString('vi-VN')} đ`
                                : 'Bạn tự quyết định mức học phí.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
                      <div>
                        <p className="text-xs font-bold text-foreground">Trạng thái xuất bản</p>
                        <p className="text-[11px] text-muted-foreground">
                          {statusVal === 'published'
                            ? 'Học viên có thể thấy khóa học ngay sau khi lưu.'
                            : 'Khóa học được lưu nháp, chỉ bạn nhìn thấy.'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={statusVal === 'published' ? 'success' : 'outline'}
                          aria-pressed={statusVal === 'published'}
                          onClick={() => setStatusVal('published')}
                        >
                          Xuất bản
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={statusVal === 'draft' ? 'default' : 'outline'}
                          aria-pressed={statusVal === 'draft'}
                          onClick={() => setStatusVal('draft')}
                        >
                          Lưu nháp
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Chọn Ảnh Thumbnail */}
                <Card className="rounded-3xl">
                  <CardContent className="space-y-4 p-6 sm:p-7">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Ảnh đại diện Khóa học (Thumbnail)
                      </h3>
                      <span className="text-[11px] text-muted-foreground">Chọn mẫu hoặc dán URL tùy ý</span>
                    </div>

                    <Input
                      type="url"
                      value={thumbnail}
                      onChange={(e) => setThumbnail(e.target.value)}
                      placeholder="Dán liên kết ảnh đại diện (https://...)"
                      className="bg-muted font-mono text-xs"
                    />

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {PRESET_THUMBNAILS.map((preset) => (
                        <Button
                          key={preset.name}
                          type="button"
                          variant="outline"
                          onClick={() => setThumbnail(preset.url)}
                          className={cn(
                            'h-auto w-full flex-col items-stretch gap-0 whitespace-normal rounded-xl p-2 text-left font-normal',
                            thumbnail === preset.url && 'border-primary bg-primary/5 ring-2 ring-primary/20',
                          )}
                        >
                          <div className="relative mb-1.5 aspect-video w-full overflow-hidden rounded-lg bg-muted">
                            <img src={preset.url} alt={preset.name} className="h-full w-full object-cover" />
                            {thumbnail === preset.url && (
                              <div className="absolute right-1.5 top-1.5 rounded-full bg-primary p-1 text-primary-foreground">
                                <Check className="h-3 w-3" />
                              </div>
                            )}
                          </div>
                          <p className="truncate text-[11px] font-bold text-foreground">{preset.name}</p>
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Chuẩn đầu ra & Tiên quyết */}
                <Card className="rounded-3xl">
                  <CardContent className="space-y-6 p-6 sm:p-7">
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">
                        Sinh viên sẽ học được gì? (Learning Outcomes)
                      </h3>
                      <div className="space-y-2">
                        {outcomes.length === 0 ? (
                          <p className="py-1 text-xs italic text-muted-foreground">
                            Chưa có chuẩn đầu ra nào. Hãy nhập nội dung và bấm &quot;Thêm&quot; bên dưới.
                          </p>
                        ) : (
                          outcomes.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 p-2 text-xs"
                            >
                              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              <span className="flex-1 font-medium text-foreground">{item}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleRemoveOutcome(idx)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Input
                          value={newOutcome}
                          onChange={(e) => setNewOutcome(e.target.value)}
                          placeholder="Thêm chuẩn đầu ra mới..."
                          className="h-9 flex-1"
                        />
                        <Button type="button" variant="secondary" onClick={handleAddOutcome}>
                          Thêm
                        </Button>
                      </div>
                    </div>

                    <div className="border-t border-border pt-4">
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">
                        Yêu cầu tiên quyết (Prerequisites)
                      </h3>
                      <div className="space-y-2">
                        {prerequisites.length === 0 ? (
                          <p className="py-1 text-xs italic text-muted-foreground">
                            Chưa có yêu cầu tiên quyết nào. Hãy nhập nội dung và bấm &quot;Thêm&quot; bên dưới.
                          </p>
                        ) : (
                          prerequisites.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 p-2 text-xs"
                            >
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                              <span className="flex-1 font-medium text-foreground">{item}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleRemovePrereq(idx)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Input
                          value={newPrereq}
                          onChange={(e) => setNewPrereq(e.target.value)}
                          placeholder="Thêm yêu cầu tiên quyết..."
                          className="h-9 flex-1"
                        />
                        <Button type="button" variant="secondary" onClick={handleAddPrereq}>
                          Thêm
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {viewMode === 'wizard' && (
                  <div className="flex justify-end pt-2">
                    <Button type="button" onClick={() => setActiveStep(2)}>
                      <span>Bước 2: Video & Slide</span>
                      <ArrowRight />
                    </Button>
                  </div>
                )}
              </section>
            )}

            {/* ══════════════════════════════════════════════════════════════════════
                BƯỚC 2: QUẢN LÝ BÀI GIẢNG & IMPORT VIDEO/SLIDE
               ══════════════════════════════════════════════════════════════════════ */}
            {(viewMode === 'all-in-one' || activeStep === 2) && (
              <section id="section-step-2" className="space-y-6">
                <Card className="rounded-3xl">
                  <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 font-bold text-emerald-600">
                        2
                      </div>
                      <div>
                        <CardTitle>Quản lý Bài giảng & Import Video/Slide</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Dán link YouTube (xem trước Focus Player), nạp tài liệu Slide PDF cho pgvector và đồng bộ
                          Transcript
                        </p>
                      </div>
                    </div>

                    <Button type="button" variant="success" size="sm" onClick={() => setShowAddLessonForm(true)}>
                      <Plus /> Thêm Bài học mới
                    </Button>
                  </CardHeader>

                  <CardContent className="space-y-5 pt-5">
                    {/* Form thêm bài học mới */}
                    {showAddLessonForm && (
                      <form
                        onSubmit={handleAddNewLesson}
                        className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-900">
                            Soạn bài học #{lessons.length + 1}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowAddLessonForm(false)}
                            className="text-muted-foreground"
                          >
                            Hủy
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                          <div className="space-y-1.5 sm:col-span-3">
                            <Label htmlFor="lesson-title">
                              Tiêu đề bài học <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="lesson-title"
                              required
                              value={newLessonTitle}
                              onChange={(e) => setNewLessonTitle(e.target.value)}
                              placeholder="Ví dụ: Bài 3: Xây dựng RAG Pipeline với LangChain và pgvector"
                              className="font-semibold"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="lesson-duration">Thời lượng (phút)</Label>
                            <Input
                              id="lesson-duration"
                              type="number"
                              value={newLessonDuration}
                              onChange={(e) => setNewLessonDuration(e.target.value)}
                              className="font-semibold"
                            />
                          </div>
                        </div>

                        {/* Video URL YouTube / MP4 */}
                        <div className="space-y-1.5">
                          <Label htmlFor="lesson-video" className="flex items-center gap-1.5">
                            <Video className="h-3.5 w-3.5 text-primary" />
                            Liên kết Video (YouTube URL hoặc MP4)
                          </Label>
                          <Input
                            id="lesson-video"
                            type="url"
                            value={newLessonVideoUrl}
                            onChange={(e) => setNewLessonVideoUrl(e.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="font-mono text-xs"
                          />
                        </div>

                        {/* Tài liệu Slide đính kèm */}
                        <div className="space-y-1.5">
                          <Label htmlFor="lesson-resources" className="flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-emerald-600" />
                            Tài liệu Slide bài giảng (PDF / PPTX)
                          </Label>
                          <Input
                            id="lesson-resources"
                            value={newLessonResourcesUrl}
                            onChange={(e) => setNewLessonResourcesUrl(e.target.value)}
                            placeholder="Slide_03_LangChain_pgvector_Architecture.pdf"
                            className="font-mono text-xs"
                          />
                          <Input
                            type="file"
                            accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                            onChange={(e) => setNewLessonDocumentFile(e.target.files?.[0])}
                            className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-emerald-800"
                          />
                          {newLessonDocumentFile && (
                            <p className="text-[11px] font-medium text-emerald-700">
                              Đã chọn: {newLessonDocumentFile.name}
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            File sẽ được upload và xử lý sau khi khóa học được tạo. Hỗ trợ PDF, DOCX và PPTX.
                          </p>
                        </div>

                        {/* Transcript */}
                        <div className="space-y-1.5">
                          <Label htmlFor="lesson-transcript">Transcript nội dung bài giảng</Label>
                          <Textarea
                            id="lesson-transcript"
                            rows={3}
                            value={newLessonTranscript}
                            onChange={(e) => setNewLessonTranscript(e.target.value)}
                            placeholder="[00:00 - 05:00] Khởi động nội dung..."
                            className="font-mono text-xs"
                          />
                        </div>

                        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-[11px] text-muted-foreground">
                            Bấm &quot;Lưu bài học&quot; để đưa bài vào danh sách. Nếu bấm Lưu khóa học, bài đang
                            soạn sẽ được tự động thêm.
                          </p>
                          <Button type="submit" variant="success" size="sm" disabled={!newLessonTitle.trim()}>
                            Lưu bài học
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Danh sách các bài giảng hiện tại */}
                    <div className="space-y-3">
                      {lessons.length === 0 ? (
                        <div className="space-y-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 text-center">
                          <Video className="mx-auto h-8 w-8 text-muted-foreground/50" />
                          <p className="text-xs font-bold text-foreground">Chưa có bài học nào trong khóa học này</p>
                          <p className="mx-auto max-w-sm text-[11px] text-muted-foreground">
                            Bấm nút &quot;+ Thêm Bài học mới&quot; ở trên để nhập tiêu đề, liên kết YouTube và tài liệu
                            slide cho bài học.
                          </p>
                        </div>
                      ) : (
                        lessons.map((les, idx) => (
                          <div
                            key={les.id}
                            className={cn(
                              'flex flex-col justify-between gap-3 rounded-2xl border p-4 transition sm:flex-row sm:items-center',
                              activeLessonIndex === idx
                                ? 'border-emerald-500 bg-emerald-50/30'
                                : 'border-border bg-card hover:border-primary/40',
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className={cn(
                                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold',
                                  activeLessonIndex === idx
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-muted text-muted-foreground',
                                )}
                              >
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <h4 className="truncate text-xs font-bold text-foreground sm:text-sm">{les.title}</h4>
                                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> {les.duration} phút
                                  </span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1 truncate font-medium text-primary">
                                    <Video className="h-3 w-3" />
                                    {les.videoUrl ? 'YouTube Video OK' : 'Chưa có video'}
                                  </span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1 truncate font-medium text-emerald-600">
                                    <FileText className="h-3 w-3" />
                                    {les.resourcesUrl || 'Chưa đính kèm slide'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setActiveLessonIndex(idx)}
                              >
                                <Eye /> Xem thử Player
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleRemoveLesson(idx)}
                                title="Xóa bài học"
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                {viewMode === 'wizard' && (
                  <div className="flex items-center justify-between pt-2">
                    <Button type="button" variant="outline" onClick={() => setActiveStep(1)}>
                      <ArrowLeft /> Quay lại
                    </Button>

                    <Button type="button" onClick={() => setActiveStep(3)}>
                      <span>Bước 3: AI Quiz</span>
                      <ArrowRight />
                    </Button>
                  </div>
                )}
              </section>
            )}

            {/* ══════════════════════════════════════════════════════════════════════
                BƯỚC 3: AI QUIZ STUDIO (SINH ĐỀ & KIỂM DUYỆT)
               ══════════════════════════════════════════════════════════════════════ */}
            {(viewMode === 'all-in-one' || activeStep === 3) && (
              <section id="section-step-3" className="space-y-6">
                <Card className="rounded-3xl">
                  <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 font-bold text-purple-600">
                        3
                      </div>
                      <div>
                        <CardTitle>AI Quiz Studio: Tự động Sinh Đề & Giảng viên Kiểm duyệt</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          AI đọc Slide & Transcript để tạo trắc nghiệm Bloom; Giảng viên toàn quyền đổi đáp án đúng và
                          sửa câu hỏi
                        </p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-5 pt-5">
                    {/* Thanh điều khiển sinh đề AI */}
                    <div className="space-y-3 rounded-2xl border border-purple-200/80 bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 p-4">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1 space-y-1.5">
                          <Label>Chọn bài học để AI sinh bộ đề:</Label>
                          {lessons.length === 0 ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                              Chưa có bài học nào. Hãy quay lại Bước 2 để thêm bài học trước.
                            </div>
                          ) : (
                            <Select
                              value={String(selectedLessonForQuiz)}
                              onValueChange={(v) => setSelectedLessonForQuiz(parseInt(v, 10))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Chọn bài học" />
                              </SelectTrigger>
                              <SelectContent>
                                {lessons.map((l, idx) => (
                                  <SelectItem key={l.id} value={String(idx)}>
                                    Bài {idx + 1}: {l.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>

                        <div className="w-full space-y-1.5 sm:w-32">
                          <Label>Số câu hỏi</Label>
                          <Select
                            value={String(numQuizQuestions)}
                            onValueChange={(v) => setNumQuizQuestions(parseInt(v, 10))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="3">3 câu</SelectItem>
                              <SelectItem value="4">4 câu</SelectItem>
                              <SelectItem value="5">5 câu</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="w-full space-y-1.5 sm:w-36">
                          <Label>Độ khó Bloom</Label>
                          <Select value={quizDifficulty} onValueChange={setQuizDifficulty}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Easy">Nhận biết (Easy)</SelectItem>
                              <SelectItem value="Medium">Thông hiểu (Medium)</SelectItem>
                              <SelectItem value="Hard">Vận dụng (Hard)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex flex-col justify-between gap-3 pt-1 sm:flex-row sm:items-center">
                        <span className="text-[11px] text-muted-foreground">
                          AI tham chiếu Slide bài học & Transcript để sinh câu hỏi trắc nghiệm 4 lựa chọn chuẩn kiến
                          thức.
                        </span>
                        <Button
                          type="button"
                          variant="purple"
                          onClick={handleAiGenerateQuizForLesson}
                          disabled={isGeneratingQuiz || lessons.length === 0}
                          className="shrink-0"
                        >
                          <Sparkles className={cn(isGeneratingQuiz && 'animate-spin')} />
                          {isGeneratingQuiz ? 'Đang phân tích...' : 'Sinh bộ đề AI'}
                        </Button>
                      </div>
                    </div>

                    {/* Danh sách các bộ Quiz đã sinh */}
                    {quizzes.length === 0 ? (
                      <div className="space-y-2 rounded-3xl border-2 border-dashed border-border p-8 text-center">
                        <HelpCircle className="mx-auto h-10 w-10 text-muted-foreground/50" />
                        <p className="text-xs font-bold text-foreground">Chưa có bộ đề trắc nghiệm nào</p>
                        <p className="mx-auto max-w-sm text-[11px] text-muted-foreground">
                          Bấm nút &quot;Yêu cầu AI Sinh Bộ Trắc Nghiệm&quot; ở trên để AI tạo câu hỏi từ slide bài
                          giảng.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {quizzes.map((quiz, quizIdx) => (
                          <div key={quizIdx} className="space-y-4 rounded-3xl border border-border bg-muted/40 p-5">
                            <div className="flex items-center justify-between border-b border-border pb-3">
                              <div>
                                <Badge variant="purple">Bộ đề trắc nghiệm AI</Badge>
                                <h3 className="mt-1 text-sm font-bold text-foreground">{quiz.title}</h3>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-muted-foreground">
                                  {quiz.questions.length} câu hỏi
                                </span>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleAddCustomQuestion(quizIdx)}
                                >
                                  <Plus /> Thêm câu hỏi
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleRemoveQuiz(quizIdx)}
                                  title="Xóa bộ đề"
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            </div>

                            {/* Danh sách từng câu hỏi */}
                            <div className="space-y-4">
                              {quiz.questions.map((q, qIdx) => (
                                <div
                                  key={q.question_number}
                                  className="space-y-3 rounded-2xl border border-border bg-card p-4"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-black text-primary">
                                      {q.question_number}
                                    </span>
                                    <Input
                                      value={q.question_text}
                                      onChange={(e) => handleUpdateQuestionText(quizIdx, qIdx, e.target.value)}
                                      className="h-9 flex-1 font-bold"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={() => handleRemoveQuestion(quizIdx, qIdx)}
                                      title="Xóa câu hỏi"
                                      className="text-muted-foreground hover:text-destructive"
                                    >
                                      <Trash2 />
                                    </Button>
                                  </div>

                                  {/* 4 Lựa chọn A, B, C, D */}
                                  <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                                    {q.options.map((opt) => (
                                      <div
                                        key={opt.key}
                                        className={cn(
                                          'flex items-center gap-2 rounded-xl border p-2 transition',
                                          q.correct_option === opt.key
                                            ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 ring-1 ring-emerald-400'
                                            : 'border-border bg-muted/40 text-foreground',
                                        )}
                                      >
                                        <Button
                                          type="button"
                                          variant={q.correct_option === opt.key ? 'success' : 'outline'}
                                          size="icon-sm"
                                          aria-pressed={q.correct_option === opt.key}
                                          onClick={() => handleChangeCorrectOption(quizIdx, qIdx, opt.key)}
                                          title="Bấm để đặt làm đáp án đúng"
                                          className="shrink-0 p-0"
                                        >
                                          {opt.key}
                                        </Button>
                                        <Input
                                          value={opt.text}
                                          onChange={(e) =>
                                            handleUpdateOptionText(quizIdx, qIdx, opt.key, e.target.value)
                                          }
                                          className="h-8 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
                                        />
                                      </div>
                                    ))}
                                  </div>

                                  {/* Giải thích sư phạm */}
                                  <div className="space-y-1.5">
                                    <Label
                                      htmlFor={`explanation-${quizIdx}-${qIdx}`}
                                      className="text-[11px] text-muted-foreground"
                                    >
                                      Giải thích đáp án
                                    </Label>
                                    <Textarea
                                      id={`explanation-${quizIdx}-${qIdx}`}
                                      rows={2}
                                      value={q.explanation}
                                      onChange={(e) => handleUpdateExplanation(quizIdx, qIdx, e.target.value)}
                                      placeholder="Giải thích vì sao đáp án đúng..."
                                      className="min-h-[56px] bg-muted/50 text-[11px]"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Nút Hoàn tất Master Submit */}
                <div className="flex items-center justify-between pt-2">
                  {viewMode === 'wizard' ? (
                    <Button type="button" variant="outline" onClick={() => setActiveStep(2)}>
                      <ArrowLeft /> Quay lại
                    </Button>
                  ) : (
                    <div />
                  )}

                  <Button
                    type="button"
                    onClick={handleMasterSubmit}
                    disabled={isSubmitting || !title.trim()}
                    variant="success"
                  >
                    <CheckCircle2 />
                    <span>{isSubmitting ? 'Đang lưu...' : 'Lưu khóa học'}</span>
                  </Button>
                </div>
              </section>
            )}
          </div>

          {/* ================= CỘT PHẢI: LIVE PREVIEW & VIDEO VIEWER (4 COLS) ================= */}
          <div className="space-y-6 lg:col-span-4 lg:sticky lg:top-28">
            {/* Live Video Preview Box */}
            <Card className="rounded-3xl">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-foreground">Trình phát thử Focus Player</span>
                  </div>
                  <Badge variant="success">{activeYoutubeEmbed ? 'YouTube Live' : 'Sẵn sàng'}</Badge>
                </div>

                {/* YouTube Player Preview */}
                <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                  {activeYoutubeEmbed ? (
                    <iframe
                      src={activeYoutubeEmbed}
                      title="Preview Video Player"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center space-y-2 p-4 text-center text-slate-500">
                      <Video className="h-8 w-8 text-slate-600" />
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
                    <Badge variant="info">
                      Bài {activeLessonIndex + 1} ({currentLessonPreview.duration} phút)
                    </Badge>
                    <p className="line-clamp-1 text-xs font-bold text-foreground">{currentLessonPreview.title}</p>
                    {currentLessonPreview.resourcesUrl && (
                      <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                        <FileText className="h-3 w-3 text-emerald-500" /> {currentLessonPreview.resourcesUrl}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Course Card Preview */}
            <Card className="rounded-3xl">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="text-xs font-bold text-foreground">Thẻ khóa học hiển thị</span>
                  <Badge variant="info">{statusVal === 'published' ? 'Công khai' : 'Bản nháp'}</Badge>
                </div>

                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-muted">
                    {thumbnail ? (
                      <img src={thumbnail} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-tr from-slate-100 to-indigo-50 p-4 text-center text-muted-foreground">
                        <BookOpen className="mb-1 h-8 w-8 text-muted-foreground/50" />
                        <span className="text-[11px] font-semibold">Chưa chọn ảnh thumbnail</span>
                      </div>
                    )}
                    <div className="absolute left-2.5 top-2.5">
                      <Badge variant="secondary">
                        {level === 'beginner' ? 'Cơ bản' : level === 'intermediate' ? 'Trung cấp' : 'Nâng cao'}
                      </Badge>
                    </div>
                    <div className="absolute right-2.5 top-2.5">
                      <Badge variant="default">
                        <Sparkles className="h-3 w-3" /> AI Tutor
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      {category || 'Chưa chọn danh mục'}
                    </p>
                    <h4 className="line-clamp-2 text-xs font-bold leading-snug text-foreground sm:text-sm">
                      {title || 'Tên khóa học sẽ hiển thị tại đây...'}
                    </h4>
                    <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                      <span className="font-extrabold text-foreground">
                        {isFree
                          ? 'Miễn phí'
                          : price && Number(price) > 0
                          ? `${Number(price).toLocaleString('vi-VN')} đ`
                          : 'Chưa nhập học phí'}
                      </span>
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {lessons.length} bài học • {quizzes.length} bộ đề
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bảo chứng AI Smart LMS */}
            <div className="space-y-3 rounded-3xl bg-gradient-to-br from-indigo-950 to-slate-900 p-5 text-white shadow-lg">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold">Cơ chế AI Studio Smart LMS</span>
              </div>
              <p className="text-[11px] leading-relaxed text-indigo-200/80">
                Tất cả slide bài giảng và transcript sẽ được tự động phân mảnh và nạp vào pgvector khi lưu. Bộ trắc
                nghiệm bám sát thang đo Bloom và do Giảng viên trực tiếp phê duyệt đáp án.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
