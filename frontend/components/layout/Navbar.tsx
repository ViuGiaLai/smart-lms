'use client';

import { useEffect, useState } from 'react';
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
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="group flex items-baseline gap-3" aria-label="Trang chủ Smart LMS">
          <span className="font-serif text-[22px] font-semibold leading-none tracking-tight text-foreground">
            Smart LMS
          </span>
          <span className="hidden text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground sm:inline">
            Đại học Đông Á
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
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
                Vào lớp học
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
                href="/login"
                className="rounded-md px-3 py-2 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Tạo tài khoản
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
