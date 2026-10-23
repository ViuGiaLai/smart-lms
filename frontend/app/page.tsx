'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Search,
  ArrowRight,
  BookOpen,
  Brain,
  Users,
  Star,
  Play,
  CheckCircle,
  Sparkles,
  Award,
  ShieldCheck,
  Cpu,
  GraduationCap,
  Layers,
  Database,
  Clock,
  ArrowUpRight,
  BarChart3,
  Zap,
  Check,
  X,
  ChevronRight,
  MessageSquare,
  FileCheck,
  Flame,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { coursesApi, publicApi } from '@/lib/api';

interface CourseItem {
  id: string | number;
  title: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  thumbnail?: string;
  price?: number;
  rating?: number;
  totalStudents?: number;
  totalLessons?: number;
  instructor?: { fullName?: string };
  category?: { name?: string } | string;
  level?: string;
}

export default function HomePage() {
  const router = useRouter();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [courseCategories, setCourseCategories] = useState<
    { name: string; slug: string; count: number }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [platformStats, setPlatformStats] = useState<{
    totalCourses: number;
    totalLessons: number;
    totalStudents: number;
    totalInstructors: number;
  } | null>(null);

  // Tải danh sách khóa học và số liệu thật từ Backend Database
  useEffect(() => {
    let isMounted = true;
    const fetchLandingData = async () => {
      try {
        const [coursesRes, statsRes, categoriesRes] = await Promise.allSettled([
          coursesApi.getAll({ limit: 6 }),
          publicApi.getStats(),
          coursesApi.getCategories(),
        ]);
        if (!isMounted) return;
        if (coursesRes.status === 'fulfilled' && coursesRes.value.data?.data) {
          setCourses(coursesRes.value.data.data);
        }
        if (categoriesRes.status === 'fulfilled' && categoriesRes.value.data?.data) {
          setCourseCategories(categoriesRes.value.data.data);
        }
        if (statsRes.status === 'fulfilled' && statsRes.value.data?.data) {
          setPlatformStats(statsRes.value.data.data);
        }
      } catch (err) {
        console.error('Lỗi tải dữ liệu trang chủ từ Database:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchLandingData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchKeyword.trim()) {
      router.push(`/courses?search=${encodeURIComponent(searchKeyword.trim())}`);
    } else {
      router.push('/courses');
    }
  };



  const categoryVisuals = [
    { match: /python|trí tuệ|tri tue|ai|machine|data science/i, icon: Brain, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
    { match: /backend|api|server|java|node|fastapi/i, icon: Cpu, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { match: /frontend|web|react|next|ui|ux/i, icon: Layers, color: 'text-violet-600 bg-violet-50 border-violet-200' },
    { match: /dữ liệu|du lieu|data|vector|database|sql|devops|cloud/i, icon: Database, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  ];

  const getCategoryVisual = (name: string, index: number) =>
    categoryVisuals.find((item) => item.match.test(name)) ||
    categoryVisuals[index % categoryVisuals.length];

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800 pb-20 md:pb-0">
      <Navbar />

      {/* ── Banner Đề tài Nghiên cứu Khoa học Trường ĐH Đông Á ── */}
      <div id="about" className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white py-2.5 px-4 text-xs border-b border-indigo-950 shadow-inner scroll-mt-20">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex items-center gap-2">
            <span className="bg-indigo-600 text-white font-extrabold px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider">
              NCKH 2026
            </span>
            <span className="font-semibold text-slate-200">
              Trường Đại học Đông Á • Khoa Công nghệ Thông tin • Lớp ST23D
            </span>
          </div>
          <div className="text-slate-400 text-[11px]">
            Nhóm tác giả: <strong className="text-white">Nguyễn Thanh Phước</strong> —{' '}
            <strong className="text-white">Phan Thanh Huy</strong> — <strong className="text-white">Rmah Viu</strong>
          </div>
        </div>
      </div>

      {/* ── Hero Section (Đầy đủ Thanh Tìm Kiếm Trực Tiếp & Lời Kêu Gọi) ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 pt-12 pb-20 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-full text-xs font-bold shadow-2xs border border-indigo-200/80">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              Nền tảng Quản lý Học tập Thông minh Tích hợp Gia sư ảo RAG & AI Quiz Generator
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-tight tracking-tight">
              Học Tập Cá Nhân Hóa Cùng{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700">
                Gia Sư Ảo AI 24/7
              </span>
            </h1>

            <p className="text-sm sm:text-base lg:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
              Giải pháp đột phá khắc phục triệt để nhược điểm của LMS truyền thống: Áp dụng kiến trúc{' '}
              <strong>Lesson-Bounded RAG</strong> bám sát tài liệu bài giảng triệt tiêu hoàn toàn ảo giác (Zero-Hallucination), kết hợp{' '}
              <strong>AI Quiz Generator</strong> tự động hóa 80% thời gian biên soạn ngân hàng câu hỏi chuẩn hóa Bloom.
            </p>

            {/* ── CÔNG CỤ TÌM KIẾM KHÓA HỌC TRỰC TIẾP (SEARCH BAR) ── */}
            <div className="max-w-2xl mx-auto pt-2">
              <form
                onSubmit={handleSearchSubmit}
                className="relative flex items-center bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200 p-2 transition focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent"
              >
                <Search className="w-5 h-5 text-slate-400 ml-3 shrink-0" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="Bạn muốn học gì hôm nay? Tìm kiếm khóa học, Python, FastAPI, Next.js..."
                  className="w-full px-3 py-2.5 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl transition shadow-md shadow-indigo-200 shrink-0 flex items-center gap-1.5"
                >
                  <span>Tìm kiếm</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Từ khóa gợi ý nhanh */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-3 text-xs text-slate-500">
                <span className="font-semibold text-slate-400 text-[11px]">Từ khóa phổ biến:</span>
                {['Python Async', 'FastAPI', 'PostgreSQL pgvector', 'RAG AI', 'Next.js 14'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => router.push(`/courses?search=${encodeURIComponent(tag)}`)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 text-[11px] font-medium transition border border-slate-200"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>


          </div>

          {/* ── Khung Trình Diễn Trực Quan Focus Player & Gia Sư Ảo AI (Interactive Showcase) ── */}
          <div id="features" className="mt-14 max-w-5xl mx-auto bg-slate-900 rounded-3xl p-3 sm:p-5 shadow-2xl border border-slate-800 scroll-mt-24">
            {/* Window bar */}
            <div className="flex items-center justify-between pb-3 px-2 border-b border-slate-800 text-xs text-slate-400 font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500" />
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="ml-3 text-[11px] text-slate-500 hidden sm:inline">smartlms.donga.edu.vn/courses/1/learn</span>
              </div>
              <div className="flex items-center gap-2 text-indigo-400 font-semibold text-[11px]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Lesson-Bounded RAG Active</span>
              </div>
            </div>

            {/* Mockup content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-3">
              {/* Bên trái: Video bài giảng */}
              <div className="lg:col-span-2 rounded-2xl bg-slate-950 border border-slate-800 p-4 flex flex-col justify-between min-h-[260px] relative overflow-hidden group">
                <div className="aspect-video w-full rounded-xl bg-slate-900 flex items-center justify-center relative overflow-hidden">
                  <img
                    src="https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&fit=crop"
                    alt="Video Demo"
                    className="w-full h-full object-cover opacity-60"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent" />
                  <div className="w-14 h-14 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform cursor-pointer">
                    <Play className="w-6 h-6 fill-white ml-0.5" />
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-white">
                    <span className="font-bold">Bài 1: Kiến trúc Python AsyncIO & Event Loop</span>
                    <span className="bg-black/60 px-2 py-0.5 rounded text-[11px] font-mono">24:15 / 45:00</span>
                  </div>
                </div>
                <div className="pt-3 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Đang đồng bộ phụ đề transcript với cơ sở dữ liệu Vector pgvector</span>
                  </div>
                  <span className="text-indigo-400 font-bold">100% Zero-Hallucination</span>
                </div>
              </div>

              {/* Bên phải: Trợ lý AI trả lời tức thì */}
              <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                      AI
                    </div>
                    <span className="text-xs font-bold text-white">Gia sư ảo 24/7</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
                    Trực tuyến
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="bg-slate-900 text-slate-200 p-2.5 rounded-xl rounded-br-xs border border-slate-800 self-end ml-4">
                    <p className="text-[11px] font-medium">Thưa Gia sư, Event Loop khác gì so với Multi-threading truyền thống?</p>
                  </div>

                  <div className="bg-indigo-950/60 text-slate-200 p-3 rounded-xl rounded-bl-xs border border-indigo-900/40 mr-2 space-y-1.5">
                    <p className="text-[11px] leading-relaxed">
                      Dựa trên <strong>Slide số 12 và đoạn video [08:30]</strong>, Event Loop chạy trên mô hình đơn luồng bất đồng bộ (Single-threaded). Khi gặp tác vụ I/O, hệ thống tạm nhường quyền thực thi cho coroutine khác mà không tốn chi phí chuyển đổi ngữ cảnh (Context Switching) như Thread Pool.
                    </p>
                    <div className="pt-1 border-t border-indigo-900/60 flex items-center justify-between text-[10px] text-indigo-300">
                      <span>Trích dẫn: Slide 12 • pgvector Cosine 0.94</span>
                      <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-xl p-2 flex items-center justify-between text-xs text-slate-400 border border-slate-800">
                  <span className="text-[11px]">Hỏi tiếp về đoạn mã lệnh...</span>
                  <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-[10px]">
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Thống Kê Số Liệu Ấn Tượng (Platform Impact Stats) ── */}
      <section className="py-12 bg-indigo-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="space-y-1">
              <p className="text-3xl sm:text-4xl font-black">
                {platformStats ? platformStats.totalStudents.toLocaleString('vi-VN') : '—'}
              </p>
              <p className="text-xs sm:text-sm text-indigo-100 font-medium">Học viên đã đăng ký</p>
            </div>
            <div className="space-y-1">
              <p className="text-3xl sm:text-4xl font-black">
                {platformStats ? platformStats.totalCourses.toLocaleString('vi-VN') : '—'}
              </p>
              <p className="text-xs sm:text-sm text-indigo-100 font-medium">Khóa học đã xuất bản</p>
            </div>
            <div className="space-y-1">
              <p className="text-3xl sm:text-4xl font-black">
                {platformStats ? platformStats.totalLessons.toLocaleString('vi-VN') : '—'}
              </p>
              <p className="text-xs sm:text-sm text-indigo-100 font-medium">Bài giảng đã số hóa</p>
            </div>
            <div className="space-y-1">
              <p className="text-3xl sm:text-4xl font-black">
                {platformStats ? platformStats.totalInstructors.toLocaleString('vi-VN') : '—'}
              </p>
              <p className="text-xs sm:text-sm text-indigo-100 font-medium">Giảng viên phụ trách</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Danh Mục Khóa Học Nổi Bật (Featured Courses Grid) ── */}
      <section className="py-16 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-indigo-600 font-bold text-xs uppercase tracking-wider mb-1">
                <BookOpen className="w-4 h-4" /> Khóa học đào tạo thực chiến
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Khóa học nổi bật tích hợp Trợ lý AI
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Được biên soạn bởi đội ngũ giảng viên Trường ĐH Đông Á kết hợp tài liệu chuẩn quốc tế
              </p>
            </div>

            <Link
              href="/courses"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 rounded-xl transition self-start sm:self-auto"
            >
              Xem toàn bộ danh mục <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div key={n} className="rounded-2xl border border-slate-200 p-4 space-y-3 animate-pulse bg-slate-50">
                  <div className="aspect-video bg-slate-200 rounded-xl" />
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-200 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course) => (
              <Link
                key={course.id}
                href={`/courses/${course.slug || course.id}`}
                className="group bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-indigo-300 shadow-xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="relative aspect-video w-full bg-slate-100 overflow-hidden">
                    <img
                      src={course.thumbnail || 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&fit=crop'}
                      alt={course.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-3 left-3">
                      <span className="text-[10px] font-bold bg-white/90 backdrop-blur-sm text-slate-800 px-2.5 py-1 rounded-full shadow-xs">
                        {typeof course.category === 'object' ? course.category?.name : course.category || 'Công nghệ'}
                      </span>
                    </div>
                    <div className="absolute top-3 right-3">
                      <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-md flex items-center gap-1 shadow-xs">
                        <Sparkles className="w-3 h-3" /> Có AI Tutor
                      </span>
                    </div>
                  </div>

                  <div className="p-5 space-y-3">
                    <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
                      {course.title}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {course.description || course.shortDescription}
                    </p>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        {course.totalStudents ? course.totalStudents.toLocaleString() : '0'} học viên
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                        {course.totalLessons ?? 0} bài học
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-amber-600 font-bold">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {course.rating ? course.rating.toFixed(1) : 'Chưa có đánh giá'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-600 font-medium">
                    {course.instructor?.fullName || 'Chưa cập nhật'}
                  </span>
                  <span className="font-extrabold text-sm text-slate-900">
                    {course.price === 0 ? (
                      <span className="text-emerald-600">Miễn phí</span>
                    ) : (
                      `${Number(course.price).toLocaleString('vi-VN')} đ`
                    )}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>

      {/* ── Khám Phá Theo Chuyên Ngành (Category Explorer) ── */}
      <section className="py-16 bg-slate-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1">
              Định hướng nghề nghiệp
            </h2>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Khám phá các lĩnh vực công nghệ trọng điểm
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Chương trình đào tạo gắn liền với nhu cầu thực tiễn của doanh nghiệp phần mềm
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {courseCategories.map((cat, idx) => {
              const visual = getCategoryVisual(cat.name, idx);
              const Icon = visual.icon;
              return (
                <Link
                  key={cat.slug || idx}
                  href={`/courses?category=${encodeURIComponent(cat.name)}`}
                  className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition flex items-center gap-4 group"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${visual.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs sm:text-sm text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                      {cat.name}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">{cat.count} khóa học</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── BẢNG SO SÁNH ĐỐI THỦ: SMART LMS VS. LMS TRUYỀN THỐNG ── */}
      <section className="py-20 bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center max-w-3xl mx-auto">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
              Lợi thế cạnh tranh vượt trội
            </span>
            <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight mt-3">
              Vì sao Smart LMS vượt trội hơn LMS truyền thống?
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-2">
              So sánh khách quan giữa hệ thống Smart LMS tích hợp AI và các nền tảng thông thường như Moodle, Canvas, Blackboard
            </p>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-200 shadow-sm">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-bold">
                  <th className="p-4 sm:p-5 w-2/5">Tiêu chí so sánh</th>
                  <th className="p-4 sm:p-5 w-3/10 bg-indigo-900/90 text-indigo-200 border-x border-indigo-800">
                    <div className="flex items-center gap-1.5 text-white font-black text-sm">
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      Smart LMS (Đề tài NCKH)
                    </div>
                  </th>
                  <th className="p-4 sm:p-5 w-3/10 text-slate-400">LMS Truyền thống (Moodle / Canvas)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr className="hover:bg-slate-50/50">
                  <td className="p-4 sm:p-5 font-bold text-slate-900">
                    Giải đáp thắc mắc người học
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5">Thời gian và tính sẵn sàng</p>
                  </td>
                  <td className="p-4 sm:p-5 bg-indigo-50/40 border-x border-indigo-100 text-indigo-900 font-semibold">
                    <div className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>Phản hồi trong 1 giây 24/7</strong> với Gia sư ảo AI. Trích dẫn chính xác số trang slide.</span>
                    </div>
                  </td>
                  <td className="p-4 sm:p-5 text-slate-500">
                    <div className="flex items-start gap-2">
                      <X className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>Phải đăng lên diễn đàn và chờ giảng viên từ 24h - 48h.</span>
                    </div>
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50">
                  <td className="p-4 sm:p-5 font-bold text-slate-900">
                    Kiểm soát độ chính xác của AI
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5">Hiện tượng ảo giác (Hallucination)</p>
                  </td>
                  <td className="p-4 sm:p-5 bg-indigo-50/40 border-x border-indigo-100 text-indigo-900 font-semibold">
                    <div className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>Lesson-Bounded RAG</strong> giới hạn nghiêm ngặt chỉ trong bài học, triệt tiêu ảo giác 100%.</span>
                    </div>
                  </td>
                  <td className="p-4 sm:p-5 text-slate-500">
                    <div className="flex items-start gap-2">
                      <X className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>Không có AI, hoặc dùng AI ngoài dễ bị ảo giác thông tin sai lệch.</span>
                    </div>
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50">
                  <td className="p-4 sm:p-5 font-bold text-slate-900">
                    Biên soạn đề thi trắc nghiệm
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5">Áp lực công việc của Giảng viên</p>
                  </td>
                  <td className="p-4 sm:p-5 bg-indigo-50/40 border-x border-indigo-100 text-indigo-900 font-semibold">
                    <div className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>AI Quiz Generator</strong> bóc tách slide và sinh đề 4 lựa chọn chuẩn Bloom trong 5 giây.</span>
                    </div>
                  </td>
                  <td className="p-4 sm:p-5 text-slate-500">
                    <div className="flex items-start gap-2">
                      <X className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>Giảng viên phải gõ tay thủ công từng câu hỏi, mất nhiều ngày.</span>
                    </div>
                  </td>
                </tr>

                <tr className="hover:bg-slate-50/50">
                  <td className="p-4 sm:p-5 font-bold text-slate-900">
                    Trình phát học tập (Learning Player)
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5">Trải nghiệm tương tác đa phương tiện</p>
                  </td>
                  <td className="p-4 sm:p-5 bg-indigo-50/40 border-x border-indigo-100 text-indigo-900 font-semibold">
                    <div className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span><strong>Focus Player</strong> hỗ trợ YouTube/MP4, hiển thị transcript và khung hỏi đáp AI đồng thời.</span>
                    </div>
                  </td>
                  <td className="p-4 sm:p-5 text-slate-500">
                    <div className="flex items-start gap-2">
                      <X className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>Chỉ phát video đơn thuần, học viên xem thụ động không có trợ lý tương tác.</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Quy Trình Học Tập 4 Bước Khoa Học (How It Works) ── */}
      <section className="py-16 bg-slate-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1">
              Phương pháp tiếp cận sư phạm
            </h2>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Lộ trình 4 bước làm chủ tri thức
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3 relative">
              <span className="w-8 h-8 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
                1
              </span>
              <h4 className="font-bold text-sm text-slate-900">Chọn khóa học chuyên sâu</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Đăng ký khóa học phù hợp với định hướng lập trình, trí tuệ nhân tạo hoặc kiến trúc hệ thống.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3 relative">
              <span className="w-8 h-8 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
                2
              </span>
              <h4 className="font-bold text-sm text-slate-900">Xem bài giảng với Focus Player</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Xem video HD, đọc tài liệu slide đính kèm và theo dõi phụ đề transcript được đồng bộ thời gian thực.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3 relative">
              <span className="w-8 h-8 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
                3
              </span>
              <h4 className="font-bold text-sm text-slate-900">Hỏi đáp với Gia sư AI 24/7</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Đặt câu hỏi bất cứ khi nào gặp vướng mắc. AI Tutor trích dẫn số trang slide và giải thích chi tiết.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3 relative">
              <span className="w-8 h-8 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
                4
              </span>
              <h4 className="font-bold text-sm text-slate-900">Làm Quiz & Đánh giá năng lực</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Làm bài trắc nghiệm do AI sinh tự động để củng cố kiến thức và ghi nhận tiến độ học tập xuất sắc.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Kêu Gọi Hành Động (CTA Section) ── */}
      <section className="py-20 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center mx-auto shadow-inner">
            <Sparkles className="w-6 h-6 text-amber-300" />
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
            Sẵn sàng nâng tầm phương pháp học tập của bạn?
          </h2>
          <p className="text-xs sm:text-base text-indigo-200 max-w-2xl mx-auto leading-relaxed">
            Trải nghiệm ngay hệ sinh thái Smart LMS kết hợp Gia sư AI 24/7. Hoàn toàn miễn phí dành cho sinh viên và giảng viên Trường Đại học Đông Á.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/register"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-white text-indigo-900 font-bold text-xs sm:text-sm shadow-xl hover:bg-slate-100 transition"
            >
              Đăng ký tài khoản ngay
            </Link>
            <Link
              href="/courses"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-indigo-700/60 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm border border-indigo-500 transition"
            >
              Khám phá danh mục khóa học
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer Học Thuật Toàn Diện ── */}
      <footer className="bg-slate-950 text-slate-400 py-12 text-xs border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-3 md:col-span-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <Brain className="w-5 h-5" />
                </div>
                <span className="text-white font-extrabold text-base tracking-tight">Smart LMS</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Đề tài Nghiên cứu Khoa học công nghệ phần mềm ứng dụng AI. Hệ thống quản lý học tập tích hợp Trợ lý Gia sư ảo RAG và AI Quiz Generator.
              </p>
              <p className="text-[11px] text-indigo-400 font-semibold">Trường Đại học Đông Á • Lớp ST23D</p>
            </div>

            <div className="space-y-2">
              <p className="text-white font-bold uppercase tracking-wider text-[11px]">Khóa học & Học liệu</p>
              <ul className="space-y-1.5 text-slate-400">
                <li><Link href="/courses" className="hover:text-white transition">Danh mục khóa học</Link></li>
                {courses.slice(0, 3).map((course) => (
                  <li key={course.id}>
                    <Link
                      href={`/courses/${course.slug || course.id}`}
                      className="hover:text-white transition line-clamp-1"
                    >
                      {course.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-white font-bold uppercase tracking-wider text-[11px]">Công nghệ & Tính năng</p>
              <ul className="space-y-1.5 text-slate-400">
                <li>
                  <Link
                    href={
                      courses[0]
                        ? `/courses/${courses[0].slug || courses[0].id}/learn`
                        : '/courses'
                    }
                    className="hover:text-white transition"
                  >
                    Focus Player & AI Tutor
                  </Link>
                </li>
                <li><Link href="/quiz/generate" className="hover:text-white transition">AI Quiz Generator</Link></li>
                <li><Link href="/dashboard" className="hover:text-white transition">Theo dõi tiến độ học tập</Link></li>
                <li><Link href="/admin-dashboard" className="hover:text-white transition">Hạ tầng PostgreSQL pgvector</Link></li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-white font-bold uppercase tracking-wider text-[11px]">Nhóm tác giả đề tài</p>
              <div className="text-[11px] text-slate-400 space-y-1">
                <p>• <strong>Nguyễn Thanh Phước</strong> (Trưởng nhóm)</p>
                <p>• <strong>Phan Thanh Huy</strong> (Thành viên)</p>
                <p>• <strong>Rmah Viu</strong> (Thành viên)</p>
                <p className="pt-2 text-slate-500">GVHD: Khoa Công nghệ Thông tin, Đại học Đông Á</p>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
            <p>© {new Date().getFullYear()} Smart LMS - Trường Đại học Đông Á. Mọi quyền được bảo lưu.</p>
            <div className="flex gap-4">
              <Link href="/login" className="hover:text-slate-300 transition">Đăng nhập</Link>
              <Link href="/register" className="hover:text-slate-300 transition">Đăng ký</Link>
              <Link href="/admin-dashboard" className="hover:text-slate-300 transition">Quản trị hệ thống</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
