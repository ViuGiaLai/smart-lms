'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PublicShell } from '@/components/layout/PublicShell';
import { useAuth } from '@/lib/auth-context';

// Dashboard cần phiên đăng nhập + đọc localStorage: render động mỗi request
// thay vì prerender tĩnh (tránh lỗi useSearchParams và HTML sai theo user).
export const dynamic = 'force-dynamic';

export default function StudentRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  // Focus Player is intentionally a separate learning workspace.  Wrapping it
  // in the global dashboard would duplicate navigation and steal space from
  // the lesson, playlist and tutor.
  if (/^\/courses\/[^/]+\/learn\/?$/.test(pathname)) {
    return <>{children}</>;
  }

  // Catalog khóa học là trang công khai. Khách chưa đăng nhập chỉ thấy header
  // thương hiệu, không thấy sidebar nội bộ (Bảng học tập, Tiến độ, Kết quả...).
  const isCourseCatalog =
    pathname === '/courses' ||
    (/^\/courses\/[^/]+\/?$/.test(pathname) && !pathname.startsWith('/courses/create'));

  if (isCourseCatalog && !isAuthenticated) {
    return <PublicShell>{children}</PublicShell>;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
