'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Wand2,
  Play,
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
  UploadCloud,
  Loader2,
} from 'lucide-react';
import { coursesApi, categoriesApi, educationLevelsApi, aiDiscoveryApi } from '@/lib/api';
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
import { PageSkeleton } from '@/components/ui/page-skeleton';

interface LessonDraft {
  id: string;
  title: string;
  duration: number; // minutes
  videoUrl: string;
  resourcesUrl: string;
  transcript: string;
  documentFiles?: File[];
  videoFile?: File;
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
    url: 'https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/python-ai.jpg',
  },
  {
    name: 'Backend & Lập trình Hệ thống',
    category: 'Backend',
    url: 'https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/fastapi-db.jpg',
  },
  {
    name: 'Frontend Web & React.js',
    category: 'Frontend',
    url: 'https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/nextjs-ui.jpg',
  },
  {
    name: 'Cơ sở Dữ liệu & Cloud DevOps',
    category: 'Cloud & DB',
    url: 'https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/cloud-devops.jpg',
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
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState('');
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [newOutcome, setNewOutcome] = useState('');
  const [prerequisites, setPrerequisites] = useState<string[]>([]);
  const [newPrereq, setNewPrereq] = useState('');

  // ── Multi-domain & Multi-level states (Master Spec Section III & IV) ──
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categoriesTree, setCategoriesTree] = useState<any[]>([]);
  const [educationLevelId, setEducationLevelId] = useState<number | null>(null);
  const [educationLevels, setEducationLevels] = useState<any[]>([]);
  const [gradeLabel, setGradeLabel] = useState('');
  const [proficiencyLevel, setProficiencyLevel] = useState('Trung cấp');
  const [targetAudience, setTargetAudience] = useState('Học viên');
  const [language, setLanguage] = useState('vi');

  // ── AI Course Builder Assistant State ──
  const [showAiBuilder, setShowAiBuilder] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiLevel, setAiLevel] = useState('Chuyên ngành (Năm 3 - 4)');
  const [aiDomain, setAiDomain] = useState('Khoa Công nghệ Thông tin');
  const [aiAudience, setAiAudience] = useState('Học viên');
  const [isAiBuilding, setIsAiBuilding] = useState(false);
  const [aiBlueprintResult, setAiBlueprintResult] = useState<any | null>(null);

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
  const [newLessonDocumentFiles, setNewLessonDocumentFiles] = useState<File[]>([]);
  const [newLessonVideoFile, setNewLessonVideoFile] = useState<File | undefined>();
  const [editingDraftLessonIndex, setEditingDraftLessonIndex] = useState<number | null>(null);
  const [processUploadsInBackground, setProcessUploadsInBackground] = useState(true);

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
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      if (p.get('mode') === 'ai') setShowAiBuilder(true);
    }
    categoriesApi.getTree().then((res) => {
      if (isMounted) setCategoriesTree(res.data?.data?.tree || []);
    }).catch(() => {});
    educationLevelsApi.getAll().then((res) => {
      if (isMounted) setEducationLevels(res.data?.data || []);
    }).catch(() => {});
    coursesApi
      .getCategories({ status: 'all' })
      .then((res) => {
        const names = (res.data?.data || [])
          .map((item: { name?: string }) => item?.name?.trim())
          .filter((name: string | undefined): name is string => Boolean(name));
        if (isMounted) setCategoryOptions(names);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRunAiBuilder = async () => {
    if (!aiTopic.trim()) return;
    setIsAiBuilding(true);
    setErrorMsg('');
    try {
      const res = await aiDiscoveryApi.discover({
        topic: aiTopic.trim(),
        target_level: aiLevel,
        domain_category: aiDomain,
        target_audience: aiAudience,
      });
      const bp = res.data?.data?.blueprint;
      if (bp) {
        setAiBlueprintResult(bp);
        // Tự động điền vào Course Form
        setTitle(bp.course_title || aiTopic);
        setDescription(bp.description || '');
        setCategory(bp.domain || aiDomain);
        setGradeLabel(bp.grade_label || aiLevel);
        setTargetAudience(bp.target_audience || aiAudience);
        setProficiencyLevel(bp.proficiency_level || 'Trung cấp');
        if (bp.outcomes) setOutcomes(bp.outcomes);
        if (bp.prerequisites) setPrerequisites(bp.prerequisites);
        if (bp.lessons && bp.lessons.length > 0) {
          const mappedLessons: LessonDraft[] = bp.lessons.map((l: any, idx: number) => ({
            id: `lesson-ai-${Date.now()}-${idx}`,
            title: l.title,
            duration: Math.round((l.duration || 1800) / 60),
            videoUrl: l.video_url || '',
            resourcesUrl: l.resources_url || '',
            transcript: l.transcript_summary || '',
          }));
          setLessons(mappedLessons);
        }
        setSuccessMsg(`AI đã khám phá và tự động thiết kế khóa học: "${bp.course_title || aiTopic}" kèm ${bp.lessons?.length || 0} bài học!`);
      }
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || 'Không thể sinh khóa học qua AI.');
    } finally {
      setIsAiBuilding(false);
    }
  };

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

  // Tải ảnh bìa lên Cloudinary qua backend (ký phía máy chủ, không lộ API secret).
  const handleCoverUpload = async (file: File | null | undefined) => {
    if (!file) return;
    setCoverError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setCoverError('Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setCoverError('Ảnh vượt quá 8MB. Vui lòng chọn ảnh nhỏ hơn.');
      return;
    }
    setIsUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await coursesApi.uploadImage(formData);
      const url = res.data?.data?.url;
      if (!url) throw new Error('Máy chủ không trả về liên kết ảnh.');
      setThumbnail(url);
    } catch (err: any) {
      setCoverError(
        err?.response?.data?.detail || err?.message || 'Không tải được ảnh lên. Vui lòng thử lại.',
      );
    } finally {
      setIsUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
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
      documentFiles: newLessonDocumentFiles,
      videoFile: newLessonVideoFile,
    };

    if (editingDraftLessonIndex !== null) {
      setLessons((items) => items.map((item, index) => index === editingDraftLessonIndex ? { ...newLesson, id: item.id } : item));
    } else {
      setLessons([...lessons, newLesson]);
    }
    setNewLessonTitle('');
    setNewLessonVideoUrl('');
    setNewLessonDuration('45');
    setNewLessonResourcesUrl('');
    setNewLessonTranscript('');
    setNewLessonDocumentFiles([]);
    setNewLessonVideoFile(undefined);
    setEditingDraftLessonIndex(null);
    setShowAddLessonForm(false);
    setActiveLessonIndex(editingDraftLessonIndex ?? lessons.length);
  };

  const handleEditDraftLesson = (index: number) => {
    const lesson = lessons[index];
    if (!lesson) return;
    setNewLessonTitle(lesson.title);
    setNewLessonDuration(String(lesson.duration));
    setNewLessonVideoUrl(lesson.videoUrl);
    setNewLessonResourcesUrl(lesson.resourcesUrl);
    setNewLessonTranscript(lesson.transcript);
    setNewLessonDocumentFiles(lesson.documentFiles || []);
    setNewLessonVideoFile(lesson.videoFile);
    setEditingDraftLessonIndex(index);
    setShowAddLessonForm(true);
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
      documentFiles: newLessonDocumentFiles,
      videoFile: newLessonVideoFile,
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
    let queuedUploads = 0;

    // fetch không báo được tiến độ multipart. XHR chỉ dùng cho tệp học liệu để
    // giảng viên biết trình duyệt còn đang gửi bao nhiêu phần trăm lên backend/R2.
    const uploadWithProgress = (url: string, formData: FormData, label: string, token: string | null) =>
      new Promise<any>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', url);
        if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
        request.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          setSuccessMsg(`${label} · đã gửi ${Math.round((event.loaded / event.total) * 100)}%`);
        };
        request.onerror = () => reject(new Error('Mất kết nối trong khi tải tệp.'));
        request.onload = () => {
          let data: any = null;
          try { data = request.responseText ? JSON.parse(request.responseText) : null; } catch { /* phản hồi không phải JSON */ }
          if (request.status >= 200 && request.status < 300) resolve(data);
          else reject(new Error(data?.detail || `Tải tệp thất bại (${request.status})`));
        };
        request.send(formData);
      });

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // 1. Lưu Khóa học (Course)
      // Mục tiêu/chuẩn đầu ra và yêu cầu tiên quyết được gửi thành trường riêng
      // để lưu vào cột JSON, KHÔNG nối vào description nữa.
      const coursePayload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || 'Khóa học đào tạo trực tuyến chuẩn chất lượng tích hợp Gia sư AI 24/7.',
        category: category.trim() || 'Đa lĩnh vực',
        level,
        category_id: categoryId,
        education_level_id: educationLevelId,
        grade_label: gradeLabel.trim() || undefined,
        proficiency_level: proficiencyLevel.trim() || undefined,
        target_audience: targetAudience.trim() || undefined,
        language: language || 'vi',
        price: isFree ? 0 : Number(price) || 0,
        thumbnail: thumbnail.trim(),
        status: statusVal,
        outcomes: outcomes.map((item) => item.trim()).filter(Boolean),
        prerequisites: prerequisites.map((item) => item.trim()).filter(Boolean),
      };

      const courseRes = await coursesApi.createCourse(coursePayload);
      const newCourseId = courseRes.data?.data?.id || courseRes.data?.id;

      if (!newCourseId) {
        throw new Error('Không nhận được mã ID khóa học từ máy chủ');
      }
      createdCourseId = newCourseId;
      setSuccessMsg(`Đã tạo khóa học #${newCourseId}. Đang lưu ${lessonsToSave.length} bài học...`);

      // 2. Lưu danh sách Bài học (Lessons) kèm Video & Slide
      const createdLessonIds: number[] = [];
      for (let i = 0; i < lessonsToSave.length; i++) {
        const les = lessonsToSave[i];
        setSuccessMsg(`Đã tạo khóa học #${newCourseId}. Đang lưu bài ${i + 1}/${lessonsToSave.length}: ${les.title}`);
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
        if (les.videoFile && lessonId) {
          setSuccessMsg(`Đang tải video cho bài ${i + 1}/${lessonsToSave.length}: ${les.videoFile.name}`);
          const formData = new FormData();
          formData.append('file', les.videoFile);
          formData.append('run_in_background', String(processUploadsInBackground));
          const uploadResult = await uploadWithProgress(
            `${apiUrl}/api/v1/courses/${newCourseId}/lessons/${lessonId}/documents/video`,
            formData,
            `Đang tải video “${les.videoFile.name}” lên Cloud`,
            token,
          );
          if (uploadResult?.queued) queuedUploads += 1;
        }
        const documents = les.documentFiles || [];
        for (let documentIndex = 0; documentIndex < documents.length; documentIndex++) {
          const documentFile = documents[documentIndex];
          if (!lessonId) break;
          setSuccessMsg(
            `Đang nạp học liệu AI cho bài ${i + 1}/${lessonsToSave.length} · tệp ${documentIndex + 1}/${documents.length}: ${documentFile.name}`,
          );
          const formData = new FormData();
          formData.append('file', documentFile);
          formData.append('run_in_background', String(processUploadsInBackground));
          const uploadResult = await uploadWithProgress(
            `${apiUrl}/api/v1/courses/${newCourseId}/lessons/${lessonId}/documents/upload`,
            formData,
            `Đang gửi tài liệu “${documentFile.name}” để nạp AI`,
            token,
          );
          if (uploadResult?.queued) queuedUploads += 1;
        }
      }

      // 3. Lưu danh sách Quizzes đã được Giảng viên duyệt
      for (const quiz of quizzes) {
        if (quiz.questions && quiz.questions.length > 0) {
          setSuccessMsg(`Đang lưu bộ đề: ${quiz.title}`);
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

      setSuccessMsg(
        queuedUploads > 0
          ? `Khóa học đã lưu. ${queuedUploads} tệp đang được máy chủ xử lý; vào Quản lý khóa học để theo dõi khi hoàn tất.`
          : 'Lưu khóa học, toàn bộ bài giảng và các bộ đề trắc nghiệm AI thành công vào PostgreSQL!',
      );
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
    return <PageSkeleton />;
  }

  const currentLessonPreview = lessons[activeLessonIndex] || lessons[0];
  const activeYoutubeEmbed = currentLessonPreview ? getYouTubeEmbedUrl(currentLessonPreview.videoUrl) : '';

  return (
    <div className="pb-28 font-sans text-stone-800">
      {/* ── Toolbar: Chế độ hiển thị & Lưu khóa học ── */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-semibold tracking-tight text-foreground">
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
        <Card className="mb-6 rounded-lg">
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
                      'h-auto items-center justify-start gap-2.5 whitespace-normal rounded-lg p-3 text-left',
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
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          {/* ================= CỘT TRÁI: NỘI DUNG 3 BƯỚC (8 COLS) ================= */}
          <div className="space-y-8 lg:col-span-8">
            {/* ── AI COURSE BUILDER & DISCOVERY BANNER (Master Spec Section Bổ sung) ── */}
            <Card className="rounded-lg border-brand-300 bg-linear-to-r from-brand-50/70 via-white to-brand-50/30 shadow-xs">
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-xs">
                      <Wand2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-stone-900">AI Course Builder & Discovery</h3>
                        <Badge variant="success" className="text-[10px] font-bold">Khám phá thông minh</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-stone-600">
                        Nhập chủ đề bất kỳ (Toán học, Tiếng Anh, Lập trình...), AI sẽ tự tìm học liệu, video bài giảng YouTube và thiết lập khóa học cho bạn duyệt!
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={showAiBuilder ? 'outline' : 'default'}
                    onClick={() => setShowAiBuilder(!showAiBuilder)}
                    className="shrink-0 text-xs font-semibold gap-1.5"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    {showAiBuilder ? 'Đóng AI Builder' : 'Dùng AI Sinh Khóa học'}
                  </Button>
                </div>

                {showAiBuilder && (
                  <div className="mt-4 pt-4 border-t border-brand-200/80 space-y-3.5">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="sm:col-span-2">
                        <Label className="text-xs font-semibold">Chủ đề đào tạo muốn AI xây dựng *</Label>
                        <Input
                          value={aiTopic}
                          onChange={(e) => setAiTopic(e.target.value)}
                          placeholder="VD: Toán cao cấp & Giải tích, Lập trình Fullstack Next.js/FastAPI, Tiếng Anh chuyên ngành IT..."
                          className="mt-1 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold">Lĩnh vực</Label>
                        <select
                          value={aiDomain}
                          onChange={(e) => setAiDomain(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-input bg-white p-2 text-xs font-medium h-9"
                        >
                          <option value="Khoa Công nghệ Thông tin">Khoa Công nghệ Thông tin</option>
                          <option value="Khoa Ngoại ngữ">Khoa Ngoại ngữ</option>
                          <option value="Khoa Quản trị - Kinh tế">Khoa Quản trị - Kinh tế</option>
                          <option value="Khoa Khoa học Cơ bản & Đại cương">Khoa Khoa học Cơ bản & Đại cương</option>
                          <option value="Khoa Kỹ thuật - Tự động hóa">Khoa Kỹ thuật - Tự động hóa</option>
                          <option value="Kỹ năng Bổ trợ & Hướng nghiệp ĐH Đông Á">Kỹ năng Bổ trợ & Hướng nghiệp</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold">Cấp học</Label>
                        <select
                          value={aiLevel}
                          onChange={(e) => setAiLevel(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-input bg-white p-2 text-xs font-medium h-9"
                        >
                          <option value="Đại cương (Năm 1 - 2)">Đại cương (Năm 1 - 2)</option>
                          <option value="Cơ sở ngành (Năm 2 - 3)">Cơ sở ngành (Năm 2 - 3)</option>
                          <option value="Chuyên ngành (Năm 3 - 4)">Chuyên ngành (Năm 3 - 4)</option>
                          <option value="Đồ án & Khóa luận tốt nghiệp">Đồ án & Khóa luận tốt nghiệp</option>
                          <option value="Chuẩn đầu ra & Chứng chỉ nghề">Chuẩn đầu ra & Chứng chỉ nghề</option>
                          <option value="Sau đại học & Nghiên cứu">Sau đại học & Nghiên cứu</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isAiBuilding || !aiTopic.trim()}
                        onClick={handleRunAiBuilder}
                        className="text-xs font-semibold gap-1.5 px-4"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isAiBuilding ? 'animate-spin' : ''}`} />
                        {isAiBuilding ? 'AI đang tìm kiếm & thiết kế...' : 'Khám phá & Điền tự động vào Form'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ══════════════════════════════════════════════════════════════════════
                BƯỚC 1: THÔNG TIN KHÓA HỌC
               ══════════════════════════════════════════════════════════════════════ */}
            {(viewMode === 'all-in-one' || activeStep === 1) && (
              <section id="section-step-1" className="space-y-6">
                <Card className="rounded-lg">
                  <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 font-bold text-primary">
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
                        <Label htmlFor="course-category">Danh mục / Lĩnh vực</Label>
                        <select
                          id="course-category"
                          value={categoryId ?? ''}
                          onChange={(e) => {
                            const val = e.target.value ? Number(e.target.value) : null;
                            setCategoryId(val);
                            if (val) {
                              const found = categoriesTree.flatMap(p => [p, ...(p.children || [])]).find(c => c.id === val);
                              if (found) setCategory(found.name);
                            }
                          }}
                          className="w-full rounded-lg border border-input bg-background p-2 text-xs font-semibold h-10"
                        >
                          <option value="">(Chọn lĩnh vực đào tạo)</option>
                          {categoriesTree.map((p) => (
                            <optgroup key={p.id} label={p.name}>
                              <option value={p.id}>{p.name} (Chung)</option>
                              {p.children?.map((ch: any) => (
                                <option key={ch.id} value={ch.id}>&nbsp;&nbsp;↳ {ch.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <p className="text-[11px] text-muted-foreground">Lĩnh vực chuẩn hóa cho hệ thống AI.</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="education-level">Cấp học / Trình độ</Label>
                        <select
                          id="education-level"
                          value={educationLevelId ?? ''}
                          onChange={(e) => setEducationLevelId(e.target.value ? Number(e.target.value) : null)}
                          className="w-full rounded-lg border border-input bg-background p-2 text-xs font-semibold h-10"
                        >
                          <option value="">(Chọn cấp học)</option>
                          {educationLevels.map((lvl) => (
                            <option key={lvl.id} value={lvl.id}>{lvl.name} ({lvl.code})</option>
                          ))}
                        </select>
                        <p className="text-[11px] text-muted-foreground">Đại cương, Cơ sở ngành, Chuyên ngành, Đồ án...</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="grade-label">Lớp / Mức năng lực</Label>
                        <Input
                          id="grade-label"
                          value={gradeLabel}
                          onChange={(e) => setGradeLabel(e.target.value)}
                          placeholder="VD: Năm 1 - Đại cương, Năm 3 - Chuyên ngành, Chuẩn B1/TOEIC..."
                          className="font-semibold text-xs h-10"
                        />
                        <p className="text-[11px] text-muted-foreground">Hiển thị trực tiếp cho học viên.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="target-audience">Đối tượng người học</Label>
                        <Input
                          id="target-audience"
                          value={targetAudience}
                          onChange={(e) => setTargetAudience(e.target.value)}
                          placeholder="Sinh viên năm 1-2, Sinh viên chuyên ngành CNTT, Sinh viên làm đồ án..."
                          className="text-xs h-10"
                        />
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

                    <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
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
                <Card className="rounded-lg">
                  <CardContent className="space-y-4 p-6 sm:p-7">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Ảnh đại diện Khóa học (Thumbnail)
                      </h3>
                      <span className="text-[11px] text-muted-foreground">Chọn mẫu, tải ảnh riêng hoặc dán URL</span>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        type="url"
                        value={thumbnail}
                        onChange={(e) => setThumbnail(e.target.value)}
                        placeholder="Dán liên kết ảnh đại diện (https://...)"
                        className="bg-muted font-mono text-xs"
                      />
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => handleCoverUpload(e.target.files?.[0])}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isUploadingCover}
                        onClick={() => coverInputRef.current?.click()}
                        className="shrink-0"
                      >
                        {isUploadingCover ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UploadCloud className="h-4 w-4" />
                        )}
                        {isUploadingCover ? 'Đang tải…' : 'Tải ảnh lên'}
                      </Button>
                    </div>
                    {coverError && (
                      <p className="text-[11px] text-destructive" role="alert">
                        {coverError}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Ảnh được lưu trên Cloudinary (JPG/PNG/WEBP, tối đa 8MB).
                    </p>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {PRESET_THUMBNAILS.map((preset) => (
                        <Button
                          key={preset.name}
                          type="button"
                          variant="outline"
                          onClick={() => setThumbnail(preset.url)}
                          className={cn(
                            'h-auto w-full flex-col items-stretch gap-0 whitespace-normal rounded-lg p-2 text-left font-normal',
                            thumbnail === preset.url && 'border-primary bg-primary/5 ring-2 ring-primary/20',
                          )}
                        >
                          <div className="relative mb-1.5 aspect-video w-full overflow-hidden rounded-lg bg-muted">
                            <Image
                              src={preset.url}
                              alt={preset.name}
                              fill
                              sizes="160px"
                              className="object-cover"
                            />
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
                <Card className="rounded-lg">
                  <CardContent className="space-y-6 p-6 sm:p-7">
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground">
                        Học viên sẽ đạt được gì?
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
                              className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2 text-xs"
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
                              className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2 text-xs"
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
                <Card className="rounded-lg">
                  <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 font-bold text-emerald-600">
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
                        className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-900">
                            {editingDraftLessonIndex === null ? `Soạn bài học #${lessons.length + 1}` : `Sửa bài học #${editingDraftLessonIndex + 1}`}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowAddLessonForm(false);
                              setEditingDraftLessonIndex(null);
                            }}
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

                        {/* Video: một nguồn chính, hoặc URL hoặc tệp tải lên. */}
                        <div className="grid gap-3 rounded-md border border-border bg-card p-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                          <Label htmlFor="lesson-video" className="flex items-center gap-1.5">
                            <Video className="h-3.5 w-3.5 text-primary" />
                            Liên kết video (YouTube hoặc MP4 có URL)
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
                          <div className="space-y-1.5">
                            <Label htmlFor="lesson-video-file" className="flex items-center gap-1.5">
                              <UploadCloud className="h-3.5 w-3.5 text-primary" /> Tải video MP4
                            </Label>
                            <Input
                              id="lesson-video-file"
                              type="file"
                              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                              onChange={(e) => setNewLessonVideoFile(e.target.files?.[0])}
                              className="cursor-pointer text-xs file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1.5 file:text-xs file:font-semibold"
                            />
                            <p className="text-[11px] text-muted-foreground">Chọn một nguồn chính. Video tải lên sẽ thay thế liên kết phía trên.</p>
                            {newLessonVideoFile && <p className="text-[11px] font-medium text-primary">Đã chọn: {newLessonVideoFile.name}</p>}
                          </div>
                        </div>

                        {/* Tài liệu Slide đính kèm */}
                        <div className="space-y-1.5">
                          <Label htmlFor="lesson-resources" className="flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-emerald-600" />
                            Học liệu đính kèm (có thể chọn nhiều PDF / DOCX / PPTX)
                          </Label>
                          <Input
                            id="lesson-resources"
                            value={newLessonResourcesUrl}
                            onChange={(e) => setNewLessonResourcesUrl(e.target.value)}
                            placeholder="Liên kết học liệu ngoài (tùy chọn)"
                            className="font-mono text-xs"
                          />
                          <Input
                            type="file"
                            multiple
                            accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                            onChange={(e) => setNewLessonDocumentFiles(Array.from(e.target.files || []))}
                            className="cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-emerald-800"
                          />
                          {newLessonDocumentFiles.length > 0 && (
                            <p className="text-[11px] font-medium text-emerald-700">
                              Đã chọn {newLessonDocumentFiles.length} tệp: {newLessonDocumentFiles.map((file) => file.name).join(', ')}
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            Mỗi tệp được lưu riêng và nạp vào tri thức AI của bài học; không ghi đè các tài liệu đã chọn trước đó.
                          </p>
                        </div>

                        {(newLessonVideoFile || newLessonDocumentFiles.length > 0) && (
                          <label className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                            <input type="checkbox" checked={processUploadsInBackground} onChange={(e) => setProcessUploadsInBackground(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" />
                            <span><strong>Xử lý tệp dài ở máy chủ nền</strong><br /><span className="text-muted-foreground">Nên bật cho video/tài liệu lớn. Bạn được chuyển sang quản lý khóa học ngay; trạng thái từng tệp sẽ tự cập nhật.</span></span>
                          </label>
                        )}

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
                            {editingDraftLessonIndex === null ? 'Thêm bài học' : 'Cập nhật bài học'}
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Danh sách các bài giảng hiện tại */}
                    <div className="space-y-3">
                      {lessons.length === 0 ? (
                        <div className="space-y-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 text-center">
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
                              'flex flex-col justify-between gap-3 rounded-lg border p-4 transition sm:flex-row sm:items-center',
                              activeLessonIndex === idx
                                ? 'border-emerald-500 bg-emerald-50/30'
                                : 'border-border bg-card hover:border-primary/40',
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className={cn(
                                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
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
                                    {les.videoFile ? 'Video MP4 đã chọn' : les.videoUrl ? 'Video liên kết' : 'Chưa có video'}
                                  </span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1 truncate font-medium text-emerald-600">
                                    <FileText className="h-3 w-3" />
                                    {les.documentFiles?.length ? `${les.documentFiles.length} tài liệu đã chọn` : les.resourcesUrl || 'Chưa đính kèm tài liệu'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditDraftLesson(idx)}
                              >
                                Sửa
                              </Button>
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
                <Card className="rounded-lg">
                  <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-clay-50 font-bold text-clay-600">
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
                    <div className="space-y-3 rounded-lg border border-clay-200 bg-clay-50/70 p-4">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                        <div className="flex-1 space-y-1.5">
                          <Label>Chọn bài học để AI sinh bộ đề:</Label>
                          {lessons.length === 0 ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
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
                      <div className="space-y-2 rounded-lg border-2 border-dashed border-border p-8 text-center">
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
                          <div key={quizIdx} className="space-y-4 rounded-lg border border-border bg-muted/40 p-5">
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
                                  className="space-y-3 rounded-lg border border-border bg-card p-4"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
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
                                          'flex items-center gap-2 rounded-lg border p-2 transition',
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
            <Card className="rounded-lg">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-foreground">Trình phát thử Focus Player</span>
                  </div>
                  <Badge variant="success">{activeYoutubeEmbed ? 'YouTube Live' : 'Sẵn sàng'}</Badge>
                </div>

                {/* YouTube Player Preview */}
                <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-stone-800 bg-stone-950">
                  {activeYoutubeEmbed ? (
                    <iframe
                      src={activeYoutubeEmbed}
                      title="Preview Video Player"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center space-y-2 p-4 text-center text-stone-500">
                      <Video className="h-8 w-8 text-stone-600" />
                      <p className="text-xs font-medium text-stone-400">
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
            <Card className="rounded-lg">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="text-xs font-bold text-foreground">Thẻ khóa học hiển thị</span>
                  <Badge variant="info">{statusVal === 'published' ? 'Công khai' : 'Bản nháp'}</Badge>
                </div>

                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-muted">
                    {thumbnail ? (
                      <Image src={thumbnail} alt="Preview" fill sizes="(max-width: 1024px) 100vw, 480px" className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center bg-muted/60 p-4 text-center text-muted-foreground">
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
                      <span className="font-semibold text-foreground">
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
            <div className="space-y-3 rounded-lg border border-brand-900 bg-brand-950 p-5 text-brand-50">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold">Cơ chế AI Studio Smart LMS</span>
              </div>
              <p className="text-[11px] leading-relaxed text-brand-200/80">
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
