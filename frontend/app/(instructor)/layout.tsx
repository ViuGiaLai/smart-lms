import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function InstructorRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
