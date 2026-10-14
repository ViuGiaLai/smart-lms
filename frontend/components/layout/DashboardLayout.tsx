'use client';

import React, { useState, useEffect } from 'react';
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

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const loadUser = () => {
      try {
        const stored = localStorage.getItem('currentUser');
        setCurrentUser(stored ? JSON.parse(stored) : null);
      } catch {
        setCurrentUser(null);
      }
    };
    loadUser();
    window.addEventListener('auth-change', loadUser);
    window.addEventListener('storage', loadUser);
    return () => {
      window.removeEventListener('auth-change', loadUser);
      window.removeEventListener('storage', loadUser);
    };
  }, []);

  const role = currentUser?.role || 'student';
  const isAdmin = role === 'admin';
  const isInstructor = role === 'instructor';

  // Định nghĩa breadcrumb tự động
  const getBreadcrumbTitle = () => {
    if (pathname.includes('/courses/create')) return 'Tạo khóa học mới';
    if (pathname.includes('/manage')) return 'Quản lý học liệu & Bài giảng';
    if (pathname.includes('/quiz/generate')) return 'Sinh đề thi trắc nghiệm AI (Bloom)';
    if (pathname.includes('/admin-dashboard')) return 'Bảng Quản trị Hệ thống';
    if (pathname.includes('/instructor-dashboard')) return 'Bảng điều khiển Giảng viên';
    if (pathname.includes('/progress')) return 'Tiến độ học tập';
    if (pathname.includes('/dashboard')) return 'Bảng học tập';
    if (pathname.includes('/courses')) return 'Khóa học của tôi';
    return 'Bảng điều khiển';
  };

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
                  <Link
                    href={`/courses/${manageId}/learn?preview=true`}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 transition shadow-2xs"
                    title="Mở trình phát bài giảng của khóa học này để kiểm tra"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="hidden sm:inline">Xem trước bài giảng</span>
                    <span className="text-[10px] bg-indigo-200/60 text-indigo-800 px-1 py-0.2 rounded font-black">
                      Preview
                    </span>
                  </Link>
                );
              }
              return null;
            })()}

            {/* Nút Tạo khóa học (ẩn khi đang ở chính trang /courses/create) */}
            {isInstructor && pathname !== '/courses/create' && (
              <Link
                href="/courses/create"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs shadow-indigo-200 transition"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Tạo khóa học</span>
              </Link>
            )}

            {isAdmin && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Super Admin</span>
              </span>
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
