import Link from 'next/link'
import { ArrowLeft, KeyRound, Mail, ShieldCheck, Sparkles } from 'lucide-react'

export const metadata = {
  title: 'Quên mật khẩu',
  description: 'Hướng dẫn khôi phục mật khẩu tài khoản Smart LMS.',
}

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/80 flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Sparkles className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Smart LMS
            </span>
          </div>

          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-7 h-7" />
          </div>

          <h1 className="text-xl font-extrabold text-slate-900 text-center mb-1">
            Khôi phục mật khẩu
          </h1>
          <p className="text-slate-500 text-xs text-center mb-6">
            Hệ thống chưa cấu hình dịch vụ gửi email tự động, vì vậy yêu cầu cấp lại mật khẩu được xử lý trực tiếp bởi Ban quản trị.
          </p>

          <ol className="space-y-3 text-sm text-slate-700 mb-6">
            <li className="flex gap-3 bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5">
              <span className="w-6 h-6 shrink-0 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                1
              </span>
              <span>
                Gửi email tới Ban quản trị kèm địa chỉ email đăng nhập của bạn:
                <span className="font-semibold text-slate-900"> admin@donga.edu.vn</span>
              </span>
            </li>
            <li className="flex gap-3 bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5">
              <span className="w-6 h-6 shrink-0 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                2
              </span>
              <span>
                Ban quản trị xác minh tài khoản và đặt lại mật khẩu mới cho bạn trong thời gian sớm nhất.
              </span>
            </li>
            <li className="flex gap-3 bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5">
              <span className="w-6 h-6 shrink-0 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                3
              </span>
              <span>
                Đăng nhập lại bằng mật khẩu mới và đổi mật khẩu trong mục thông tin cá nhân để bảo mật.
              </span>
            </li>
          </ol>

          <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 flex gap-3 mb-6">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-indigo-900 leading-relaxed">
              Mẹo cho buổi thuyết minh/demo: bạn có thể dùng ngay 3 nút đăng nhập nhanh
              (Admin, Giảng viên, Học viên) ở trang Đăng nhập mà không cần mật khẩu.
            </p>
          </div>

          <div className="space-y-3">
            <a
              href="mailto:admin@donga.edu.vn?subject=Y%C3%AAu%20c%E1%BA%A7u%20c%E1%BA%A5p%20l%E1%BA%A1i%20m%E1%BA%ADt%20kh%E1%BA%A9u%20Smart%20LMS"
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors shadow-sm text-sm"
            >
              <Mail className="w-4 h-4" />
              Gửi email tới Ban quản trị
            </a>
            <Link
              href="/login"
              className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2.5 px-4 rounded-xl transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Quay lại trang Đăng nhập
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
