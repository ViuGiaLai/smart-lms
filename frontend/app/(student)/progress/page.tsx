'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProgressBar from '@/components/course/ProgressBar';
import { ArrowLeft, Award, BookOpen, Clock, Target, TrendingUp, Sparkles, Play } from 'lucide-react';
import { studentApi, coursesApi } from '@/lib/api';
import { Enrollment, StudentDashboardStats } from '@/types';

export default function StudentProgressPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StudentDashboardStats | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const [statsRes, enrolledRes] = await Promise.allSettled([
          studentApi.getDashboardStats(),
          coursesApi.getEnrolled(),
        ]);

        if (isMounted) {
          if (statsRes.status === 'fulfilled' && statsRes.value.data?.data) {
            setStats(statsRes.value.data.data);
          }
          if (enrolledRes.status === 'fulfilled' && enrolledRes.value.data?.data) {
            setEnrollments(enrolledRes.value.data.data);
          }
        }
      } catch (err) {
        console.error('Lỗi nạp tiến độ học tập:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, []);

  const totalCourses = stats?.totalEnrolled ?? enrollments.length;
  const totalCompleted = stats?.totalCompleted ?? enrollments.filter((e) => e.progress >= 100).length;
  const totalWatchHours = stats ? (stats.totalWatchTime / 3600).toFixed(1) : '0';
  const avgProgress = enrollments.length > 0
    ? Math.round(enrollments.reduce((acc, curr) => acc + (curr.progress || 0), 0) / enrollments.length)
    : 0;

  const statItems = [
    {
      label: 'Khóa học đã đăng ký',
      value: `${totalCourses} khóa`,
      icon: BookOpen,
      color: 'text-indigo-600 bg-indigo-50',
    },
    {
      label: 'Tổng giờ đã học',
      value: `${totalWatchHours}h`,
      icon: Clock,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: 'Khóa học hoàn thành',
      value: `${totalCompleted} khóa`,
      icon: Award,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: 'Tiến độ trung bình',
      value: `${avgProgress}%`,
      icon: Target,
      color: 'text-violet-600 bg-violet-50',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-28 md:pb-12">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push('/dashboard');
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs transition mb-3"
            title="Quay lại trang trước đó"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại</span>
          </button>
          <h1 className="text-2xl font-bold text-slate-900">Báo cáo & Tiến độ Học tập</h1>
          <p className="text-xs text-slate-500 mt-1">
            Dữ liệu học tập thực tế đồng bộ trực tiếp từ cơ sở dữ liệu và Trợ lý AI
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statItems.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${s.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">{s.label}</p>
                  <p className="text-xl font-bold text-slate-900 mt-0.5">{loading ? '...' : s.value}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detailed Course Progress */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">Tiến độ theo khóa học</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">{enrollments.length} khóa học</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm animate-pulse">
              Đang tải dữ liệu tiến độ từ hệ thống...
            </div>
          ) : enrollments.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Bạn chưa đăng ký khóa học nào</p>
              <p className="text-xs text-slate-400">Tham gia khóa học mới để bắt đầu theo dõi tiến độ học tập và hỏi đáp cùng AI Tutor.</p>
              <Link
                href="/courses"
                className="inline-block mt-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition"
              >
                Khám phá khóa học
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {enrollments.map((item) => (
                <div key={item.id} className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800">{item.course?.title || `Khóa học #${item.courseId}`}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                        {item.completedLessons ?? 0} / {item.totalLessons ?? 0} bài học
                      </span>
                      <Link
                        href={`/courses/${item.courseId}/learn`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 bg-white hover:bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-md transition"
                      >
                        <Play className="w-3 h-3" />
                        Vào học
                      </Link>
                      <Link
                        href={`/courses/${item.courseId}/learn?tab=quiz`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-md transition"
                        title="Làm đề thi trắc nghiệm ôn tập"
                      >
                        <Award className="w-3 h-3 text-purple-600" />
                        Thi trắc nghiệm
                      </Link>
                    </div>
                  </div>

                  <ProgressBar progress={item.progress ?? 0} />

                  <div className="flex items-start gap-2 pt-1 text-xs text-slate-600 bg-indigo-50/60 p-3 rounded-xl border border-indigo-100">
                    <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-indigo-900">Gợi ý từ AI Tutor: </span>
                      <span>
                        {item.progress >= 100
                          ? 'Chúc mừng! Bạn đã hoàn thành toàn bộ khóa học này. Hãy ôn luyện lại các bài trắc nghiệm để củng cố kiến thức vững chắc.'
                          : item.progress > 50
                          ? 'Bạn đang có tiến độ tốt. Hãy tiếp tục học các bài học tiếp theo và đặt câu hỏi cho AI nếu gặp vấn đề chưa hiểu rõ.'
                          : 'Bắt đầu xem video bài giảng và tương tác cùng AI Tutor để ghi nhớ kiến thức tốt nhất.'}
                      </span>
                    </div>
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
