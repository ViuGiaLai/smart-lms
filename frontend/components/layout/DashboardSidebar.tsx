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
  HelpCircle,
  X,
  UserCheck,
  Award,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

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
      if (!window.confirm('Bạn có chắc muốn đăng xuất khỏi hệ thống?')) return;
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
  const roleLabel = isAdmin ? 'Quản trị viên' : isStudent ? 'Học viên' : 'Giảng viên';
  const badgeVariant = isAdmin ? 'purple' : isStudent ? 'info' : 'success';
  const roleStyles = isAdmin
    ? 'bg-purple-500/15 border-purple-400/40 text-purple-200'
    : isStudent
      ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-200'
      : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200';
  const displayName = currentUser?.fullName || currentUser?.name || 'Tài khoản người dùng';
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || (isAdmin ? 'AD' : isStudent ? 'HV' : 'GV');

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
            { label: 'Khóa học của tôi', href: '/my-courses', icon: GraduationCap },
            { label: 'Bài kiểm tra', href: '/quizzes', icon: HelpCircle },
            { label: 'Tiến độ học tập', href: '/progress', icon: GraduationCap },
            { label: 'Kết quả học tập', href: '/results', icon: Award },
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

    // Mặc định: Giảng viên (Instructor) — gộp còn 4 nhóm để dễ quét mắt hơn
    return [
      {
        title: 'TỔNG QUAN',
        items: [
          {
            label: 'Bảng Giảng viên',
            href: '/instructor-dashboard',
            icon: LayoutDashboard,
          },
        ],
      },
      {
        title: 'KHÓA HỌC & HỌC LIỆU',
        items: [
          {
            label: 'Khóa học của tôi',
            href: '/instructor-dashboard#courses',
            icon: BookOpen,
          },
          {
            label: 'Bài học & tài liệu',
            href: '/instructor/materials',
            icon: FileText,
          },
          {
            label: 'Tạo khóa học mới',
            href: '/courses/create',
            icon: PlusCircle,
          },
        ],
      },
      {
        title: 'HỌC VIÊN & KHẢO THÍ',
        items: [
          {
            label: 'Học viên của tôi',
            href: '/instructor/students',
            icon: UserCheck,
          },
          {
            label: 'Bài làm & kết quả',
            href: '/instructor/results',
            icon: Award,
          },
          {
            label: 'Sinh đề thi AI (Bloom)',
            href: '/quiz/generate',
            icon: Wand2,
            badge: 'AI',
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
        title: 'LIÊN KẾT',
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

  const renderNavItem = (item: NavItem, itemIdx: number) => {
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

    const navButton = (
      <Button
        asChild
        variant={isActive ? 'default' : 'ghost'}
        size="default"
        className={cn(
          'h-9 w-full justify-start gap-3 rounded-xl px-3 text-xs font-semibold',
          !isActive && 'text-slate-400 hover:bg-slate-800/80 hover:text-white',
          collapsed && 'justify-center px-0',
        )}
      >
        <Link href={item.href}>
          <Icon
            className={cn(
              'h-4 w-4 shrink-0 transition-transform group-hover:scale-110',
              item.isAI && !isActive && 'text-indigo-400',
            )}
          />
          {!collapsed && (
            <>
              <span className="truncate text-left text-xs font-bold">{item.label}</span>
              {item.badge && (
                <Badge
                  variant={isActive ? 'default' : 'secondary'}
                  className={cn(
                    'shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase',
                    item.isAI &&
                      !isActive &&
                      'border-indigo-500/30 bg-indigo-500/20 text-indigo-300',
                  )}
                >
                  {item.badge}
                </Badge>
              )}
            </>
          )}
        </Link>
      </Button>
    );

    return (
      <div key={itemIdx} className="group">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{navButton}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        ) : (
          navButton
        )}
      </div>
    );
  };

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
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-slate-900 text-slate-100 transition-all duration-300 ease-in-out border-slate-800',
          collapsed ? 'w-20' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Header: Logo & Role badge */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-indigo-400 text-white shadow-md shadow-indigo-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="flex min-w-0 flex-col">
                <span className="text-lg font-black leading-none tracking-tight text-white">
                  Smart LMS
                </span>
                <span className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-widest text-primary">
                  {isAdmin ? 'Quản trị hệ thống' : isStudent ? 'Cổng học viên' : 'Cổng Giảng viên'}
                </span>
              </div>
            )}
          </Link>

          {/* Mobile close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onMobileClose}
            className="rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Desktop collapse button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="hidden rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white lg:inline-flex"
            title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Role Banner */}
        {!collapsed && (
          <div className="px-3 pb-1 pt-3">
            <Badge variant={badgeVariant} className="w-full justify-center border-border/50 py-1.5 text-[11px] font-bold">
              {isAdmin ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <GraduationCap className="h-3.5 w-3.5" />
              )}
              {isAdmin ? 'QUẢN TRỊ VIÊN' : isStudent ? 'HỌC VIÊN' : 'GIẢNG VIÊN ĐÀO TẠO'}
            </Badge>
          </div>
        )}

        {/* Navigation Menu */}
        <TooltipProvider delayDuration={200}>
          <ScrollArea className="flex-1 px-3 py-3">
            <div className="space-y-4 pb-2">
              {navSections.map((section, idx) => (
                <div key={idx} className="space-y-1">
                  {!collapsed && (
                    <p className="px-3 pb-0.5 pt-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      {section.title}
                    </p>
                  )}
                  <div className="space-y-1">{section.items.map(renderNavItem)}</div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TooltipProvider>

        {/* Footer: User profile & quick role switch */}
        <div className="shrink-0 space-y-2 border-t border-slate-800 bg-slate-950/80 p-3">
          {/* User info */}
          <div
            className={cn(
              'rounded-xl border border-slate-700/80 bg-slate-900/70 p-2',
              collapsed ? 'p-1.5' : 'p-3',
            )}
          >
            <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
              <Avatar className="h-10 w-10 rounded-xl border">
                <AvatarFallback className={cn('rounded-xl text-sm font-black', roleStyles)}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Tài khoản hiện tại
                  </p>
                  <p className="truncate text-sm font-bold leading-tight text-slate-100" title={displayName}>
                    {displayName}
                  </p>
                  <p
                    className="mt-1 truncate text-[11px] text-slate-400"
                    title={currentUser?.email || 'Chưa cập nhật email'}
                  >
                    {currentUser?.email || 'Chưa cập nhật email'}
                  </p>
                </div>
              )}
            </div>
            {!collapsed && (
              <>
                <Separator className="my-3 bg-slate-800" />
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={badgeVariant} className="text-[10px] font-bold">
                    {roleLabel}
                  </Badge>
                  <span className="text-[10px] text-slate-500">Đã xác thực</span>
                </div>
              </>
            )}
          </div>

          {/* Logout button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className={cn(
              'h-9 w-full justify-start gap-2 rounded-xl border border-transparent text-xs font-semibold text-destructive hover:border-rose-900/50 hover:bg-destructive/10 hover:text-destructive',
              collapsed && 'justify-center px-0',
            )}
            title="Đăng xuất khỏi hệ thống"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Đăng xuất</span>}
          </Button>
        </div>
      </aside>
    </>
  );
}
