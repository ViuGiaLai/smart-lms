'use client';

import React from 'react';
import Link from 'next/link';
import { GraduationCap, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Khung trang công khai cho khách chưa đăng nhập.
 *
 * Trang catalog khóa học (`/courses`, `/courses/[id]`) được phép truy cập tự do,
 * nhưng không nên hiển thị sidebar học viên vì như vậy khách sẽ thấy toàn bộ
 * menu nội bộ (Bảng học tập, Tiến độ, Kết quả...). Khung này chỉ giữ thương hiệu
 * và hai lối vào: đăng nhập / đăng ký.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="truncate font-serif text-lg font-semibold tracking-tight">
              SmartTutor LMS
            </span>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/courses">Khóa học</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/login">
                <LogIn className="h-4 w-4" />
                Đăng nhập
              </Link>
            </Button>
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/register">Đăng ký</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-card py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>© 2026 Smart LMS</span>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="transition hover:text-foreground">
              Điều khoản
            </Link>
            <Link href="/privacy" className="transition hover:text-foreground">
              Chính sách bảo mật
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
