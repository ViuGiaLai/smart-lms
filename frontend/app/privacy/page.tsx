import Link from 'next/link'
import { ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react'

export const metadata = {
  title: 'Chính sách bảo mật',
  description: 'Chính sách bảo mật và xử lý dữ liệu của nền tảng Smart LMS.',
}

const POLICIES = [
  {
    title: '1. Dữ liệu chúng tôi thu thập',
    body: 'Thông tin tài khoản (họ tên, email), tiến độ học tập, kết quả bài kiểm tra và lịch sử trao đổi với Trợ lý Gia sư AI phục vụ việc cá nhân hóa nội dung học.',
  },
  {
    title: '2. Mục đích sử dụng',
    body: 'Dữ liệu được dùng để xác thực người dùng, hiển thị tiến độ, tổng hợp báo cáo học tập cho giảng viên và cải thiện chất lượng truy xuất ngữ cảnh của AI Tutor.',
  },
  {
    title: '3. Lưu trữ và bảo vệ',
    body: 'Mật khẩu được băm bằng thuật toán bcrypt và không bao giờ lưu dạng văn bản thuần. Phiên làm việc sử dụng JWT có thời hạn. Dữ liệu quan hệ và vector embedding được lưu trong PostgreSQL (pgvector) với phân quyền theo vai trò.',
  },
  {
    title: '4. Chia sẻ với bên thứ ba',
    body: 'Nội dung câu hỏi của người học chỉ được gửi tới nhà cung cấp mô hình AI (Google Gemini) để sinh câu trả lời cho đúng phiên hỏi đáp. Hệ thống không bán hoặc trao đổi dữ liệu cá nhân cho mục đích quảng cáo.',
  },
  {
    title: '5. Quyền của người dùng',
    body: 'Bạn có thể yêu cầu xem, chỉnh sửa hoặc xóa dữ liệu cá nhân của mình bằng cách liên hệ Ban quản trị qua admin@donga.edu.vn.',
  },
  {
    title: '6. Thời gian lưu trữ',
    body: 'Dữ liệu được lưu trong suốt thời gian tài khoản còn hoạt động. Khi tài khoản bị xóa, bản ghi tiến độ và lịch sử chat liên quan cũng được xóa theo ràng buộc khóa ngoại.',
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-200">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            Smart LMS
          </span>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">Chính sách bảo mật</h1>
          </div>
          <p className="text-xs text-slate-500 mb-8">
            Cập nhật lần cuối: 13/10/2026 • Nền tảng học tập trực tuyến Smart LMS
          </p>

          <div className="space-y-6">
            {POLICIES.map((item) => (
              <section key={item.title}>
                <h2 className="text-sm font-bold text-slate-900 mb-1.5">{item.title}</h2>
                <p className="text-sm text-slate-600 leading-relaxed">{item.body}</p>
              </section>
            ))}
          </div>

          <div className="mt-10 pt-6 border-t border-slate-100">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2.5 px-4 rounded-xl transition-colors text-sm"
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
