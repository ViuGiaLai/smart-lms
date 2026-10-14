'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function StudentRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Focus Player is intentionally a separate learning workspace.  Wrapping it
  // in the global dashboard would duplicate navigation and steal space from
  // the lesson, playlist and tutor.
  if (/^\/courses\/[^/]+\/learn\/?$/.test(pathname)) {
    return <>{children}</>;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
