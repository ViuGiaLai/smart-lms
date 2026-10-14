'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  PlusCircle,
  Wand2,
  Users,
  ShieldCheck,
  GraduationCap,
  Sparkles,
  Layers,
  Activity,
  Home,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Eye,
  Settings,
  HelpCircle,
  X,
  UserCheck,
} from 'lucide-react';

interface AuthUser {
  id?: string;
  name?: string;
  fullName?: string;
  email?: string;
  role?: 'student' | 'instructor' | 'admin' | string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  isAI?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface DashboardSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function DashboardSidebar({
  mobileOpen = false,
  onMobileClose,
  collapsed = false,
  onToggleCollapse,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [currentHash, setCurrentHash] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const loadUser = () => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('currentUser');
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      }
    } catch {
      setCurrentUser(null);
    }

    const token = localStorage.getItem('accessToken');
    if (token) {
      import('@/lib/api').then(({ authApi }) => {
        authApi.getProfile()
          .then((res) => {
            if (res.data?.data) {
              const freshUser = res.data.data;
              setCurrentUser(freshUser);
              localStorage.setItem('currentUser', JSON.stringify(freshUser));
            }
          })
          .catch(() => {});
      });
    }
  };

  useEffect(() => {
    loadUser();
    const handleAuth = () => loadUser();
    window.addEventListener('auth-change', handleAuth);
    window.addEventListener('storage', handleAuth);
    return () => {
      window.removeEventListener('auth-change', handleAuth);
      window.removeEventListener('storage', handleAuth);
    };
  }, []);

  // pathname alone omits ?tab=... and #..., which previously highlighted the
  // generic admin item even when the user had navigated to a specific section.
  useEffect(() => {
    const syncHash = () => setCurrentHash(window.location.hash);
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [pathname, searchParams]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('currentUser');
      window.dispatchEvent(new Event('auth-change'));
      router.push('/login');
    }
  };

  const role = currentUser?.role || 'student';
  const isAdmin = role === 'admin';
  const isStudent = role === 'student';

  // Navigation is role-specific; every workspace uses this single left sidebar.
  const getNavSections = (): NavSection[] => {
    if (isAdmin) {
      return [
        {
          title: 'TỔNG QUAN',
          items: [
            {
              label: 'Bảng Quản trị',
              href: '/admin-dashboard',
              icon: ShieldCheck,
            },
          ],
        },
        {
          title: 'HỆ THỐNG & NGƯỜI DÙNG',
          items: [
            {
              label: 'Quản lý Tài khoản (RBAC)',
              href: '/admin-dashboard?tab=users',
              icon: Users,
              badge: 'Bảo mật',
            },
            {
              label: 'Kiểm duyệt Khóa học',
              href: '/admin-dashboard?tab=courses',
              icon: BookOpen,
            },
          ],
        },
        {
          title: 'HẠ TẦNG AI & DỮ LIỆU',
          items: [
            {
              label: 'Giám sát AI & dữ liệu',
              href: '/admin-dashboard?tab=ai',
              icon: Activity,
              badge: 'pgvector',
              isAI: true,
            },
            {
              label: 'Ngân hàng đề thi',
              href: '/quiz/bank',
              icon: Layers,
            },
          ],
        },
        {
          title: 'TRANG NGOÀI',
          items: [
            {
              label: 'Xem trang chủ',
              href: '/',
              icon: Home,
            },
            {
              label: 'Duyệt khóa học',
              href: '/courses',
              icon: BookOpen,
            },
          ],
        },
      ];
    }

    if (isStudent) {
      return [
        {
          title: 'HỌC TẬP',
          items: [
            { label: 'Bảng học tập', href: '/dashboard', icon: LayoutDashboard },
            { label: 'Khám phá khóa học', href: '/courses', icon: BookOpen },
            { label: 'Tiến độ học tập', href: '/progress', icon: GraduationCap },
          ],
        },
        {
          title: 'ĐIỀU HƯỚNG',
          items: [
            { label: 'Về trang chủ Smart LMS', href: '/', icon: Home },
          ],
        },
      ];
    }

    // Mặc định: Giảng viên (Instructor)
    return [
      {
        title: 'TỔNG QUAN GIẢNG DẠY',
        items: [
          {
            label: 'Bảng Giảng viên',
            href: '/instructor-dashboard',
            icon: LayoutDashboard,
          },
        ],
      },
      {
        title: 'QUẢN LÝ KHÓA HỌC',
        items: [
          {
            label: 'Khóa học của tôi',
            href: '/instructor-dashboard#courses',
            icon: BookOpen,
          },
          {
            label: 'Tạo khóa học mới',
            href: '/courses/create',
            icon: PlusCircle,
            badge: 'Mới',
          },
        ],
      },
      {
        title: 'CÔNG CỤ AI & KHẢO THÍ',
        items: [
          {
            label: 'Sinh đề thi AI (Bloom)',
            href: '/quiz/generate',
            icon: Wand2,
            badge: 'AI Bloom',
            isAI: true,
          },
          {
            label: 'Ngân hàng đề thi',
            href: '/quiz/bank',
            icon: Layers,
            badge: 'Đã lưu',
          },
        ],
      },
      {
        title: 'HỆ THỐNG & ĐIỀU HƯỚNG',
        items: [
          {
            label: 'Về trang chủ Smart LMS',
            href: '/',
            icon: Home,
          },
        ],
      },
    ];
  };

  const navSections = getNavSections();

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-slate-900 border-r border-slate-800 text-slate-100 transition-all duration-300 ease-in-out ${
          collapsed ? 'w-20' : 'w-64'
        } ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Header: Logo & Role badge */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
          <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-black text-lg text-white tracking-tight leading-none truncate">
                  Smart LMS
                </span>
                <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5 truncate">
                  {isAdmin ? 'Quản trị hệ thống' : isStudent ? 'Cổng học viên' : 'Cổng Giảng viên'}
                </span>
              </div>
            )}
          </Link>

          {/* Mobile close button */}
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Desktop collapse button */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Role Banner */}
        {!collapsed && (
          <div className="px-3 pt-3 pb-1">
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border ${
                isAdmin
                  ? 'bg-purple-950/40 text-purple-300 border-purple-800/50'
                  : isStudent
                    ? 'bg-indigo-950/40 text-indigo-300 border-indigo-800/50'
                    : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50'
              }`}
            >
              {isAdmin ? (
                <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
              ) : isStudent ? (
                <GraduationCap className="w-4 h-4 text-indigo-400 shrink-0" />
              ) : (
                <GraduationCap className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span className="truncate">
                {isAdmin ? 'QUẢN TRỊ VIÊN' : isStudent ? 'HỌC VIÊN' : 'GIẢNG VIÊN ĐÀO TẠO'}
              </span>
            </div>
          </div>
        )}

        {/* Navigation Menu */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
          {navSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              {!collapsed && (
                <p className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item, itemIdx) => {
                  const Icon = item.icon;
                  const [hrefWithoutHash, hrefHash = ''] = item.href.split('#');
                  const [hrefPath, hrefQuery = ''] = hrefWithoutHash.split('?');
                  const isExactPath = pathname === hrefPath;
                  const isChildPage = hrefPath !== '/' && pathname.startsWith(`${hrefPath}/`);
                  const hasQuery = Boolean(hrefQuery);
                  const isActive = hrefHash
                    ? isExactPath && currentHash === `#${hrefHash}`
                    : hasQuery
                      ? isExactPath && searchParams.toString() === hrefQuery
                    : (isExactPath || isChildPage) && !searchParams.toString() && !currentHash;

                  return (
                    <Link
                      key={itemIdx}
                      href={item.href}
                      className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all relative ${
                        isActive
                          ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                      } ${collapsed ? 'justify-center px-2' : ''}`}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                          item.isAI && !isActive ? 'text-indigo-400' : ''
                        }`}
                      />
                      {!collapsed && (
                        <>
                          <span className="truncate flex-1">{item.label}</span>
                          {item.badge && (
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tight shrink-0 ${
                                item.isAI
                                  ? isActive
                                    ? 'bg-white text-indigo-700'
                                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                  : isActive
                                  ? 'bg-indigo-700 text-white'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer: User profile & quick role switch */}
        <div className="border-t border-slate-800 p-3 bg-slate-950/60 shrink-0 space-y-2">
          {/* User info */}
          <div
            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-xl bg-slate-900 border border-slate-800/80 ${
              collapsed ? 'justify-center p-1.5' : ''
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-black text-xs flex items-center justify-center shrink-0">
              {currentUser?.fullName?.charAt(0) || currentUser?.name?.charAt(0) || (isAdmin ? 'A' : isStudent ? 'H' : 'G')}
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-bold text-slate-200 truncate leading-snug">
                  {currentUser?.fullName || currentUser?.name || 'Tài khoản người dùng'}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                      isAdmin
                        ? 'bg-purple-950/80 text-purple-300 border border-purple-800'
                        : isStudent
                          ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-800'
                          : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                    }`}
                  >
                    {isAdmin ? 'Quản trị viên' : isStudent ? 'Học viên' : 'Giảng viên'}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate">
                    {currentUser?.email || ''}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 border border-transparent hover:border-rose-900/50 transition ${
              collapsed ? 'justify-center px-1' : ''
            }`}
            title="Đăng xuất khỏi hệ thống"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Đăng xuất</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
