'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  Eye,
  PlusCircle,
  Home,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { DashboardSidebar } from './DashboardSidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user: currentUser, isLoading } = useAuth();

  const role = currentUser?.role || 'student';
  const isAdmin = role === 'admin';
  const isInstructor = role === 'instructor';

  // Định nghĩa breadcrumb tự động (kiểm tra đường đi sâu trước đường đi chung)
  const getBreadcrumbTitle = () => {
    if (pathname.includes('/admin-dashboard')) return 'Bảng Quản trị Hệ thống';
    if (pathname.includes('/instructor-dashboard')) return 'Bảng điều khiển Giảng viên';
    if (pathname.includes('/instructor/materials')) return 'Bài học & Tài liệu (RAG)';
    if (pathname.includes('/instructor/students')) return 'Học viên của tôi';
    if (pathname.includes('/instructor/results')) return 'Bài làm & Kết quả';
    if (pathname.includes('/courses/create')) return 'Tạo khóa học mới';
    if (pathname.includes('/manage')) return 'Quản lý khóa học';
    if (pathname.includes('/quiz/generate')) return 'Sinh đề thi trắc nghiệm AI (Bloom)';
    if (pathname.includes('/quiz/bank')) return 'Ngân hàng đề thi';
    if (pathname.includes('/my-courses')) return 'Khóa học của tôi';
    if (pathname.includes('/results')) return 'Kết quả học tập';
    if (pathname.includes('/progress')) return 'Tiến độ học tập';
    if (pathname.includes('/dashboard')) return 'Bảng học tập';
    if (pathname.includes('/courses')) return 'Khám phá khóa học';
    return 'Bảng điều khiển';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex font-sans text-slate-800">
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 sm:px-6 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="animate-pulse">
                <div className="w-8 h-8 bg-slate-200 rounded" />
              </div>
              <div className="w-32 h-4 bg-slate-200 rounded animate-pulse" />
            </div>
          </header>
          <main className="flex-1 pb-16" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-800">
      {/* ── Left Sidebar ── */}
      <DashboardSidebar
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />

      {/* ── Main Content Area ── */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
          collapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        {/* Top Header inside Dashboard */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 sm:px-6 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
              title="Mở menu quản lý"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 min-w-0">
              <Link href="/" className="hover:text-indigo-600 transition hidden sm:inline-flex items-center gap-1">
                <Home className="w-3.5 h-3.5" />
                <span>Trang chủ</span>
              </Link>
              <ChevronRight className="w-3 h-3 text-slate-300 hidden sm:inline" />
              <Link
                href={isAdmin ? '/admin-dashboard' : isInstructor ? '/instructor-dashboard' : '/dashboard'}
                className="hover:text-indigo-600 transition truncate"
              >
                {isAdmin ? 'Quản trị viên' : isInstructor ? 'Giảng viên' : 'Học viên'}
              </Link>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className="text-slate-900 font-bold truncate">
                {getBreadcrumbTitle()}
              </span>
            </div>
          </div>

          {/* Quick Action Badges / Contextual Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Chỉ hiện nút xem trước nếu đang quản lý một khóa học cụ thể */}
            {(() => {
              const courseManageMatch = pathname.match(/\/courses\/([^\/]+)\/manage/);
              if (courseManageMatch) {
                const manageId = courseManageMatch[1];
                return (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="text-primary hover:text-primary"
                    title="Mở trình phát bài giảng của khóa học này để kiểm tra"
                  >
                    <Link href={`/courses/${manageId}/learn?preview=true`} target="_blank">
                      <Eye className="h-3.5 w-3.5 text-primary" />
                      <span className="hidden sm:inline">Xem trước bài giảng</span>
                      <Badge
                        variant="info"
                        className="rounded px-1 py-0 text-[10px] font-black"
                      >
                        Preview
                      </Badge>
                    </Link>
                  </Button>
                );
              }
              return null;
            })()}

            {/* Nút Tạo khóa học (ẩn khi đang ở chính trang /courses/create) */}
            {isInstructor && pathname !== '/courses/create' && (
              <Button asChild variant="default" size="sm">
                <Link href="/courses/create" className="gap-1.5">
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Tạo khóa học</span>
                </Link>
              </Button>
            )}

            {isAdmin && (
              <Badge variant="purple" className="gap-1 text-[11px] font-bold">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Super Admin</span>
              </Badge>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 pb-16">
          {children}
        </main>
      </div>
    </div>
  );
}
