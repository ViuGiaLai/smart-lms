'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
  outcomes?: string[];
  prerequisites?: string[];
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
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState('');

  const isOwner = Boolean(
    currentUser?.id &&
    course?.instructor?.id &&
    String(currentUser.id) === String(course.instructor.id)
  );
  const isAdmin = currentUser?.role === 'admin';
  const isStudent = currentUser?.role === 'student';

  // Học viên phải có bản ghi ghi danh thì mới được ghi tiến độ / nhận chứng chỉ.
  useEffect(() => {
    if (!isStudent) return;
    let isMounted = true;
    coursesApi
      .getEnrolled()
      .then((res) => {
        if (!isMounted) return;
        const list = res.data?.data || [];
        setIsEnrolled(
          list.some((item: any) => String(item.courseId ?? item.course?.id) === String(courseId))
        );
      })
      .catch(() => {
        // Không chặn trang nếu không đọc được trạng thái ghi danh.
      });
    return () => {
      isMounted = false;
    };
  }, [isStudent, courseId]);

  const handleEnrollAndLearn = async () => {
    if (!course) return;
    setEnrollError('');
    if (!currentUser) {
      // Khách chưa đăng nhập: đưa tới trang đăng nhập thay vì gọi API và nhận 401.
      router.push('/login');
      return;
    }
    setEnrolling(true);
    try {
      await coursesApi.enroll(course.id);
      setIsEnrolled(true);
      const firstId = course.lessons?.[0]?.id ?? '1';
      router.push(`/courses/${course.id}/learn?lessonId=${firstId}`);
    } catch (err: any) {
      setEnrollError(
        err?.response?.data?.detail || 'Không thể ghi danh khóa học. Vui lòng thử lại.'
      );
    } finally {
      setEnrolling(false);
    }
  };

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
            outcomes: apiCourse.outcomes || [],
            prerequisites: apiCourse.prerequisites || [],
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
      <div className="min-h-screen bg-stone-50 font-sans pb-36 md:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-semibold text-stone-600">Đang nạp dữ liệu khóa học từ cơ sở dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-stone-50 font-sans pb-36 md:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <p className="text-base font-bold text-stone-800 mb-2">{error || 'Không tìm thấy khóa học'}</p>
          <Link href="/courses" className="inline-block px-4 py-2 bg-brand-600 text-white rounded-lg text-xs font-bold">
            Quay lại danh sách khóa học
          </Link>
        </div>
      </div>
    );
  }

  const firstLessonId = course.lessons && course.lessons.length > 0 ? course.lessons[0].id : '1';

  return (
    <div className="min-h-screen bg-stone-50 font-sans pb-36 md:pb-16">
      {/* ── Breadcrumb Header ── */}
      <div className="bg-white border-b border-stone-200 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 text-xs text-stone-500">
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push('/courses');
              }
            }}
            className="inline-flex items-center gap-1 text-stone-600 hover:text-brand-600 font-bold transition mr-1 bg-stone-50 hover:bg-brand-50 border border-stone-200 px-2.5 py-1 rounded-lg"
            title="Quay lại trang trước đó"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại</span>
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-stone-300" />
          <Link href="/courses" className="hover:text-brand-600 transition">
            Khóa học
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-stone-800 font-medium truncate max-w-xs">{course.title}</span>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Cột chính: Thông tin khóa học & Đề cương */}
          <div className="lg:col-span-2 space-y-6">
            {/* Banner chính */}
            <div className="bg-white rounded-lg p-6 sm:p-8 border border-stone-200/90 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-100">
                  <Sparkles className="w-3.5 h-3.5 text-brand-600" /> Có Trợ lý AI Gia sư 24/7
                </span>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-stone-100 text-stone-600">
                  {typeof course.category === 'object' ? course.category?.name : course.category || 'Công nghệ'}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 leading-tight">
                {course.title}
              </h1>

              <p className="text-stone-600 text-xs sm:text-sm leading-relaxed">
                {course.description}
              </p>

              {/* Meta stats */}
              <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-3 text-xs text-stone-600 font-medium border-t border-stone-100">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-stone-400" />
                  <span>{course.totalStudents?.toLocaleString()} học viên</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-stone-400" />
                  <span>{course.duration}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-stone-400" />
                  <span>{course.lessons?.length || course.totalLessons} bài học</span>
                </div>
                {course.rating ? (
                  <div className="flex items-center gap-1.5 text-amber-600 font-bold">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span>{course.rating.toFixed(1)} / 5.0</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-stone-400">
                    <Star className="w-4 h-4 text-stone-300" />
                    <span>Chưa có đánh giá</span>
                  </div>
                )}
              </div>

              {/* Giảng viên */}
              <div className="flex items-center gap-3 pt-2">
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 font-bold text-sm flex items-center justify-center">
                  GV
                </div>
                <div>
                  <p className="text-[11px] text-stone-400">Giảng viên phụ trách</p>
                  <p className="text-xs sm:text-sm font-bold text-stone-800">
                    {course.instructor?.fullName || 'Chưa cập nhật'}
                  </p>
                </div>
              </div>
            </div>

            {/* Mục tiêu học tập & Yêu cầu tiên quyết (dữ liệu giảng viên nhập trong DB) */}
            {((course.outcomes?.length ?? 0) > 0 || (course.prerequisites?.length ?? 0) > 0) && (
              <div className="bg-white rounded-lg p-6 sm:p-8 border border-stone-200/90 shadow-xs space-y-4">
                {(course.outcomes?.length ?? 0) > 0 && (
                  <>
                    <h2 className="text-base font-semibold text-stone-900 uppercase tracking-wider">
                      Bạn sẽ đạt được gì sau khóa học?
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-stone-700">
                      {(course.outcomes ?? []).map((item, idx) => (
                        <div key={idx} className="flex items-start gap-2.5">
                          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {(course.prerequisites?.length ?? 0) > 0 && (
                  <div className="pt-4 border-t border-stone-100 space-y-2">
                    <h3 className="text-base font-semibold text-stone-900 uppercase tracking-wider">
                      Yêu cầu tiên quyết
                    </h3>
                    <ul className="list-disc pl-5 text-xs text-stone-700 space-y-1">
                      {(course.prerequisites ?? []).map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Giáo trình bài giảng (Curriculum) */}
            <div className="bg-white rounded-lg p-6 sm:p-8 border border-stone-200/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-stone-900 uppercase tracking-wider">
                    Giáo trình bài học ({course.lessons?.length || 0} bài)
                  </h2>
                  <p className="text-xs text-stone-500">Bao gồm video bài giảng, tài liệu slide và đề thi AI ôn tập</p>
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                {course.lessons?.map((lesson, idx) => (
                  <div
                    key={lesson.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-lg border border-stone-200/80 hover:border-brand-300 hover:bg-brand-50/20 transition group gap-3"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-stone-100 text-stone-600 font-bold text-xs flex items-center justify-center group-hover:bg-brand-600 group-hover:text-white transition shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <h3 className="text-xs sm:text-sm font-semibold text-stone-800 leading-snug">
                          {lesson.title}
                        </h3>
                        <div className="flex items-center gap-3 text-[11px] text-stone-500 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-stone-400" />
                            {formatLessonDuration(lesson)}
                          </span>
                          <span>•</span>
                          <span className="text-brand-600 font-medium">Hỗ trợ AI Tutor</span>
                        </div>
                      </div>
                    </div>

                    {isStudent && !isEnrolled ? (
                      // Chưa ghi danh: ghi danh trước rồi mới vào bài, nếu không backend sẽ từ chối lưu tiến độ.
                      <button
                        type="button"
                        onClick={handleEnrollAndLearn}
                        disabled={enrolling}
                        className="self-end sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 group-hover:bg-brand-600 text-brand-700 group-hover:text-white text-xs font-bold transition shadow-xs disabled:opacity-60"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        Đăng ký & học
                      </button>
                    ) : (
                      <Link
                        href={`/courses/${course.id}/learn?lessonId=${lesson.id}`}
                        className="self-end sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 group-hover:bg-brand-600 text-brand-700 group-hover:text-white text-xs font-bold transition shadow-xs"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        Học bài
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cột bên phải: Thẻ hành động tham gia khóa học (Sticky Card) */}
          <div className="space-y-5 lg:sticky lg:top-6">
            <div className="bg-white rounded-lg p-6 border border-stone-200/90 shadow-md space-y-5 overflow-hidden">
              {/* Thumbnail */}
              <div className="aspect-video w-full rounded-lg overflow-hidden bg-stone-100 relative group">
                {course.thumbnail ? (
                  <Image
                    src={course.thumbnail}
                    alt={course.title}
                    fill
                    sizes="(max-width: 1024px) 100vw, 420px"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-brand-800">
                    <BookOpen className="w-16 h-16 text-white/90" />
                  </div>
                )}
                <div className="absolute inset-0 bg-stone-900/30 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/90 text-brand-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <PlayCircle className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Học phí */}
              <div className="flex items-baseline justify-between border-b border-stone-100 pb-4">
                <div>
                  <span className="text-2xl font-semibold text-stone-900">
                    {course.price === 0 ? 'Miễn phí' : `${Number(course.price).toLocaleString('vi-VN')} đ`}
                  </span>
                </div>
              </div>

              {/* Nút hành động chính theo quyền sở hữu thực tế */}
              {isOwner ? (
                <div className="space-y-2.5">
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Bạn là Giảng viên phụ trách khóa học này</span>
                  </div>
                  <Link
                    href={`/courses/${course.id}/learn?lessonId=${firstLessonId}&preview=true`}
                    className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold py-3.5 rounded-lg shadow-md shadow-brand-100 transition"
                  >
                    <Eye className="w-4 h-4" /> Xem trước bài giảng (Focus Player)
                  </Link>
                  <Link
                    href={`/courses/${course.id}/manage`}
                    className="w-full flex items-center justify-center gap-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold py-3 rounded-lg transition"
                  >
                    <BookOpen className="w-4 h-4" /> Quản lý học liệu & Soạn bài học
                  </Link>
                </div>
              ) : isAdmin ? (
                <div className="space-y-2.5">
                  <div className="p-3 rounded-lg bg-stone-100 border border-stone-300 text-stone-800 text-xs font-semibold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-stone-700 shrink-0" />
                    <span>Quyền Quản trị viên: Kiểm duyệt khóa học</span>
                  </div>
                  <Link
                    href={`/courses/${course.id}/learn?lessonId=${firstLessonId}&preview=true`}
                    className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold py-3.5 rounded-lg shadow-md shadow-brand-100 transition"
                  >
                    <Eye className="w-4 h-4" /> Xem bài giảng (Chế độ Kiểm duyệt)
                  </Link>
                  <Link
                    href={`/courses/${course.id}/manage`}
                    className="w-full flex items-center justify-center gap-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold py-3 rounded-lg transition"
                  >
                    <BookOpen className="w-4 h-4" /> Kiểm duyệt & Quản lý học liệu
                  </Link>
                </div>
              ) : isEnrolled ? (
                <Link
                  href={`/courses/${course.id}/learn?lessonId=${firstLessonId}`}
                  className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold py-3.5 rounded-lg shadow-md shadow-brand-100 transition"
                >
                  <PlayCircle className="w-5 h-5" /> Vào học ngay
                </Link>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleEnrollAndLearn}
                    disabled={enrolling}
                    className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-bold py-3.5 rounded-lg shadow-md shadow-brand-100 transition"
                  >
                    <PlayCircle className="w-5 h-5" />
                    {enrolling
                      ? 'Đang ghi danh...'
                      : !currentUser
                        ? 'Đăng nhập để đăng ký học'
                        : course.price === 0
                          ? 'Đăng ký học miễn phí'
                          : 'Đăng ký học ngay'}
                  </button>
                  {enrollError && (
                    <p role="alert" className="text-[11px] font-medium text-rose-600 text-center">
                      {enrollError}
                    </p>
                  )}
                </div>
              )}

              {/* Quyền lợi khóa học */}
              <div className="space-y-3 pt-2 text-xs text-stone-600">
                <p className="font-bold text-stone-800 uppercase text-[11px] tracking-wider">
                  Khóa học bao gồm:
                </p>
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-brand-600 shrink-0" />
                  <span>Trình phát Focus Player độ nét cao Full HD</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-600 shrink-0" />
                  <span>Gia sư AI hỏi đáp trực tiếp theo bài học (RAG)</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-600 shrink-0" />
                  <span>Học liệu PDF & Slide bài giảng đính kèm</span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-brand-600 shrink-0" />
                  <span>Bộ đề thi trắc nghiệm AI kiểm tra nhận thức</span>
                </div>
              </div>
            </div>

            {/* Thông tin bảo trợ học thuật */}
            <div className="bg-brand-50/70 border border-brand-100 rounded-lg p-4 text-xs text-brand-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldCheck className="w-4 h-4 text-brand-600" />
                <span>Bảo chứng Học thuật & NCKH</span>
              </div>
              <p className="text-[11px] text-brand-700/90 leading-relaxed">
                Đề tài NCKH Smart LMS • Trường Đại học Đông Á. Dữ liệu bài giảng được kiểm duyệt sư phạm trước khi nạp vào pgvector.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ── Mobile Sticky Bottom Enrollment Bar ── */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-stone-200/90 bg-white/95 px-4 pt-2.5 pb-safe shadow-xl backdrop-blur-md">
        <div>
          <span className="text-base font-bold text-stone-900 block leading-tight">
            {course.price === 0 ? 'Miễn phí' : `${Number(course.price).toLocaleString('vi-VN')} đ`}
          </span>
          <span className="text-[10px] text-emerald-600 font-bold">
            {course.price === 0 ? 'Học bổng NCKH' : 'Bảo đảm kiến thức'}
          </span>
        </div>

        {isOwner ? (
          <Link
            href={`/courses/${course.id}/learn?lessonId=${firstLessonId}&preview=true`}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 active:scale-95 text-white text-xs font-bold py-2.5 px-4 rounded-lg transition"
          >
            <Eye className="w-4 h-4" />
            <span>Xem trước</span>
          </Link>
        ) : isAdmin ? (
          <Link
            href={`/courses/${course.id}/manage`}
            className="inline-flex items-center gap-1.5 bg-stone-800 hover:bg-stone-900 active:scale-95 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-md shadow-stone-200 transition"
          >
            <BookOpen className="w-4 h-4" />
            <span>Kiểm duyệt</span>
          </Link>
        ) : isEnrolled ? (
          <Link
            href={`/courses/${course.id}/learn?lessonId=${firstLessonId}`}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 active:scale-95 text-white text-xs font-bold py-2.5 px-5 rounded-lg transition"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Vào học ngay</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleEnrollAndLearn}
            disabled={enrolling}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 active:scale-95 text-white text-xs font-bold py-2.5 px-5 rounded-lg transition"
          >
            <PlayCircle className="w-4 h-4" />
            <span>{enrolling ? 'Đang ghi danh...' : 'Đăng ký học'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
