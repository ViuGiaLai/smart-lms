'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  PlusCircle,
  Wand2,
  Users,
  ShieldCheck,
  GraduationCap,
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
  Youtube,
  ClipboardCheck,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';

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
  const router = useRouter();
  const { user, logout } = useAuth();
  const currentUser = user as AuthUser | null;
  const [currentHash, setCurrentHash] = useState('');
  const [currentSearch, setCurrentSearch] = useState('');

  // Keep navigation highlighting in sync with the URL hash (e.g. #courses).
  // Dùng useAuth thay vì tự gọi /auth/profile mỗi lần sidebar mount — bớt 1 request.
  useEffect(() => {
    const sync = () => {
      setCurrentHash(window.location.hash);
      setCurrentSearch(window.location.search.replace(/^\?/, ''));
    };
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [pathname]);

  // Đóng drawer bằng Esc và khóa cuộn nền khi mở menu trên mobile.
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onMobileClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen, onMobileClose]);

  const handleLogout = async () => {
    if (typeof window === 'undefined') return;
    if (!window.confirm('Bạn có chắc muốn đăng xuất khỏi hệ thống?')) return;
    // Gọi logout của AuthProvider để backend thu hồi token (tăng token_version),
    // không chỉ xóa phiên cục bộ — tránh token cũ dùng được đến khi hết hạn.
    await logout();
    router.push('/login');
  };

  const role = currentUser?.role || 'student';
  const isAdmin = role === 'admin';
  const isStudent = role === 'student';
  const roleLabel = isAdmin ? 'Quản trị viên' : isStudent ? 'Học viên' : 'Giảng viên';
  const badgeVariant = isAdmin ? 'purple' : isStudent ? 'info' : 'success';
  const roleStyles = isAdmin
    ? 'bg-clay-500/15 border-clay-400/40 text-clay-200'
    : isStudent
      ? 'bg-brand-400/15 border-brand-300/40 text-brand-100'
      : 'bg-brand-500/20 border-brand-300/40 text-brand-100';
  const displayName = currentUser?.fullName || currentUser?.name || 'Tài khoản người dùng';
  // Bỏ phần trong ngoặc (vd. "(Sinh viên)") để không sinh ra initials kiểu "(V".
  const initials =
    displayName
      .replace(/\([^)]*\)/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((part) => /[A-Za-zÀ-ỹ0-9]/.test(part))
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
              label: 'Danh mục & Trình độ',
              href: '/admin-dashboard?tab=categories',
              icon: Layers,
              badge: 'Động',
            },
            {
              label: 'Kiểm duyệt Khóa học',
              href: '/admin-dashboard?tab=courses',
              icon: BookOpen,
            },
            {
              label: 'AI Discovery (Khám phá)',
              href: '/admin-dashboard?tab=discovery',
              icon: Wand2,
              badge: 'AI',
              isAI: true,
            },
            {
              label: 'Nhập học liệu YouTube',
              href: '/youtube-import',
              icon: Youtube,
              badge: 'Mới',
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
          {
            label: 'AI Course Builder',
            href: '/courses/create?mode=ai',
            icon: Wand2,
            badge: 'AI',
            isAI: true,
          },
          {
            label: 'Nhập học liệu YouTube',
            href: '/youtube-import',
            icon: Youtube,
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
            label: 'Phân tích học tập',
            href: '/instructor/analytics',
            icon: BarChart3,
          },
          {
            label: 'Chấm bài tự luận AI',
            href: '/instructor/grading',
            icon: ClipboardCheck,
            badge: 'AI',
            isAI: true,
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
        ? isExactPath && currentSearch === hrefQuery
        : (isExactPath || isChildPage) && !currentSearch && !currentHash;

    const navButton = (
      <Button
        asChild
        variant={isActive ? 'default' : 'ghost'}
        size="default"
        className={cn(
          'relative h-9 w-full justify-start gap-3 rounded-md px-3 text-[13px] font-medium',
          isActive && 'bg-brand-800 text-brand-50',
          !isActive && 'text-brand-100/65 hover:bg-brand-900 hover:text-brand-50',
          collapsed && 'justify-center px-0',
        )}
      >
        <Link href={item.href}>
          {isActive && !collapsed && (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 bg-clay-400"
            />
          )}
          <Icon
            className={cn(
              'h-4 w-4 shrink-0',
              isActive ? 'text-clay-300' : 'text-brand-200/60',
            )}
          />
          {!collapsed && (
            <>
              <span className="truncate text-left text-[13px] font-medium">{item.label}</span>
              {item.badge && (
                <Badge
                  variant={isActive ? 'default' : 'secondary'}
                  className={cn(
                    'shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                    item.isAI &&
                      !isActive &&
                      'border-clay-500/30 bg-clay-500/15 text-clay-300',
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
          className="fixed inset-0 z-40 bg-brand-950/60 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-brand-900 bg-brand-950 text-brand-50 transition-all duration-300 ease-in-out',
          collapsed ? 'w-20' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Header: Logo & Role badge */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-brand-900 px-4">
          <Link href="/" className="flex min-w-0 items-baseline gap-2 overflow-hidden">
            {!collapsed && (
              <span className="font-serif text-[21px] font-semibold leading-none tracking-tight text-brand-50">
                Smart LMS
              </span>
            )}
            {collapsed && (
              <span className="font-serif text-lg font-semibold text-brand-50">SL</span>
            )}
          </Link>

          {/* Mobile close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onMobileClose}
            className="rounded-md text-brand-200/70 hover:bg-brand-900 hover:text-brand-50 lg:hidden"
            aria-label="Đóng menu điều hướng"
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Desktop collapse button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="hidden rounded-md text-brand-200/70 hover:bg-brand-900 hover:text-brand-50 lg:inline-flex"
            title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Role Banner */}
        {!collapsed && (
          <div className="px-3 pb-1 pt-3">
            <Badge variant={badgeVariant} className="w-full justify-center border-brand-800 bg-brand-900 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-100">
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
                    <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200/45">
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
        <div className="shrink-0 space-y-2 border-t border-brand-900 p-3">
          {/* User info */}
          <div
            className={cn(
              'rounded-md border border-brand-800 bg-brand-900/60 p-2',
              collapsed ? 'p-1.5' : 'p-3',
            )}
          >
            <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
              <Avatar className="h-9 w-9 rounded-md border border-brand-700">
                <AvatarFallback className={cn('rounded-md text-xs font-semibold', roleStyles)}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-brand-200/45">
                    Tài khoản
                  </p>
                  <p className="truncate text-[13px] font-semibold leading-tight text-brand-50" title={displayName}>
                    {displayName}
                  </p>
                  <p
                    className="mt-1 truncate text-[11px] text-brand-200/55"
                    title={currentUser?.email || 'Chưa cập nhật email'}
                  >
                    {currentUser?.email || 'Chưa cập nhật email'}
                  </p>
                </div>
              )}
            </div>
            {!collapsed && (
              <>
                <Separator className="my-3 bg-brand-800" />
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={badgeVariant} className="text-[10px] font-medium">
                    {roleLabel}
                  </Badge>
                  <span className="text-[10px] text-brand-200/45">Đã xác thực</span>
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
              'h-9 w-full justify-start gap-2 rounded-md border border-transparent text-[13px] font-medium text-brand-200/70 hover:border-brand-800 hover:bg-brand-900 hover:text-brand-50',
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
