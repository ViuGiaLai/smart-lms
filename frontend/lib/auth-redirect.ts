export function safeReturnPath(search: string): string | null {
  const params = new URLSearchParams(search)
  const path = params.get('next') ?? params.get('redirect')
  if (!path || !path.startsWith('/') || path.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(path)) return null
  const parsed = new URL(path, 'https://smarttutor.invalid')
  if (parsed.origin !== 'https://smarttutor.invalid' || parsed.pathname.startsWith('//') || /^\/(login|register)(?:\/|$)/.test(parsed.pathname)) return null
  return parsed.pathname + parsed.search + parsed.hash
}
