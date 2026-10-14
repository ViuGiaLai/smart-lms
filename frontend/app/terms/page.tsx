import Link from 'next/link'
import { ArrowLeft, FileText, Sparkles } from 'lucide-react'

export const metadata = {
  title: 'Điều khoản sử dụng',
  description: 'Điều khoản sử dụng nền tảng học tập Smart LMS.',
}

const TERMS = [
  {
    title: '1. Phạm vi áp dụng',
    body: 'Điều khoản này áp dụng cho mọi tài khoản truy cập nền tảng Smart LMS, bao gồm Học viên, Giảng viên và Quản trị viên. Khi đăng nhập, bạn đồng ý tuân thủ các nội dung được nêu tại đây.',
  },
  {
    title: '2. Tài khoản và bảo mật',
    body: 'Người dùng có trách nhiệm bảo mật thông tin đăng nhập của mình. Mọi hành vi sử dụng tài khoản để truy cập trái phép học liệu hoặc thao tác dữ liệu của người khác đều bị coi là vi phạm.',
  },
  {
    title: '3. Sử dụng Trợ lý Gia sư AI',
    body: 'Trợ lý AI trả lời dựa trên ngữ cảnh của đúng bài học đang mở (Lesson-bounded RAG). Nội dung do AI sinh ra mang tính hỗ trợ học tập, không thay thế hoàn toàn kết luận của giảng viên.',
  },
  {
    title: '4. Học liệu và quyền sở hữu trí tuệ',
    body: 'Tài liệu, slide, video bài giảng thuộc quyền sở hữu của giảng viên và/hoặc cơ sở đào tạo. Người dùng không được sao chép, phát hành lại vì mục đích thương mại khi chưa được chấp thuận.',
  },
  {
    title: '5. Hành vi bị nghiêm cấm',
    body: 'Nghiêm cấm tấn công, dò quét, khai thác lỗ hổng; tự động thu thập dữ liệu; gian lận trong kiểm tra, đánh giá; hoặc đăng tải nội dung sai lệch, xúc phạm.',
  },
  {
    title: '6. Thay đổi điều khoản',
    body: 'Ban quản trị có thể cập nhật điều khoản để phù hợp với thực tế vận hành. Phiên bản mới sẽ có hiệu lực ngay khi được công bố trên trang này.',
  },
]

export default function TermsPage() {
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
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">Điều khoản sử dụng</h1>
          </div>
          <p className="text-xs text-slate-500 mb-8">
            Cập nhật lần cuối: 13/10/2026 • Nền tảng học tập trực tuyến Smart LMS
          </p>

          <div className="space-y-6">
            {TERMS.map((item) => (
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
