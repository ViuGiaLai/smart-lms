import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Middleware — bảo vệ route ở cấp server-side.
 *
 * Các route công khai (không cần login):
 *   /, /login, /register, /courses, /courses/[id] (trang catalog),
 *   /terms, /privacy, /forgot-password, /reset-password
 *
 * Các route yêu cầu đăng nhập:
 *   /courses/[id]/learn, /dashboard/*, /instructor/*, /admin/*,
 *   /my-courses, /progress, /results, /certificates/*, /quiz/*
 */

const PUBLIC_EXACT_ROUTES = [
  '/',
  '/login',
  '/register',
  '/courses',
  '/terms',
  '/privacy',
  '/forgot-password',
  '/reset-password',
];

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/instructor',
  '/admin',
  '/quiz',
  '/my-courses',
  '/progress',
  '/results',
  '/certificates',
];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const token = request.cookies.get('accessToken')?.value;

  // Bỏ qua API routes, static assets — để backend/xhr tự xử lý auth
  if (
    path.startsWith('/api/') ||
    path.startsWith('/_next/') ||
    path === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Phân loại route
  const isLearnRoute = /^\/courses\/\d+\/learn/.test(path);
  const isCourseCatalogRoute = /^\/courses\/\d+$/.test(path);
  const isCourseListRoute = path === '/courses';

  const isProtectedRoute =
    isLearnRoute ||
    PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));

  const isPublicRoute =
    PUBLIC_EXACT_ROUTES.includes(path) ||
    isCourseCatalogRoute ||
    isCourseListRoute;

  // Nếu đã đăng nhập mà vào /login hoặc /register → chuyển về dashboard
  if (token && (path === '/login' || path === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Nếu chưa đăng nhập mà vào route yêu cầu đăng nhập → chuyển về /login
  if (isProtectedRoute && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', path);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
