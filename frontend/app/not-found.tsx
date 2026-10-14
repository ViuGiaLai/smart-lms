import Link from 'next/link'
import { GraduationCap, Home, BookOpen, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
          <GraduationCap className="w-9 h-9" />
        </div>
        <span className="inline-block text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1 rounded-full mb-3">
          Mã Lỗi 404
        </span>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">
          Không tìm thấy trang
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed mb-8">
          Địa chỉ liên kết bạn đang truy cập không tồn tại, đã bị đổi đường dẫn hoặc đang trong quá trình bảo trì nội dung.
        </p>

        <div className="space-y-3">
          <Link
            href="/"
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors shadow-sm"
          >
            <Home className="w-4 h-4" />
            Về Trang Chủ
          </Link>
          <Link
            href="/courses"
            className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2.5 px-4 rounded-xl transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Khám Phá Khóa Học
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-xs text-slate-600">
            Smart LMS • Hệ Thống Quản Lý Đào Tạo Trực Tuyến & Trợ Lý Gia Sư AI
          </p>
        </div>
      </div>
    </div>
  )
}
