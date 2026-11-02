import Link from 'next/link'
import { ArrowLeft, BarChart3, BookOpen, ShieldCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

interface AuthShellProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  /** Nhãn nhỏ phía trên tiêu đề, ví dụ "Khôi phục tài khoản". */
  eyebrow?: string
  /** Hiện nút quay lại ở đầu thẻ (dùng cho trang con như quên/đặt lại mật khẩu). */
  backHref?: string
  backLabel?: string
  /** Nội dung dưới thẻ (ví dụ liên kết đăng ký/đăng nhập). */
  footer?: React.ReactNode
  className?: string
}

const NOTES = [
  {
    icon: BookOpen,
    title: 'Học theo lộ trình',
    description: 'Bài giảng, học liệu và bài luyện tập nằm trong cùng một khóa học.',
  },
  {
    icon: BarChart3,
    title: 'Biết mình đang ở đâu',
    description: 'Tiến độ từng bài và kết quả kiểm tra được cập nhật ngay khi hoàn thành.',
  },
  {
    icon: ShieldCheck,
    title: 'Phiên đăng nhập rõ ràng',
    description: 'Đăng xuất ở bất kỳ thiết bị nào sẽ thu hồi hiệu lực của phiên cũ.',
  },
]

export function AuthShell({
  title,
  subtitle,
  children,
  eyebrow,
  backHref,
  backLabel = 'Quay lại',
  footer,
  className,
}: AuthShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl lg:grid-cols-[1fr_minmax(0,27rem)]">
        {/* Cột giới thiệu — nền mực, chữ giấy, chỉ hiển thị trên desktop. */}
        <section className="hidden flex-col justify-between border-r border-border bg-brand-950 px-12 py-14 text-brand-50 lg:flex">
          <div>
            <Link href="/" className="inline-flex items-baseline gap-3" aria-label="Trang chủ Smart LMS">
              <span className="font-serif text-2xl font-semibold tracking-tight">Smart LMS</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-brand-300">Đại học Đông Á</span>
            </Link>

            <h2 className="mt-20 max-w-sm font-serif text-[34px] leading-[1.2]">
              Giáo trình số, trợ lý học tập và phòng luyện thi trong một chỗ.
            </h2>
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-brand-200/80">
              Đăng nhập để tiếp tục bài đang học, xem lại kết quả và hỏi trợ lý về đúng đoạn tài liệu
              bạn đang đọc.
            </p>
          </div>

          <dl className="mt-16 space-y-6 border-t border-brand-800 pt-8">
            {NOTES.map((note) => {
              const Icon = note.icon
              return (
                <div key={note.title} className="flex gap-4">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-clay-400" aria-hidden />
                  <div>
                    <dt className="text-[13px] font-semibold text-brand-50">{note.title}</dt>
                    <dd className="mt-1 text-[12px] leading-relaxed text-brand-200/70">
                      {note.description}
                    </dd>
                  </div>
                </div>
              )
            })}
          </dl>

          <p className="mt-16 text-[11px] leading-relaxed text-brand-300/60">
            Đề tài NCKH 2026 · Khoa Công nghệ Thông tin
            <br />
            Nguyễn Thanh Phước · Phan Thanh Huy · Rmah Viu
          </p>
        </section>

        {/* Cột biểu mẫu */}
        <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
          <Link
            href="/"
            className="mb-8 flex items-baseline gap-2 lg:hidden"
            aria-label="Trang chủ Smart LMS"
          >
            <span className="font-serif text-xl font-semibold tracking-tight text-foreground">
              Smart LMS
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Đông Á
            </span>
          </Link>

          <div className={cn('w-full', className)}>
            {backHref && (
              <Link
                href={backHref}
                className="mb-6 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {backLabel}
              </Link>
            )}

            {eyebrow && <p className="kicker">{eyebrow}</p>}
            <h1 className="mt-2 text-[26px] leading-tight text-foreground">{title}</h1>
            {subtitle && (
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>
            )}

            <div className="mt-7">{children}</div>

            {footer && <div className="mt-7 border-t border-border pt-5">{footer}</div>}
          </div>

          <p className="mt-10 text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} Smart LMS · Trường Đại học Đông Á
          </p>
        </section>
      </div>
    </div>
  )
}
