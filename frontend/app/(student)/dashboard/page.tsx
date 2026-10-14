'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { studentApi, coursesApi } from '@/lib/api'
import { StudentDashboardStats, Enrollment } from '@/types'
import { ProgressBar } from '@/components/course/ProgressBar'
import {
  BookOpen,
  Clock,
  Award,
  Flame,
  TrendingUp,
  Play,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Calendar,
  Compass,
  MessageSquare,
  GraduationCap,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { useRoleGuard } from '@/lib/hooks/useRoleGuard'
import { useAuth } from '@/lib/auth-context'

export default function StudentDashboardPage() {
  const { isAuthorized } = useRoleGuard(['student'])
  const { user: currentUser, isLoading: authLoading } = useAuth()
  const [userName, setUserName] = useState('Học viên')
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    if (currentUser) {
      if (currentUser.name) setUserName(currentUser.name)
      if (currentUser.email) setUserEmail(currentUser.email)
    }
  }, [currentUser])

  const { data: stats, isLoading: statsLoading } = useQuery<StudentDashboardStats>({
    queryKey: ['student', 'dashboard'],
    queryFn: async () => {
      const res = await studentApi.getDashboardStats()
      return res.data.data
    },
    enabled: isAuthorized,
  })

  const { data: enrolledData, isLoading: enrolledLoading } = useQuery<{ data: Enrollment[] }>({
    queryKey: ['courses', 'enrolled'],
    queryFn: async () => {
      const res = await coursesApi.getEnrolled()
      return res.data
    },
  })

  const rawEnrollments = enrolledData?.data ?? []
  const enrollments = rawEnrollments

  const formatWatchTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours === 0) return `${minutes} phút`
    return `${hours}h ${minutes}p`
  }

  const statCards = [
    {
      icon: BookOpen,
      label: 'Đang theo học',
      value: stats?.totalEnrolled ?? enrollments.length,
      sub: `${stats?.totalEnrolled ?? enrollments.length} khóa học`,
      color: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    },
    {
      icon: Award,
      label: 'Đã hoàn thành',
      value: stats?.totalCompleted ?? 0,
      sub: `${stats?.totalCompleted ?? 0} chứng chỉ`,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    },
    {
      icon: Clock,
      label: 'Thời gian học',
      value: stats ? formatWatchTime(stats.totalWatchTime) : '0 phút',
      sub: 'Tích lũy',
      color: 'bg-violet-50 text-violet-600 border-violet-100',
    },
    {
      icon: Flame,
      label: 'Chuỗi ngày học',
      value: stats?.currentStreak ?? 1,
      sub: 'Liên tục',
      color: 'bg-amber-50 text-amber-600 border-amber-100',
    },
  ]

  // Khóa học đang học dở gần nhất (Hero active course)
  const activeEnrollment = enrollments[0]
  const overallProgress =
    enrollments.length > 0
      ? Math.round(enrollments.reduce((acc, curr) => acc + (curr.progress || 0), 0) / enrollments.length)
      : (stats?.totalCompleted ? 100 : 0)

  if (!isAuthorized || authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 text-center max-w-sm">
          <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3 animate-spin">
            <GraduationCap className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-slate-700">Đang kiểm tra quyền truy cập học viên...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-32 md:pb-16">
      <main className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-8 space-y-5 sm:space-y-8">
        {/* ── 1. Header Cá Nhân Hóa (Mobile-First Greeting Bar) ── */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="flex items-center gap-3">
            <div className="w-11 sm:w-14 h-11 sm:h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center font-black text-base sm:text-xl shadow-md shadow-indigo-100 shrink-0">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-2xl font-black text-slate-900 truncate tracking-tight">
                  Xin chào, {userName}
                </h1>
                <span className="hidden sm:inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Học viên Smart LMS
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-snug">
                Chào mừng bạn quay lại. Tiếp tục bài học hôm nay cùng Gia sư AI thông minh 24/7!
              </p>
            </div>
          </div>

          {/* Huy hiệu chuỗi ngày và nút hành động nhanh */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-200/80 text-amber-700 font-extrabold text-xs">
              <Flame className="w-4 h-4 text-amber-500 fill-amber-500 animate-pulse" />
              <span>Chuỗi {stats?.currentStreak ?? 1} ngày 🔥</span>
            </div>
            <Link
              href="/courses"
              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Khám phá thêm</span>
            </Link>
          </div>
        </div>

        {/* ── 2. Chỉ Số Học Tập Tinh Gọn (Space-Efficient Stats) ── */}
        {/* Trên Mobile: Thiết kế 4 cột gọn gàng không chiếm diện tích cuộn */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
          {statCards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.label}
                className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-slate-200/90 shadow-2xs flex items-center sm:block gap-3"
              >
                <div
                  className={`w-8 sm:w-10 h-8 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border ${card.color} sm:mb-2.5`}
                >
                  <Icon className="w-4 sm:w-5 h-4 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-base sm:text-2xl font-black text-slate-900 leading-none">
                    {card.value}
                  </div>
                  <div className="text-[10px] sm:text-xs text-slate-500 font-medium truncate mt-1">
                    {card.label}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 3. KHỐI TIẾP TỤC HỌC CHÍNH (HERO RESUME CARD) ── */}
        {activeEnrollment && (
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-indigo-100 shadow-md shadow-indigo-100/30 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-indigo-700">
                  Bài học đang tiếp diễn
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-slate-400">
                {activeEnrollment.lastAccessedAt
                  ? formatDistanceToNow(new Date(activeEnrollment.lastAccessedAt), {
                      addSuffix: true,
                      locale: vi,
                    })
                  : 'Gần đây'}
              </span>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-slate-50/80 p-3.5 sm:p-4 rounded-2xl border border-slate-200/70">
              <div className="flex items-center gap-3.5 w-full md:w-auto">
                <div className="relative w-16 sm:w-20 h-16 sm:h-16 rounded-xl overflow-hidden shrink-0 bg-slate-200 shadow-2xs">
                  <Image
                    src={
                      activeEnrollment.course.thumbnail ||
                      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&fit=crop'
                    }
                    alt={activeEnrollment.course.title}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <Play className="w-5 h-5 text-white fill-white" />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md inline-block mb-1">
                    {activeEnrollment.completedLessons ? `Đang học bài ${(activeEnrollment.completedLessons || 0) + 1}` : 'Bắt đầu bài học đầu tiên'}
                  </span>
                  <h3 className="font-bold text-slate-900 text-xs sm:text-base leading-snug line-clamp-1">
                    {activeEnrollment.course.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Đã hoàn thành {activeEnrollment.completedLessons ?? 0}/
                    {activeEnrollment.totalLessons ?? 0} bài học
                  </p>
                </div>
              </div>

              {/* Tiến độ & nút CTA nổi bật */}
              <div className="w-full md:w-80 space-y-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200/60">
                <ProgressBar
                  value={activeEnrollment.progress}
                  showLabel
                  label="Tiến độ khóa học"
                  size="sm"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <Link
                    href={`/courses/${activeEnrollment.courseId}/learn`}
                    className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl shadow-md shadow-indigo-200 transition"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Học tiếp ngay</span>
                  </Link>

                  <Link
                    href={`/courses/${activeEnrollment.courseId}/learn?askAI=true`}
                    className="w-full flex items-center justify-center gap-1.5 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs py-2.5 px-3 rounded-xl transition"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Hỏi AI bài này</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 4. Lối Tắt Gia Sư AI Tức Thì (Mobile Quick Ask Widget) ── */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-5 text-white shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs sm:text-sm">Trợ lý Gia sư ảo AI 24/7</h3>
                <p className="text-[10px] text-indigo-200">Đồng hành giải đáp kiến thức theo đúng tài liệu slide bài học</p>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
              Sẵn sàng
            </span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {[
              '💡 Tóm tắt kiến thức trọng tâm',
              '❓ Luyện câu hỏi trắc nghiệm ôn tập',
              '🔍 Giải thích khái niệm chuyên sâu',
            ].map((chip) => (
              <Link
                key={chip}
                href={activeEnrollment ? `/courses/${activeEnrollment.courseId}/learn?askAI=true` : '/courses'}
                className="text-[11px] font-medium bg-white/10 hover:bg-white/20 active:scale-95 text-indigo-100 px-3 py-1.5 rounded-xl transition border border-white/10 flex items-center gap-1"
              >
                <span>{chip}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── 5. Danh Sách Các Khóa Học Khác & Thanh Tiến Độ ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8 items-start">
          {/* Cột trái: Khóa học đã đăng ký */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                Khóa học của bạn ({enrollments.length})
              </h2>
              <Link
                href="/courses"
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {enrollments.map((enrollment, idx) => (
                <div
                  key={enrollment.id}
                  className="bg-white rounded-2xl p-3.5 sm:p-4.5 border border-slate-200/90 shadow-2xs hover:border-indigo-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-14 sm:w-16 h-14 sm:h-14 rounded-xl overflow-hidden shrink-0 bg-slate-100">
                      <Image
                        src={
                          enrollment.course.thumbnail ||
                          'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&fit=crop'
                        }
                        alt={enrollment.course.title}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.2 rounded-md">
                          {enrollment.course.category?.name || 'Công nghệ'}
                        </span>
                        {enrollment.progress >= 100 && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded-md flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Hoàn thành
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-xs sm:text-sm text-slate-900 truncate mt-1">
                        {enrollment.course.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Giảng viên: {enrollment.course.instructor?.fullName || 'ĐH Đông Á'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="w-28 sm:w-32">
                      <ProgressBar value={enrollment.progress} showLabel size="sm" />
                    </div>
                    <Link
                      href={`/courses/${enrollment.courseId}/learn`}
                      className="inline-flex items-center justify-center gap-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold text-xs px-3.5 py-2 rounded-xl transition shadow-2xs"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Vào học</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cột phải: Lịch học tuần & Thành tích */}
          <div className="space-y-4">
              {/* Lịch chuỗi ngày học trong tuần */}
              {(() => {
                const daysLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
                const todayDayIndex = (new Date().getDay() + 6) % 7;
                const streakVal = stats?.currentStreak ?? 1;
                const activeDaysCount = Math.min(todayDayIndex + 1, Math.max(1, streakVal));
                const weekDays = daysLabels.map((day, idx) => ({
                  day,
                  isToday: idx === todayDayIndex,
                  active: idx <= todayDayIndex && idx > todayDayIndex - activeDaysCount,
                }));

                return (
                  <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 uppercase">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        <span>Tuần này ({activeDaysCount}/7 ngày)</span>
                      </div>
                      <span className="text-[11px] font-extrabold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        🔥 Đang duy trì {streakVal} ngày
                      </span>
                    </div>

                    {/* 7 ngày trong tuần */}
                    <div className="grid grid-cols-7 gap-1.5 text-center pt-1">
                      {weekDays.map((d, i) => (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-medium ${d.isToday ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}>
                            {d.day}
                          </span>
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition ${
                              d.active
                                ? 'bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-2xs shadow-amber-200'
                                : d.isToday
                                ? 'border-2 border-dashed border-indigo-400 text-indigo-500 bg-indigo-50/50'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {d.active ? <Flame className="w-4 h-4 fill-white" /> : d.isToday ? 'Hôm nay' : '•'}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500 text-center pt-1">
                      {activeDaysCount >= 7
                        ? 'Xuất sắc! Bạn đã duy trì chuỗi học tập trọn vẹn cả tuần!'
                        : 'Vào bài học hôm nay để tiếp tục tích lũy kiến thức cùng Gia sư AI!'}
                    </p>
                  </div>
                );
              })()}

            {/* Thống kê tỷ lệ hoàn thành */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-xs sm:text-sm text-slate-900">Tiến độ tổng quan</h3>
              </div>
              <div className="space-y-2.5">
                <div>
                  <div className="flex justify-between text-xs text-slate-600 font-medium mb-1">
                    <span>Hoàn thành mục tiêu</span>
                    <span className="font-bold text-indigo-600">{overallProgress}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 rounded-full transition-all duration-500" style={{ width: `${overallProgress}%` }} />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <Link
                    href="/progress"
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    Xem báo cáo chi tiết & Điểm số <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
