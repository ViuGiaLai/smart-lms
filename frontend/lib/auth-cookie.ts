/**
 * Cookie phiên đăng nhập dùng cho Next.js middleware.
 *
 * Middleware chạy ở server-side nên không đọc được localStorage. Vì vậy mỗi khi
 * access token thay đổi (đăng nhập, làm mới token, đăng xuất) ta phải đồng bộ
 * sang cookie. Nếu không, người dùng còn phiên trong localStorage vẫn bị
 * middleware coi là khách và đẩy về /login.
 */

const COOKIE_NAME = 'accessToken'
// Khớp REFRESH_TOKEN_EXPIRE_DAYS=7 của backend: refresh token còn hạn thì
// interceptor sẽ tự lấy access token mới và ghi lại cookie.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export function setAuthCookie(token: string) {
  if (typeof document === 'undefined' || !token) return
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    token
  )}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`
}

export function clearAuthCookie() {
  if (typeof document === 'undefined') return
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`
}

/** Đồng bộ cookie từ localStorage — dùng khi tải trang và sau khi refresh token. */
export function syncAuthCookieFromStorage() {
  if (typeof window === 'undefined') return
  const token = localStorage.getItem('accessToken')
  if (token) setAuthCookie(token)
  else clearAuthCookie()
}
