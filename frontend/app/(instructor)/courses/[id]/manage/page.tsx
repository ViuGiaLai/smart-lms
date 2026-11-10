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
  ChevronDown,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { coursesApi, youtubeApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';

interface LessonItem {
  id: string | number;
  title: string;
  order_index?: number;
  duration?: number;
  video_url?: string;
  transcript?: string;
  resources_url?: string;
  description?: string;
  youtubeVideoId?: string | null;
  subtitleStatus?: string;
  subtitleLanguage?: string | null;
  materials?: LessonMaterial[];
}

interface LessonMaterial {
  id: number;
  kind: 'document' | 'video';
  title: string;
  file_url: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  status?: 'queued' | 'processing' | 'ready' | 'failed';
  error_message?: string | null;
}

const COURSE_LEVELS = [
  { value: 'beginner', label: 'Cơ bản' },
  { value: 'intermediate', label: 'Trung cấp' },
  { value: 'advanced', label: 'Nâng cao' },
];

const categorySuggestions = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => courseCategoryText(item?.name ?? item))
    .filter(Boolean);
};

function courseCategoryText(category: unknown): string {
  if (typeof category === 'string') return category;
  if (category && typeof category === 'object') {
    const value = category as Record<string, unknown>;
    for (const key of ['name', 'title', 'label', 'display_name']) {
      if (typeof value[key] === 'string') return value[key] as string;
    }
  }
  return '';
}

function courseLevelValue(level: unknown): string {
  const raw = typeof level === 'string'
    ? level
    : level && typeof level === 'object'
      ? String((level as Record<string, unknown>).code || (level as Record<string, unknown>).value || (level as Record<string, unknown>).name || '')
      : '';
  const normalized = raw.trim().toLowerCase();
  const aliases: Record<string, string> = {
    'cơ bản': 'beginner', basic: 'beginner', beginner: 'beginner',
    'trung cấp': 'intermediate', intermediate: 'intermediate',
    'nâng cao': 'advanced', advanced: 'advanced',
  };
  return aliases[normalized] || raw;
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
  const courseId = (params?.id as string) || '1';

  const [courseTitle, setCourseTitle] = useState('Đang tải thông tin khóa học...');
  const [courseDraft, setCourseDraft] = useState({ title: '', description: '', category: '', level: '' });
  const [courseCategories, setCourseCategories] = useState<string[]>([]);
  const [showCourseEdit, setShowCourseEdit] = useState(false);
  const [isSavingCourse, setIsSavingCourse] = useState(false);
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [courseQuizzes, setCourseQuizzes] = useState<any[]>([]);
  const [courseStatus, setCourseStatus] = useState<string>('draft');
  const [editingLesson, setEditingLesson] = useState<LessonItem | null>(null);
  const [isSavingLesson, setIsSavingLesson] = useState(false);

  // Form thêm bài học mới
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newDuration, setNewDuration] = useState('45');
  const [newTranscript, setNewTranscript] = useState('');
  const [newResourcesUrl, setNewResourcesUrl] = useState('');
  const [newVideoFile, setNewVideoFile] = useState<File | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [documentFiles, setDocumentFiles] = useState<Record<string, File | undefined>>({});
  const [editingVideoFile, setEditingVideoFile] = useState<File | undefined>();
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

  // Fetch course details from backend if available and verify ownership
  useEffect(() => {
    let isMounted = true;
    void coursesApi.getCategories()
      .then((response) => {
        if (isMounted) setCourseCategories(categorySuggestions(response.data?.data));
      })
      .catch(() => {
        if (isMounted) setCourseCategories([]);
      });
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
          setCourseTitle(c.title || 'Khóa học');
          setCourseDraft({
            title: c.title || '',
            description: c.description || '',
            category: courseCategoryText(c.categoryName ?? c.category),
            level: courseLevelValue(c.level),
          });
          const mappedLessons = (c.lessons || []).map((lesson: any) => ({
            ...lesson,
            video_url: lesson.video_url ?? lesson.videoUrl ?? '',
            resources_url: lesson.resources_url ?? '',
            transcript: lesson.transcript ?? '',
            youtubeVideoId: lesson.youtubeVideoId ?? null,
            subtitleStatus: lesson.subtitleStatus ?? 'none',
            subtitleLanguage: lesson.subtitleLanguage ?? null,
          }));
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
          const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
          const lessonsWithMaterials = await Promise.all(mappedLessons.map(async (lesson: LessonItem) => {
            try {
              const materialResponse = await fetch(`${apiUrl}/api/v1/courses/${courseId}/lessons/${lesson.id}/documents`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
              const materials = materialResponse.ok ? await materialResponse.json() : [];
              return { ...lesson, materials: Array.isArray(materials) ? materials : [] };
            } catch { return { ...lesson, materials: [] }; }
          }));
          setLessons(lessonsWithMaterials);
          setCourseQuizzes(c.quizzes || []);
          setCourseStatus(c.status || 'draft');
        }
      } catch (err) {
        console.error('Lỗi khi nạp dữ liệu khóa học:', err);
      }
    };
    fetchCourse();
    return () => {
      isMounted = false;
    };
  }, [courseId, router]);

  // Tệp lớn chạy nền vẫn được theo dõi sau khi rời màn tạo khóa học.
  useEffect(() => {
    const pending = lessons.filter((lesson) =>
      (lesson.materials || []).some((material) => material.status === 'queued' || material.status === 'processing'),
    );
    if (pending.length === 0) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const token = localStorage.getItem('accessToken');
    const refreshStatuses = async () => {
      const updates = await Promise.all(pending.map(async (lesson) => {
        try {
          const response = await fetch(`${apiUrl}/api/v1/courses/${courseId}/lessons/${lesson.id}/documents`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          return response.ok ? { id: String(lesson.id), materials: await response.json() } : null;
        } catch { return null; }
      }));
      setLessons((items) => items.map((lesson) => {
        const update = updates.find((item) => item?.id === String(lesson.id));
        return update ? { ...lesson, materials: update.materials } : lesson;
      }));
    };
    const timer = window.setInterval(() => void refreshStatuses(), 2500);
    return () => window.clearInterval(timer);
  }, [courseId, lessons]);

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
        const mapped: GeneratedQuizQuestion[] = (data.questions || []).map((q: any, idx: number) => ({
          question_number: idx + 1,
          question_text: q.question_text || `Câu hỏi ${idx + 1}`,
          options: (q.options || []).map((opt: any, optIdx: number) => ({
            key: opt.key || String.fromCharCode(65 + optIdx),
            text: opt.text || String(opt),
          })),
          correct_option: q.correct_answer || q.correct_option || 'A',
          explanation: q.explanation || 'Phân tích suy luận từ tài liệu bài giảng.',
        }));
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

  const handleRemoveQuestion = (index: number) => {
    setQuizQuestions((prev) =>
      prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, question_number: i + 1 }))
    );
  };

  // Tạo bài học và lưu kèm bộ Quiz
  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    const orderIndex = lessons.length + 1;
    const durationSeconds = parseInt(newDuration, 10) * 60 || 2700;
    const selectedDocumentFile = documentFiles.new;
    const selectedVideoFile = newVideoFile;

    const newLessonData: LessonItem = {
      id: Date.now(),
      title: newTitle.trim(),
      order_index: orderIndex,
      duration: durationSeconds,
      video_url: newVideoUrl.trim() || undefined,
      transcript: newTranscript.trim() || undefined,
      resources_url: newResourcesUrl.trim() || undefined,
    };

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // 1. Tạo bài học trong database qua instructor API
      const res = await fetch(`${apiUrl}/api/v1/courses/${courseId}/lessons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: newLessonData.title,
          order_index: newLessonData.order_index,
          duration: newLessonData.duration,
          video_url: newLessonData.video_url,
          transcript: newLessonData.transcript,
          resources_url: newLessonData.resources_url,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setLessons((prev) => [...prev, created]);
        if (selectedDocumentFile) {
          await uploadDocument(created.id, selectedDocumentFile);
        }
        if (selectedVideoFile) {
          await uploadVideo(created.id, selectedVideoFile);
        }
      } else {
        const errData = await res.json().catch(() => null);
        alert('Tạo bài học thất bại: ' + (errData?.detail || 'Lỗi máy chủ'));
        return;
      }

      // 2. Nếu có bộ câu hỏi Quiz đã duyệt, lưu vào bảng quizzes
      if (quizQuestions.length > 0) {
        try {
          await fetch(`${apiUrl}/api/v1/courses/${courseId}/quizzes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              title: `Trắc nghiệm ôn tập: ${newTitle.trim()}`,
              description: `Bộ đề củng cố kiến thức bài giảng #${orderIndex}`,
              time_limit: 600,
              pass_score: 0.6,
              questions: quizQuestions.map((q, idx) => ({
                question_text: q.question_text,
                options: q.options,
                correct_answer: q.correct_option,
                explanation: q.explanation,
                order_index: idx + 1,
              })),
            }),
          });
        } catch (quizErr) {
          console.warn('Lỗi khi lưu đề thi vào PostgreSQL:', quizErr);
        }
      }
    } catch (err: any) {
      alert('Lỗi kết nối khi tạo bài học: ' + (err.message || 'Vui lòng thử lại'));
      return;
    } finally {
      setIsSubmitting(false);
      setShowAddForm(false);
      setNewTitle('');
      setNewVideoUrl('');
      setNewTranscript('');
      setNewResourcesUrl('');
      setDocumentFiles({});
      setNewVideoFile(undefined);
      setQuizQuestions([]);
      setSuccessMessage('🎉 Đã thêm bài học & bộ Quiz thành công vào hệ thống!');
      setTimeout(() => setSuccessMessage(''), 4000);
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
      if (data?.material) {
        setLessons((items) => items.map((lesson) => String(lesson.id) === key
          ? { ...lesson, materials: [...(lesson.materials || []), data.material] }
          : lesson));
      }
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

  const uploadVideo = async (lessonId: string | number, file: File) => {
    const key = String(lessonId);
    setDocumentStates((prev) => ({ ...prev, [key]: 'uploading' }));
    setDocumentMessages((prev) => ({ ...prev, [key]: `Đang tải video ${file.name}...` }));
    try {
      const token = localStorage.getItem('accessToken');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${apiUrl}/api/v1/courses/${courseId}/lessons/${lessonId}/documents/video`, {
        method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || 'Không thể tải video');
      setLessons((items) => items.map((lesson) => String(lesson.id) === key
        ? { ...lesson, video_url: data.video_url || lesson.video_url, youtubeVideoId: null, subtitleStatus: 'none', materials: [...(lesson.materials || []), data.material].filter(Boolean) }
        : lesson));
      setDocumentStates((prev) => ({ ...prev, [key]: 'ready' }));
      setDocumentMessages((prev) => ({ ...prev, [key]: `Đã tải video ${file.name}.` }));
    } catch (error) {
      setDocumentStates((prev) => ({ ...prev, [key]: 'error' }));
      setDocumentMessages((prev) => ({ ...prev, [key]: error instanceof Error ? error.message : 'Không thể tải video' }));
    }
  };

  const deleteMaterial = async (lessonId: string | number, materialId: number) => {
    const token = localStorage.getItem('accessToken');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const response = await fetch(`${apiUrl}/api/v1/courses/${courseId}/lessons/${lessonId}/documents/${materialId}`, {
      method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Không thể xóa học liệu');
    setLessons((items) => items.map((lesson) => String(lesson.id) === String(lessonId)
      ? { ...lesson, materials: (lesson.materials || []).filter((material) => material.id !== materialId) }
      : lesson));
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

  const saveCourseEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!courseDraft.title.trim() || isSavingCourse) return;
    setIsSavingCourse(true);
    try {
      const token = localStorage.getItem('accessToken');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/v1/courses/${courseId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ title: courseDraft.title.trim(), description: courseDraft.description.trim() || null, category: courseDraft.category.trim() || null, level: courseDraft.level.trim() || null }) });
      const updated = await response.json().catch(() => null);
      if (!response.ok) throw new Error(updated?.detail || 'Không thể cập nhật khóa học');
      const savedCategory = courseCategoryText(updated?.categoryName ?? updated?.category ?? courseDraft.category);
      const savedLevel = courseLevelValue(updated?.level ?? courseDraft.level);
      setCourseTitle(updated.title || courseDraft.title.trim());
      setCourseDraft((draft) => ({
        ...draft,
        title: updated.title || draft.title,
        description: updated.description ?? draft.description,
        category: savedCategory,
        level: savedLevel,
      }));
      setShowCourseEdit(false);
      setSuccessMessage('Đã cập nhật thông tin khóa học.');
    } catch (error) { alert(error instanceof Error ? error.message : 'Không thể cập nhật khóa học'); }
    finally { setIsSavingCourse(false); }
  };

  const saveLessonEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingLesson || !editingLesson.title.trim() || isSavingLesson) return;
    setIsSavingLesson(true);
    try {
      const token = localStorage.getItem('accessToken');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/v1/courses/${courseId}/lessons/${editingLesson.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          title: editingLesson.title.trim(), description: editingLesson.description?.trim() || null,
          video_url: editingLesson.video_url?.trim() || null, duration: Number(editingLesson.duration || 0),
          transcript: editingLesson.transcript?.trim() || null, resources_url: editingLesson.resources_url?.trim() || null,
        }),
      });
      const updated = await response.json().catch(() => null);
      if (!response.ok) throw new Error(updated?.detail || 'Không thể lưu thay đổi bài học');
      const videoId = updated.youtube_video_id ?? editingLesson.video_url?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/)?.[1] ?? null;
      setLessons((items) => items.map((lesson) => String(lesson.id) === String(updated.id) ? { ...lesson, ...updated, video_url: updated.video_url || '', resources_url: updated.resources_url || '', transcript: updated.transcript || '', youtubeVideoId: videoId, subtitleStatus: updated.subtitle_status || 'none' } : lesson));
      if (editingVideoFile) {
        await uploadVideo(updated.id, editingVideoFile);
      }
      setEditingVideoFile(undefined);
      setEditingLesson(null);
      setSuccessMessage('Đã cập nhật bài học. Nếu đổi video YouTube, hãy lấy transcript mới.');
    } catch (error) { alert(error instanceof Error ? error.message : 'Không thể lưu thay đổi bài học'); }
    finally { setIsSavingLesson(false); }
  };

  const fetchYoutubeTranscript = async (lesson: LessonItem) => {
    if (!lesson.youtubeVideoId) { alert('Hãy lưu URL YouTube trước khi lấy transcript.'); return; }
    const key = String(lesson.id);
    setDocumentStates((items) => ({ ...items, [key]: 'processing' }));
    setDocumentMessages((items) => ({ ...items, [key]: 'Đang lấy phụ đề và nhúng vào AI…' }));
    try {
      const result = await youtubeApi.fetchSubtitle(lesson.id);
      const subtitle = result.data?.data?.subtitle;
      setLessons((items) => items.map((item) => String(item.id) === key ? { ...item, subtitleStatus: subtitle?.status || 'ingested', subtitleLanguage: subtitle?.language || null } : item));
      setDocumentStates((items) => ({ ...items, [key]: 'ready' }));
      setDocumentMessages((items) => ({ ...items, [key]: `Đã nhúng ${result.data?.data?.chunks || 0} đoạn transcript vào pgvector.` }));
    } catch (error: any) {
      setDocumentStates((items) => ({ ...items, [key]: 'error' }));
      setDocumentMessages((items) => ({ ...items, [key]: error?.response?.data?.detail || 'Không thể lấy transcript từ YouTube.' }));
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
        setLessons((prev) => prev.filter((l) => l.id !== lessonId));
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs font-semibold text-slate-500">
        Đang xác thực quyền Giảng viên...
      </div>
    );
  }

  const embedUrl = getYouTubeEmbedUrl(newVideoUrl);

  return (
    <div className="pb-32 md:pb-16 font-sans">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/instructor-dashboard"
            className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 px-3 py-2 rounded-xl shadow-2xs transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Bảng điều khiển Giảng viên
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/quiz/bank"
              className="inline-flex min-h-10 items-center gap-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-indigo-600 px-3.5 py-2 rounded-xl shadow-2xs transition"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" /> Ngân hàng đề thi
            </Link>

            <Link
              href={`/courses/${courseId}/learn?preview=true`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-secondary px-3.5 py-2 text-xs font-bold text-primary transition hover:bg-accent"
            >
              <Eye className="w-3.5 h-3.5" /> Xem trước bài giảng (Focus Player)
            </Link>
          </div>
        </div>

        {/* Course Header Banner */}
        <div className="rounded-lg border border-border bg-card p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-200">
                Khóa học #{courseId}
              </span>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                courseStatus === 'published'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {courseStatus === 'published' ? '✓ Đã xuất bản' : '✏️ Bản nháp'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
              {courseTitle}
            </h1>
            <p className="text-xs text-muted-foreground">
              Quản lý video, tài liệu, transcript và câu hỏi ôn tập được AI hỗ trợ.
            </p>
          </div>

          <button onClick={() => setShowCourseEdit(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-xs font-bold text-primary transition hover:bg-accent md:w-auto shrink-0">
            <Edit3 className="w-4 h-4" /> Sửa thông tin khóa học
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-xs font-bold text-primary-foreground transition hover:bg-primary/90 md:w-auto shrink-0"
          >
            <PlusCircle className="w-4 h-4" /> Soạn thảo bài học mới
          </button>
          {courseStatus !== 'published' && (
            <button
              onClick={handlePublishCourse}
              className="inline-flex w-full items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-3 rounded-xl shadow-md shadow-emerald-100 transition md:w-auto shrink-0"
            >
              <CheckCircle2 className="w-4 h-4" /> Xuất bản khóa học
            </button>
          )}
        </div>

        {showCourseEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/60 p-3 sm:p-4">
            <form onSubmit={saveCourseEdit} className="my-auto w-full max-w-xl space-y-4 rounded-lg border border-border bg-card p-4 shadow-2xl sm:p-6">
              <div><p className="text-xs font-bold uppercase text-primary">Quản lý khóa học</p><h2 className="mt-1 text-lg font-semibold text-foreground">Sửa thông tin khóa học</h2><p className="mt-1 text-xs text-muted-foreground">Chỉ giảng viên phụ trách và Quản trị viên có quyền lưu.</p></div>
              <label className="block text-xs font-bold text-foreground">Tên khóa học<input required value={courseDraft.title} onChange={(e) => setCourseDraft({ ...courseDraft, title: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
              <label className="block text-xs font-bold text-foreground">Mô tả<textarea value={courseDraft.description} onChange={(e) => setCourseDraft({ ...courseDraft, description: e.target.value })} className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold text-foreground">Lĩnh vực
                  <input
                    list="course-category-options"
                    value={courseDraft.category}
                    onChange={(e) => setCourseDraft({ ...courseDraft, category: e.target.value })}
                    placeholder="Ví dụ: Công nghệ thông tin"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <datalist id="course-category-options">
                    {courseCategories.map((category) => <option key={category} value={category} />)}
                  </datalist>
                </label>
                <label className="block text-xs font-bold text-foreground">Cấp độ
                  <select value={courseDraft.level} onChange={(e) => setCourseDraft({ ...courseDraft, level: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Chưa xác định</option>
                    {COURSE_LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setShowCourseEdit(false)} className="w-full rounded-md border border-border px-4 py-2.5 text-xs font-bold text-foreground sm:w-auto">Hủy</button><button type="submit" disabled={isSavingCourse} className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-60 sm:w-auto"><Save className="w-3.5 h-3.5" />{isSavingCourse ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div>
            </form>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {successMessage}
          </div>
        )}

        {/* Form thêm bài học tích hợp Video YouTube + Slide + AI Quiz Generator */}
        {showAddForm && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-indigo-400 shadow-lg space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    Studio Soạn thảo Bài giảng & Nạp Học liệu AI
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Dữ liệu bạn nạp tại đây sẽ hiển thị trực tiếp cho học viên và làm tri thức cho Trợ lý Gia sư AI.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold px-2 py-1"
              >
                Đóng ✕
              </button>
            </div>

            <form onSubmit={handleCreateLesson} className="space-y-5">
              {/* 1. Tiêu đề & Thời lượng */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tiêu đề bài học *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ví dụ: Bài 4: Tích hợp Vector Database và RAG Pipeline"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <label className="block text-xs font-bold text-slate-700 mt-3 mb-1">
                    Upload học liệu để AI Tutor xử lý
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setDocumentFiles((prev) => ({ ...prev, new: file }));
                      }
                    }}
                    className="w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Tài liệu sẽ được upload sau khi bài học được tạo, không dùng URL giả hoặc dữ liệu mock.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Thời lượng ước tính (phút)
                  </label>
                  <input
                    type="number"
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* 2. Video chính: liên kết hoặc tệp tải lên */}
              <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex flex-col items-start justify-between gap-1 sm:flex-row sm:items-center">
                  <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-rose-600" />
                    Liên kết video YouTube hoặc MP4 có URL
                  </label>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Hỗ trợ link: https://www.youtube.com/watch?v=... hoặc https://youtu.be/...
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    placeholder="Dán đường dẫn video YouTube (ví dụ: https://www.youtube.com/watch?v=...)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-foreground"><Upload className="h-4 w-4 text-primary" /> Hoặc tải video MP4 / WEBM / MOV</label>
                  <input type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" onChange={(e) => setNewVideoFile(e.target.files?.[0])} className="mt-2 block w-full text-xs" />
                  <p className="mt-1 text-[11px] text-muted-foreground">Video tải lên sẽ là video chính của bài học và ưu tiên hơn liên kết URL.</p>
                  {newVideoFile && <p className="mt-1 text-[11px] font-semibold text-primary">Đã chọn: {newVideoFile.name}</p>}
                </div>

                {/* Trình phát Video Preview thu nhỏ */}
                {embedUrl && (
                  <div className="pt-2">
                    <p className="text-[11px] font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5 text-primary" /> Xem trước video sẽ phát cho học viên:
                    </p>
                    <div className="w-full max-w-md aspect-video rounded-xl overflow-hidden border border-slate-300 shadow-sm bg-black">
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

              {/* 3. Học liệu và transcript */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    Liên kết học liệu ngoài (tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={newResourcesUrl}
                    onChange={(e) => setNewResourcesUrl(e.target.value)}
                    placeholder="https://... hoặc tên tài liệu tham khảo"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-emerald-600 font-medium mt-1">
                    Tệp PDF/DOCX/PPTX tải lên ở phía trên được nạp vào AI. Có thể thêm nhiều tệp sau khi tạo bài học.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Nội dung Transcript có mốc thời gian
                    </label>
                  </div>
                  <textarea
                    rows={4}
                    value={newTranscript}
                    onChange={(e) => setNewTranscript(e.target.value)}
                    placeholder="[00:00 - 05:00] Giới thiệu mục tiêu bài học&#10;[05:01 - 20:00] Trình bày lý thuyết trọng tâm&#10;[20:01 - 40:00] Hướng dẫn thực hành chi tiết"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono leading-relaxed"
                  />
                </div>
              </div>

              {/* 4. Khối AI Tự Động Sinh Quiz & Teacher Review */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-50/70 via-indigo-50/50 to-white border border-indigo-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-indigo-950 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      AI tạo câu hỏi & Kiểm duyệt câu hỏi
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      AI sẽ tự động đọc nội dung bài học và sinh câu hỏi trắc nghiệm chuẩn Bloom. Bạn có thể duyệt và chỉnh sửa trực tiếp.
                    </p>
                  </div>

                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <select
                      value={numQuizQuestions}
                      onChange={(e) => setNumQuizQuestions(parseInt(e.target.value, 10))}
                      className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-semibold"
                    >
                      <option value={3}>3 câu hỏi</option>
                      <option value={5}>5 câu hỏi</option>
                    </select>

                    <button
                      type="button"
                      onClick={handleAiGenerateQuiz}
                      disabled={isGeneratingQuiz}
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 sm:flex-none"
                    >
                      {isGeneratingQuiz ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>AI đang sinh đề...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>AI Sinh Bộ Đề Ôn Tập</span>
                        </>
                      )}
                    </button>
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
                        className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg shrink-0 mt-1">
                            Câu #{q.question_number}
                          </span>
                          <input
                            type="text"
                            value={q.question_text}
                            onChange={(e) => handleUpdateQuestionText(qIdx, e.target.value)}
                            className="w-full text-xs font-bold text-slate-900 border-b border-dashed border-slate-300 focus:border-indigo-500 focus:outline-none pb-0.5"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveQuestion(qIdx)}
                            className="text-slate-400 hover:text-red-500 text-xs p-1"
                            title="Xóa câu này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* 4 Lựa chọn A, B, C, D */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {q.options.map((opt) => {
                            const isCorrect = q.correct_option === opt.key;
                            return (
                              <div
                                key={opt.key}
                                onClick={() => handleChangeCorrectOption(qIdx, opt.key)}
                                className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                                  isCorrect
                                    ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 font-bold'
                                    : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'
                                }`}
                              >
                                <span
                                  className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                                    isCorrect
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-white text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {opt.key}
                                </span>
                                <input
                                  type="text"
                                  value={opt.text}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => handleUpdateOptionText(qIdx, opt.key, e.target.value)}
                                  className="w-full bg-transparent focus:outline-none text-xs"
                                />
                                {isCorrect && (
                                  <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                                    Đúng
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <p className="text-[11px] text-slate-500 italic">
                          💡 Giải thích: {q.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 sm:w-auto"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newTitle.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-100 transition hover:bg-indigo-700 disabled:opacity-50 sm:w-auto"
                >
                  <Save className="w-4 h-4" />
                  {isSubmitting ? 'Đang lưu bài học & Bộ Quiz...' : 'Lưu bài học & Xuất bản'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Danh sách bài học hiện tại */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-4">
          <div className="flex flex-col items-start justify-between gap-1 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Danh sách bài giảng khóa học ({lessons.length} bài)
            </h2>
            <span className="text-xs text-muted-foreground">Đồng bộ với không gian học của Học viên</span>
          </div>

          <div className="space-y-3">
            {lessons.map((lesson, idx) => (
              <div
                key={lesson.id}
                className="p-4 rounded-2xl border border-slate-200 hover:border-slate-300 transition bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                      {lesson.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {lesson.duration ? `${Math.round(lesson.duration / 60)} phút` : '45 phút'}
                      </span>

                      {lesson.video_url && (
                        <span className="flex items-center gap-1 text-rose-600 font-semibold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                          <Video className="w-3 h-3" />
                          {lesson.youtubeVideoId ? 'Video YouTube' : 'Video bài học'}
                        </span>
                      )}

                      {(lesson.materials || []).filter((material) => material.kind === 'document').length > 0 && (
                        <span className="flex items-center gap-1 font-medium text-primary">
                          <FileText className="w-3 h-3" /> {(lesson.materials || []).filter((material) => material.kind === 'document').length} tài liệu đính kèm
                        </span>
                      )}

                      {lesson.resources_url && (
                        <span className="flex items-center gap-1 text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                          <FileText className="w-3 h-3" />
                          {lesson.resources_url}
                        </span>
                      )}

                      {documentStates[String(lesson.id)] === 'ready' ? (
                        <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> RAG đã xử lý
                        </span>
                      ) : (
                        <span className="text-slate-600 font-medium bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                          <FileText className="w-3 h-3" /> Chưa có học liệu RAG
                        </span>
                      )}
                    </div>
                    {(lesson.materials || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(lesson.materials || []).map((material) => (
                          <span key={material.id} className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground">
                            {material.kind === 'video' ? <Video className="h-3 w-3 shrink-0" /> : <FileText className="h-3 w-3 shrink-0" />}
                            <span className="max-w-[180px] truncate" title={material.title}>{material.title}</span>
                            {material.status === 'queued' || material.status === 'processing' ? <span className="animate-pulse whitespace-nowrap text-primary">Đang xử lý…</span> : null}
                            {material.status === 'failed' ? <span className="max-w-[120px] truncate whitespace-nowrap text-destructive" title={material.error_message || ''}>Lỗi xử lý</span> : null}
                            {material.status === 'ready' ? <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" /> : null}
                            <button type="button" onClick={() => void deleteMaterial(lesson.id, material.id).catch((error) => alert(error.message))} className="ml-1 text-muted-foreground hover:text-destructive" title="Xóa tệp này"><Trash2 className="h-3 w-3" /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    {documentMessages[String(lesson.id)] && (
                      <p className={`mt-2 text-[11px] ${
                        documentStates[String(lesson.id)] === 'error' ? 'text-red-600' : 'text-slate-500'
                      }`}>
                        {documentMessages[String(lesson.id)]}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex w-full flex-wrap items-center justify-end gap-1.5 self-end sm:w-auto sm:self-center shrink-0">
                  <button onClick={() => setEditingLesson({ ...lesson })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50" title="Sửa nội dung bài học">
                    <Edit3 className="w-3.5 h-3.5" /> Sửa
                  </button>
                  <details className="relative">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50 [&::-webkit-details-marker]:hidden">
                      <Upload className="h-3.5 w-3.5" /> Học liệu <ChevronDown className="h-3.5 w-3.5" />
                    </summary>
                    <div className="absolute right-0 z-20 mt-1.5 w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
                        <FileText className="h-3.5 w-3.5" /> Tải tài liệu
                        <input type="file" accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadDocument(lesson.id, file); e.currentTarget.value = ''; }} />
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
                        <Video className="h-3.5 w-3.5" /> Tải video
                        <input type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadVideo(lesson.id, file); e.currentTarget.value = ''; }} />
                      </label>
                      {lesson.youtubeVideoId && (
                        <button type="button" onClick={() => void fetchYoutubeTranscript(lesson)} disabled={documentStates[String(lesson.id)] === 'processing'} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-60" title="Lấy phụ đề YouTube, lưu transcript và nhúng AI">
                          <Sparkles className="h-3.5 w-3.5" /> {documentStates[String(lesson.id)] === 'processing' ? 'Đang lấy transcript…' : 'Lấy transcript'}
                        </button>
                      )}
                    </div>
                  </details>
                  <details className="relative">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50 [&::-webkit-details-marker]:hidden">
                      Khác <ChevronDown className="h-3.5 w-3.5" />
                    </summary>
                    <div className="absolute right-0 z-20 mt-1.5 w-48 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                      <Link
                        href={`/courses/${courseId}/learn?lessonId=${lesson.id}`}
                        className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                        title="Mở không gian học của Học viên"
                      >
                        <Eye className="h-3.5 w-3.5" /> Xem trước bài học
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteLesson(lesson.id)}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50"
                        title="Xóa bài học"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Xóa bài học
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            ))}
          </div>
        </div>

        {editingLesson && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/60 p-3 sm:p-4">
            <form onSubmit={saveLessonEdit} className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-2xl sm:max-h-[90vh] sm:p-6">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-primary">Quản lý học liệu</p><h2 className="mt-1 text-lg font-semibold text-foreground">Sửa bài học</h2><p className="mt-1 text-xs text-muted-foreground">Giảng viên phụ trách và Quản trị viên có thể lưu thay đổi.</p></div><button type="button" onClick={() => setEditingLesson(null)} className="text-xs font-bold text-muted-foreground hover:text-foreground">Đóng</button></div>
              <label className="block text-xs font-bold text-foreground">Tiêu đề<input required value={editingLesson.title} onChange={(e) => setEditingLesson({ ...editingLesson, title: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-foreground">Thời lượng (giây)<input type="number" min="0" value={editingLesson.duration || 0} onChange={(e) => setEditingLesson({ ...editingLesson, duration: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label><label className="block text-xs font-bold text-foreground">Liên kết tài liệu<input type="url" value={editingLesson.resources_url || ''} onChange={(e) => setEditingLesson({ ...editingLesson, resources_url: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label></div>
              <label className="block text-xs font-bold text-foreground">URL YouTube hoặc video có URL<input type="url" value={editingLesson.video_url || ''} onChange={(e) => setEditingLesson({ ...editingLesson, video_url: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /><span className="mt-1 block font-normal text-muted-foreground">Đổi video sẽ xóa transcript cũ; sau khi lưu, bấm “Lấy transcript” nếu đó là YouTube.</span></label>
              <label className="block text-xs font-bold text-foreground">Thay video bằng tệp MP4 / WEBM / MOV<input type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" onChange={(e) => setEditingVideoFile(e.target.files?.[0])} className="mt-1 block w-full text-xs" /><span className="mt-1 block font-normal text-muted-foreground">Video tải lên sẽ thay thế video chính sau khi bấm Lưu thay đổi.</span></label>
              <label className="block text-xs font-bold text-foreground">Mô tả<textarea value={editingLesson.description || ''} onChange={(e) => setEditingLesson({ ...editingLesson, description: e.target.value })} className="mt-1 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
              <label className="block text-xs font-bold text-foreground">Transcript thủ công<textarea value={editingLesson.transcript || ''} onChange={(e) => setEditingLesson({ ...editingLesson, transcript: e.target.value })} className="mt-1 min-h-36 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Dán transcript khi video không có phụ đề công khai." /></label>
              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditingLesson(null)} className="w-full rounded-md border border-border px-4 py-2.5 text-xs font-bold text-foreground sm:w-auto">Hủy</button><button type="submit" disabled={isSavingLesson} className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-60 sm:w-auto"><Save className="w-3.5 h-3.5" />{isSavingLesson ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div>
            </form>
          </div>
        )}

        {/* ── Danh sách Bộ đề thi trắc nghiệm của khóa học ── */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md border border-purple-200">
                  Khảo thí & Đánh giá
                </span>
                <span className="text-xs text-slate-400">Đồng bộ PostgreSQL</span>
              </div>
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mt-1">
                Bộ đề thi trắc nghiệm của khóa học ({courseQuizzes.length} đề thi)
              </h2>
              <p className="text-xs text-slate-500">
                Các đề thi này hiển thị tại tab &ldquo;Quiz ôn tập&rdquo; trong phòng học của sinh viên và tính điểm cấp Chứng chỉ.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/quiz/bank"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-indigo-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600" /> Ngân hàng đề thi
              </Link>
              <Link
                href={`/quiz/generate?courseId=${courseId}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Tạo thêm đề với AI
              </Link>
            </div>
          </div>

          {courseQuizzes.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
              <Layers className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-700">Khóa học này chưa có bộ đề thi nào trong PostgreSQL</p>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                Hãy sử dụng Trợ lý AI để tự động tạo bộ câu hỏi Bloom Taxonomy chuẩn giáo trình chỉ trong vài giây.
              </p>
              <Link
                href={`/quiz/generate?courseId=${courseId}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition mt-2 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Tạo đề thi đầu tiên cho khóa này
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {courseQuizzes.map((quiz, qIdx) => (
                <div
                  key={quiz.id}
                  className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-200 hover:shadow-xs transition bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      Q{qIdx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-200">
                          Đề #{quiz.id}
                        </span>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                          {quiz.title}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                        {quiz.description || 'Đề thi trắc nghiệm đánh giá kiến thức bài học.'}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-700">
                          {quiz.questions?.length || 0} câu hỏi
                        </span>
                        <span>•</span>
                        <span>Tự động chấm điểm & cấp chứng chỉ</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <Link
                      href={`/quiz/${quiz.id}?courseId=${courseId}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition"
                      title="Làm thử bài thi như học viên"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Làm thử
                    </Link>
                    <Link
                      href="/quiz/bank"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                      title="Quản lý trong Ngân hàng đề thi"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" /> Xem chi tiết
                    </Link>
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
