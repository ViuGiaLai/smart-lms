import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Middleware — bảo vệ route ở cấp server-side.
 *
 * Nguyên tắc: mặc định chặn (deny by default). Chỉ những route được liệt kê
 * trong PUBLIC_ROUTES mới cho khách truy cập, mọi route còn lại đều cần phiên
 * đăng nhập. Cách này tránh lọt route mới thêm sau này (ví dụ /courses/create
 * hay /courses/[id]/manage trước đây không được bảo vệ).
 *
 * Middleware chỉ đọc cookie `accessToken`; cookie được đồng bộ từ localStorage
 * trong lib/auth-cookie.ts.
 */

const PUBLIC_EXACT_ROUTES = new Set([
  '/',
  '/login',
  '/register',
  '/terms',
  '/privacy',
  '/forgot-password',
  '/reset-password',
]);

const ADMIN_ROUTES = ['/admin-dashboard', '/youtube-import'];
const INSTRUCTOR_ROUTES = [
  '/instructor',
  '/instructor-dashboard',
  '/quiz/bank',
  '/quiz/generate',
];

function homeByRole(role: string | null): string {
  if (role === 'admin') return '/admin-dashboard';
  if (role === 'instructor') return '/instructor-dashboard';
  return '/dashboard';
}

/** Đọc vai trò từ JWT để chặn UI sớm. Quyền thật vẫn do backend kiểm tra. */
function readRole(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).role ?? null;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const token = request.cookies.get('accessToken')?.value;

  // Trang catalog khóa học công khai: /courses và /courses/<id-hoặc-slug>.
  // /courses/create là trang giảng viên nên không nằm trong nhóm này.
  const isCourseCatalog =
    path === '/courses' ||
    (/^\/courses\/[^/]+$/.test(path) && path !== '/courses/create');

  const isPublicRoute = PUBLIC_EXACT_ROUTES.has(path) || isCourseCatalog;

  if (!isPublicRoute && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Chặn UI theo vai trò (admin được dùng mọi nơi). Backend vẫn là lớp bảo vệ
  // cuối cùng cho dữ liệu và API.
  const role = readRole(token);
  if (role && role !== 'admin') {
    const needsAdmin = ADMIN_ROUTES.some((r) => path.startsWith(r));
    const needsInstructor =
      INSTRUCTOR_ROUTES.some((r) => path.startsWith(r)) ||
      path === '/courses/create' ||
      /^\/courses\/[^/]+\/manage/.test(path);

    if (
      (needsAdmin && role !== 'admin') ||
      (needsInstructor && role !== 'instructor')
    ) {
      return NextResponse.redirect(new URL(homeByRole(role), request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Bỏ qua API, tài nguyên Next.js và mọi tệp tĩnh (có dấu chấm ở cuối đường dẫn).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)'],
};
