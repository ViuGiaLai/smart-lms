'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/**
 * Header công khai. Sau khi đăng nhập, toàn bộ điều hướng nằm ở sidebar
 * trong khu vực làm việc theo vai trò — header chỉ giữ lối quay lại.
 */
export function Navbar() {
  const router = useRouter();
  const { user: currentUser, isLoading, logout } = useAuth();

  const role = currentUser?.role || 'student';
  const workspaceHref =
    role === 'admin' ? '/admin-dashboard' : role === 'instructor' ? '/instructor-dashboard' : '/dashboard';

  const handleLogout = async () => {
    await logout();
    router.push('/?auth=login');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:px-8">
        <Link href="/" className="group flex items-baseline gap-3" aria-label="Trang chủ SmartTutor LMS">
          <span className="font-serif text-base font-semibold leading-tight tracking-tight text-foreground sm:text-[22px]">
            SmartTutor LMS
          </span>
        </Link>

        <nav aria-label="Điều hướng công khai" className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            href="/courses"
            className="hidden rounded-md px-3 py-2 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground sm:inline"
          >
            Khóa học
          </Link>
          <Link
            href="/#about"
            className="hidden rounded-md px-3 py-2 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground sm:inline"
          >
            Về đề tài
          </Link>

          {isLoading ? (
            <span className="ml-2 h-8 w-24 animate-pulse rounded-md bg-muted" />
          ) : currentUser ? (
            <div className="ml-2 flex items-center gap-2">
              <Link
                href={workspaceHref}
                className="rounded-md bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {role === 'student' ? 'Vào học' : role === 'instructor' ? 'Khu giảng viên' : 'Khu quản trị'}
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                title="Đăng xuất"
                aria-label="Đăng xuất"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="ml-2 flex items-center gap-2">
              <Link
                href="/?auth=login"
                className="rounded-md px-3 py-2 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
              >
                Đăng nhập
              </Link>
              <Link
                href="/?auth=register"
                className="rounded-md bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Đăng ký
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
