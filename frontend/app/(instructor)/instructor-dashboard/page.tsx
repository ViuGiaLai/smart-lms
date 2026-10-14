'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PlusCircle,
  Sparkles,
  BookOpen,
  Users,
  Settings,
  ArrowUpRight,
  Eye,
  CheckCircle2,
  Video,
  FileCheck,
  TrendingUp,
  Layers,
} from 'lucide-react';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { instructorApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function InstructorDashboardPage() {
  const { isAuthorized } = useRoleGuard(['instructor', 'admin']);
  const { user: instructorUser, isLoading: authLoading } = useAuth();

  const [courses, setCourses] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

useEffect(() => {
      if (!isAuthorized || authLoading) return;
      let isMounted = true;
      const fetchData = async () => {
      try {
        const [coursesRes, statsRes] = await Promise.allSettled([
          instructorApi.getCourses(),
          instructorApi.getDashboardStats(),
        ]);

        if (isMounted) {
          if (coursesRes.status === 'fulfilled' && coursesRes.value.data?.data) {
            const apiCourses = coursesRes.value.data.data.map((c: any) => ({
              id: String(c.id),
              title: c.title,
              category:
                typeof c.category === 'object' && c.category?.name
                  ? c.category.name
                  : typeof c.category === 'string'
                  ? c.category
                  : 'Công nghệ phần mềm',
              studentsCount: c.studentsCount ?? c.totalStudents ?? 0,
              lessonsCount: c.lessons?.length ?? c.totalLessons ?? 0,
              status: c.status === 'published' ? 'Đã xuất bản' : 'Bản nháp',
              thumbnail: c.thumbnail || 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&fit=crop',
            }));
            setCourses(apiCourses);
          }
          if (statsRes.status === 'fulfilled' && statsRes.value.data?.data) {
            setStats(statsRes.value.data.data);
          }
        }
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu bảng điều khiển giảng viên:', err);
      }
    };
    fetchData();
    return () => {
      isMounted = false;
    };
  }, [isAuthorized, authLoading]);

  if (!isAuthorized || authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse text-xs font-semibold text-slate-500">
          Đang xác thực quyền Giảng viên...
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-200">
                Phân hệ Giảng viên (Instructor Panel)
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Bảng điều khiển Giảng viên {instructorUser?.name ? `• ${instructorUser.name}` : ''}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Quản lý học liệu, chèn video YouTube, số hóa tài liệu RAG và sử dụng công cụ AI tự động sinh đề thi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/quiz/bank"
              className="inline-flex items-center gap-2 text-xs font-bold bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 px-4 py-2.5 rounded-xl shadow-xs transition"
            >
              <Layers className="w-4 h-4 text-indigo-600" /> Ngân hàng đề thi
            </Link>

            <Link
              href="/quiz/generate"
              className="inline-flex items-center gap-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-md shadow-emerald-200 transition"
            >
              <Sparkles className="w-4 h-4" /> AI Sinh đề trắc nghiệm
            </Link>

            <Link
              href="/courses/create"
              className="inline-flex items-center gap-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl shadow-md shadow-indigo-200 transition"
            >
              <PlusCircle className="w-4 h-4" /> Tạo khóa học mới
            </Link>
          </div>
        </div>

        {/* Thống kê hiệu suất giảng dạy & Khảo thí */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Khóa học phụ trách</p>
              <p className="text-xl font-extrabold text-slate-900">{stats?.totalCourses ?? courses.length}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Tổng sinh viên theo học</p>
              <p className="text-xl font-extrabold text-slate-900">
                {stats?.totalStudents ?? courses.reduce((acc, c) => acc + (c.studentsCount || 0), 0)}
              </p>
            </div>
          </div>

          <Link
            href="/quiz/bank"
            className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition flex items-center justify-between group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 group-hover:bg-indigo-600 group-hover:text-white transition flex items-center justify-center font-bold">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Ngân hàng đề thi</p>
                <p className="text-xl font-extrabold text-slate-900">
                  {stats?.totalQuizzes ?? 0} bộ đề
                </p>
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition" />
          </Link>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Tổng số bài học</p>
              <p className="text-xl font-extrabold text-slate-900">
                {stats?.totalLessons ?? courses.reduce((acc: number, c: any) => acc + (c.lessonsCount || 0), 0)} bài
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Trạng thái AI Tutor & RAG</p>
              <p className="text-xl font-extrabold text-slate-900">Hoạt động</p>
            </div>
          </div>
        </div>

        {/* Danh sách Khóa học đang quản lý */}
        <section id="courses" tabIndex={-1} className="scroll-mt-24 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6 focus:outline-none">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-wider">
                Khóa học & Học liệu phụ trách
              </h2>
              <p className="text-xs text-slate-500">Bấm Quản lý để thêm bài học, dán link YouTube và nạp tài liệu cho AI Tutor</p>
            </div>
            <span className="text-xs font-bold text-slate-400">{courses.length} khóa học</span>
          </div>

          {courses.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">Chưa có khóa học nào được phân công</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">Bạn có thể tạo mới khóa học hoặc liên hệ Quản trị viên để phân công chuyên đề.</p>
              <Link
                href="/courses/create"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow hover:bg-indigo-700 transition"
              >
                <PlusCircle className="w-4 h-4" /> Tạo khóa học đầu tiên
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {courses.map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl border border-slate-200 hover:border-indigo-300 transition bg-white shadow-xs overflow-hidden flex flex-col group"
                >
                  <div className="relative aspect-video w-full bg-slate-100 overflow-hidden">
                    <img
                      src={c.thumbnail}
                      alt={c.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-2.5 left-2.5">
                      <span className="text-[10px] font-bold bg-white/90 backdrop-blur-sm text-slate-800 px-2 py-0.5 rounded-full shadow-xs">
                        {typeof c.category === 'object' && c.category ? (c.category as any).name : c.category}
                      </span>
                    </div>
                    <div className="absolute top-2.5 right-2.5">
                      <span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full shadow-xs">
                        {c.status}
                      </span>
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">
                        {c.title}
                      </h3>

                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> {c.studentsCount} học viên
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5" /> {c.lessonsCount} bài học
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <Link
                        href={`/courses/${c.id}/manage`}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold py-2 rounded-xl transition"
                      >
                        <Settings className="w-3.5 h-3.5" /> Quản lý bài học
                      </Link>

                      <Link
                        href={`/courses/${c.id}/learn?preview=true`}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs transition"
                        title="Xem trước Focus Player"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
