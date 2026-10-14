'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/**
 * Minimal public header. Application navigation belongs exclusively to the
 * left sidebar after a user enters a role-specific workspace.
 */
export function Navbar() {
  const router = useRouter();
  const { user: currentUser, isLoading, logout } = useAuth();

  const role = currentUser?.role || 'student';
  const workspaceHref = role === 'admin'
    ? '/admin-dashboard'
    : role === 'instructor'
      ? '/instructor-dashboard'
      : '/dashboard';

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (isLoading) {
    return (
      <header className="sticky top-0 z-50 h-16 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Trang chủ Smart LMS">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="flex flex-col">
              <span className="text-xl font-black leading-none tracking-tight text-slate-900">Smart LMS</span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-widest text-indigo-600 sm:inline">AI Tutoring Platform</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-20 h-8 animate-pulse bg-slate-200 rounded" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 h-16 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Trang chủ Smart LMS">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="flex flex-col">
            <span className="text-xl font-black leading-none tracking-tight text-slate-900">Smart LMS</span>
            <span className="hidden text-[10px] font-semibold uppercase tracking-widest text-indigo-600 sm:inline">AI Tutoring Platform</span>
          </span>
        </Link>

        {currentUser ? (
          <div className="flex items-center gap-2">
            <Link href={workspaceHref} className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-indigo-700">
              Vào khu vực của tôi
            </Link>
            <button onClick={handleLogout} className="rounded-xl border border-rose-200 px-3 py-2 text-rose-600 transition hover:bg-rose-50" title="Đăng xuất" aria-label="Đăng xuất">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:text-indigo-600">Đăng nhập</Link>
            <Link href="/register" className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-indigo-700">Đăng ký</Link>
          </div>
        )}
      </div>
    </header>
  );
}

export default Navbar;
