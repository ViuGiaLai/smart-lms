'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Users,
  PlayCircle,
  CheckCircle,
  Sparkles,
  Award,
  ShieldCheck,
  ChevronRight,
  Video,
  FileText,
  Star,
  Share2,
  Eye,
  GraduationCap,
} from 'lucide-react';
import { coursesApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface LessonDetail {
  id: string | number;
  title: string;
  duration?: string | number;
  durationText?: string;
  order?: number;
  isFree?: boolean;
}

function formatLessonDuration(lesson: LessonDetail): string {
  if (lesson.durationText) return lesson.durationText;
  if (typeof lesson.duration === 'number') {
    const minutes = Math.round(lesson.duration / 60);
    return minutes > 0 ? `${minutes} phút` : '0 phút';
  }
  return lesson.duration || 'Chưa cập nhật';
}

interface CourseDetail {
  id: string;
  title: string;
  description: string;
  instructor?: {
    id?: string | number;
    fullName?: string;
  };
  duration?: number | string;
  durationText?: string;
  totalLessons?: number;
  totalStudents?: number;
  price?: number;
  thumbnail?: string;
  category?: {
    name?: string;
  };
  level?: string;
  rating?: number;
  lessons?: LessonDetail[];
}

export default function CourseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = (params?.id as string) || '';
  const { user: currentUser, isLoading: authLoading } = useAuth();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isOwner = Boolean(
    currentUser?.id &&
    course?.instructor?.id &&
    String(currentUser.id) === String(course.instructor.id)
  );
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    let isMounted = true;
    const fetchCourse = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = /^\d+$/.test(courseId)
          ? await coursesApi.getById(courseId)
          : await coursesApi.getBySlug(courseId);
        if (res.data?.data && isMounted) {
          const apiCourse = res.data.data;
          setCourse({
            id: String(apiCourse.id),
            title: apiCourse.title,
            description: apiCourse.description || 'Khóa học đào tạo trực tuyến chuẩn chất lượng.',
            instructor: apiCourse.instructor || { fullName: 'Chưa cập nhật' },
            duration:
              apiCourse.durationText ||
              (apiCourse.duration ? `${Math.round(apiCourse.duration / 3600)} giờ học` : 'Tự học theo tiến độ'),
            totalLessons: apiCourse.lessons?.length || apiCourse.totalLessons || 0,
            totalStudents: apiCourse.totalStudents || 0,
            price: typeof apiCourse.price === 'number' ? apiCourse.price : 0,
            thumbnail: apiCourse.thumbnail || '',
            category: apiCourse.category || { name: 'Chưa phân loại' },
            level: apiCourse.level || 'Chưa phân loại',
            rating: apiCourse.rating ?? undefined,
            lessons: apiCourse.lessons || [],
          });
        }
      } catch (err: any) {
        if (isMounted) {
          setError('Không tìm thấy thông tin khóa học hoặc khóa học chưa được kích hoạt.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchCourse();
    return () => {
      isMounted = false;
    };
  }, [courseId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans pb-36 md:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-semibold text-slate-600">Đang nạp dữ liệu khóa học từ cơ sở dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans pb-36 md:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <p className="text-base font-bold text-slate-800 mb-2">{error || 'Không tìm thấy khóa học'}</p>
          <Link href="/courses" className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold">
            Quay lại danh sách khóa học
          </Link>
        </div>
      </div>
    );
  }

  const firstLessonId = course.lessons && course.lessons.length > 0 ? course.lessons[0].id : '1';

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-36 md:pb-16">
      {/* ── Breadcrumb Header ── */}
      <div className="bg-white border-b border-slate-200 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 text-xs text-slate-500">
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push('/courses');
              }
            }}
            className="inline-flex items-center gap-1 text-slate-600 hover:text-indigo-600 font-bold transition mr-1 bg-slate-50 hover:bg-indigo-50 border border-slate-200 px-2.5 py-1 rounded-lg"
            title="Quay lại trang trước đó"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại</span>
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <Link href="/courses" className="hover:text-indigo-600 transition">
            Khóa học
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-800 font-medium truncate max-w-xs">{course.title}</span>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Cột chính: Thông tin khóa học & Đề cương */}
          <div className="lg:col-span-2 space-y-6">
            {/* Banner chính */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Có Trợ lý AI Gia sư 24/7
                </span>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                  {typeof course.category === 'object' ? course.category?.name : course.category || 'Công nghệ'}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                {course.title}
              </h1>

              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                {course.description}
              </p>

              {/* Meta stats */}
              <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-3 text-xs text-slate-600 font-medium border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span>{course.totalStudents?.toLocaleString()} học viên</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>{course.duration}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-slate-400" />
                  <span>{course.lessons?.length || course.totalLessons} bài học</span>
                </div>
                {course.rating ? (
                  <div className="flex items-center gap-1.5 text-amber-600 font-bold">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span>{course.rating.toFixed(1)} / 5.0</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Star className="w-4 h-4 text-slate-300" />
                    <span>Chưa có đánh giá</span>
                  </div>
                )}
              </div>

              {/* Giảng viên */}
              <div className="flex items-center gap-3 pt-2">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center">
                  GV
                </div>
                <div>
                  <p className="text-[11px] text-slate-400">Giảng viên phụ trách</p>
                  <p className="text-xs sm:text-sm font-bold text-slate-800">
                    {course.instructor?.fullName || 'Chưa cập nhật'}
                  </p>
                </div>
              </div>
            </div>

            {/* Mục tiêu học tập */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-xs space-y-4">
              <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-wider">
                Bạn sẽ đạt được gì sau khóa học?
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
                <div className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Làm chủ nền tảng kiến thức và các chuyên đề thực tiễn của {course.title}.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Thực hành trực tiếp qua các bài học, bài tập tình huống và tài liệu chuyên sâu.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Học tập tương tác 24/7 cùng Trợ lý Gia sư AI thông minh bám sát nội dung bài học.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Làm bài kiểm tra trắc nghiệm AI để củng cố nhận thức và đánh giá sự tiến bộ.</span>
                </div>
              </div>
            </div>

            {/* Giáo trình bài giảng (Curriculum) */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-wider">
                    Giáo trình bài học ({course.lessons?.length || 0} bài)
                  </h2>
                  <p className="text-xs text-slate-500">Bao gồm video bài giảng, tài liệu slide và đề thi AI ôn tập</p>
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                {course.lessons?.map((lesson, idx) => (
                  <div
                    key={lesson.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/20 transition group gap-3"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-800 leading-snug">
                          {lesson.title}
                        </h3>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {formatLessonDuration(lesson)}
                          </span>
                          <span>•</span>
                          <span className="text-indigo-600 font-medium">Hỗ trợ AI Tutor</span>
                        </div>
                      </div>
                    </div>

                    <Link
                      href={`/courses/${course.id}/learn?lessonId=${lesson.id}`}
                      className="self-end sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 group-hover:bg-indigo-600 text-indigo-700 group-hover:text-white text-xs font-bold transition shadow-xs"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      Học bài
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cột bên phải: Thẻ hành động tham gia khóa học (Sticky Card) */}
          <div className="space-y-5 lg:sticky lg:top-6">
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-md space-y-5 overflow-hidden">
              {/* Thumbnail */}
              <div className="aspect-video w-full rounded-2xl overflow-hidden bg-slate-100 relative group">
                {course.thumbnail ? (
                  <img
                    src={course.thumbnail}
                    alt={course.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600">
                    <BookOpen className="w-16 h-16 text-white/90" />
                  </div>
                )}
                <div className="absolute inset-0 bg-slate-900/30 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/90 text-indigo-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <PlayCircle className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Học phí */}
              <div className="flex items-baseline justify-between border-b border-slate-100 pb-4">
                <div>
                  <span className="text-2xl font-extrabold text-slate-900">
                    {course.price === 0 ? 'Miễn phí' : `${Number(course.price).toLocaleString('vi-VN')} đ`}
                  </span>
                </div>
              </div>

              {/* Nút hành động chính theo quyền sở hữu thực tế */}
              {isOwner ? (
                <div className="space-y-2.5">
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Bạn là Giảng viên phụ trách khóa học này</span>
                  </div>
                  <Link
                    href={`/courses/${course.id}/learn?lessonId=${firstLessonId}&preview=true`}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-3.5 rounded-2xl shadow-md shadow-indigo-100 transition"
                  >
                    <Eye className="w-4 h-4" /> Xem trước bài giảng (Focus Player)
                  </Link>
                  <Link
                    href={`/courses/${course.id}/manage`}
                    className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-3 rounded-2xl transition"
                  >
                    <BookOpen className="w-4 h-4" /> Quản lý học liệu & Soạn bài học
                  </Link>
                </div>
              ) : isAdmin ? (
                <div className="space-y-2.5">
                  <div className="p-3 rounded-2xl bg-slate-100 border border-slate-300 text-slate-800 text-xs font-semibold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-slate-700 shrink-0" />
                    <span>Quyền Quản trị viên: Kiểm duyệt khóa học</span>
                  </div>
                  <Link
                    href={`/courses/${course.id}/learn?lessonId=${firstLessonId}&preview=true`}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-3.5 rounded-2xl shadow-md shadow-indigo-100 transition"
                  >
                    <Eye className="w-4 h-4" /> Xem bài giảng (Chế độ Kiểm duyệt)
                  </Link>
                  <Link
                    href={`/courses/${course.id}/manage`}
                    className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-3 rounded-2xl transition"
                  >
                    <BookOpen className="w-4 h-4" /> Kiểm duyệt & Quản lý học liệu
                  </Link>
                </div>
              ) : (
                <Link
                  href={`/courses/${course.id}/learn?lessonId=${firstLessonId}`}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-3.5 rounded-2xl shadow-md shadow-indigo-100 transition"
                >
                  <PlayCircle className="w-5 h-5" /> Bắt đầu vào học ngay
                </Link>
              )}

              {/* Quyền lợi khóa học */}
              <div className="space-y-3 pt-2 text-xs text-slate-600">
                <p className="font-bold text-slate-800 uppercase text-[11px] tracking-wider">
                  Khóa học bao gồm:
                </p>
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Trình phát Focus Player độ nét cao Full HD</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Gia sư AI hỏi đáp trực tiếp theo bài học (RAG)</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Học liệu PDF & Slide bài giảng đính kèm</span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Bộ đề thi trắc nghiệm AI kiểm tra nhận thức</span>
                </div>
              </div>
            </div>

            {/* Thông tin bảo trợ học thuật */}
            <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span>Bảo chứng Học thuật & NCKH</span>
              </div>
              <p className="text-[11px] text-indigo-700/90 leading-relaxed">
                Đề tài NCKH Smart LMS • Trường Đại học Đông Á. Dữ liệu bài giảng được kiểm duyệt sư phạm trước khi nạp vào pgvector.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ── Mobile Sticky Bottom Enrollment Bar ── */}
      <div className="md:hidden fixed bottom-16 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-4 py-2.5 z-40 flex items-center justify-between shadow-xl">
        <div>
          <span className="text-base font-black text-slate-900 block leading-tight">
            {course.price === 0 ? 'Miễn phí' : `${Number(course.price).toLocaleString('vi-VN')} đ`}
          </span>
          <span className="text-[10px] text-emerald-600 font-bold">
            {course.price === 0 ? 'Học bổng NCKH' : 'Bảo đảm kiến thức'}
          </span>
        </div>

        {isOwner ? (
          <Link
            href={`/courses/${course.id}/learn?lessonId=${firstLessonId}&preview=true`}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-md shadow-indigo-200 transition"
          >
            <Eye className="w-4 h-4" />
            <span>Xem trước</span>
          </Link>
        ) : isAdmin ? (
          <Link
            href={`/courses/${course.id}/manage`}
            className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-md shadow-slate-200 transition"
          >
            <BookOpen className="w-4 h-4" />
            <span>Kiểm duyệt</span>
          </Link>
        ) : (
          <Link
            href={`/courses/${course.id}/learn?lessonId=${firstLessonId}`}
            className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow-md shadow-indigo-200 transition"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Vào học ngay</span>
          </Link>
        )}
      </div>
    </div>
  );
}
