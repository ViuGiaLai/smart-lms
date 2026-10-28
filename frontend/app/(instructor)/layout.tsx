import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

// Dashboard cần phiên đăng nhập + đọc localStorage: render động mỗi request
// thay vì prerender tĩnh (tránh lỗi useSearchParams và HTML sai theo user).
export const dynamic = 'force-dynamic';

export default function InstructorRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
