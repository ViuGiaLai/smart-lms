'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity, BookOpen, Bot, Database, Layers, Lock, RefreshCw,
  Search, Server, ShieldCheck, Unlock, Users,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { useAuth } from '@/lib/auth-context';

type Section = 'overview' | 'users' | 'courses' | 'ai';
type ServiceStatus = 'online' | 'offline';

interface Stats { totalUsers: number; totalStudents: number; totalInstructors: number; totalCourses: number; publishedCourses: number; totalLessons: number; totalQuizSubmissions: number; totalIndexedChunks: number }
interface UserItem { id: string; name: string; email: string; role: string; isActive: boolean; createdAt: string }
interface CourseItem { id: string; title: string; instructor: { fullName: string }; level: string; totalLessons: number; status: 'draft' | 'published' | 'archived' }
interface Monitoring { backend: { status: ServiceStatus; version?: string }; database: { status: ServiceStatus; vectorChunks: number; indexedLessons: number }; aiService: { status: ServiceStatus; provider?: string | null; model?: string | null; version?: string | null } }

const emptyStats: Stats = { totalUsers: 0, totalStudents: 0, totalInstructors: 0, totalCourses: 0, publishedCourses: 0, totalLessons: 0, totalQuizSubmissions: 0, totalIndexedChunks: 0 };

function StatusPill({ status }: { status: ServiceStatus }) {
  const online = status === 'online';
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${online ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}><span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-rose-500'}`} />{online ? 'Sẵn sàng' : 'Không kết nối'}</span>;
}

export default function AdminDashboardPage() {
  const { isAuthorized } = useRoleGuard(['admin']);
  const { isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  const section: Section = tab === 'users' || tab === 'courses' || tab === 'ai' ? tab : 'overview';
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [monitoring, setMonitoring] = useState<Monitoring | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');

  const load = async () => {
    setLoading(true);
    const [statsResult, usersResult, coursesResult, monitoringResult] = await Promise.allSettled([
      adminApi.getStats(), adminApi.getUsers(), adminApi.getCourses(), adminApi.getAIMonitoring(),
    ]);
    if (statsResult.status === 'fulfilled') setStats(statsResult.value.data?.data || emptyStats);
    if (usersResult.status === 'fulfilled') setUsers(usersResult.value.data?.data || []);
    if (coursesResult.status === 'fulfilled') setCourses(coursesResult.value.data?.data || []);
    if (monitoringResult.status === 'fulfilled') setMonitoring(monitoringResult.value.data?.data || null);
    setLoading(false);
  };

  useEffect(() => { if (isAuthorized) load(); }, [isAuthorized]);
  useEffect(() => {
    if (window.location.hash === '#ai') router.replace('/admin-dashboard?tab=ai', { scroll: false });
  }, [router]);

  const filteredUsers = useMemo(() => users.filter((user) => {
    const q = search.toLowerCase();
    return (!q || user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q)) && (role === 'all' || user.role === role);
  }), [users, search, role]);

  const toggleUser = async (id: string) => {
    try { await adminApi.toggleUserStatus(id); setUsers((items) => items.map((u) => u.id === id ? { ...u, isActive: !u.isActive } : u)); } catch { /* API response is the source of truth; leave UI unchanged */ }
  };
  const changeRole = async (id: string, nextRole: string) => {
    try { await adminApi.changeUserRole(id, nextRole); setUsers((items) => items.map((u) => u.id === id ? { ...u, role: nextRole } : u)); } catch { /* leave UI unchanged */ }
  };
  const changeCourse = async (id: string, status: CourseItem['status']) => {
    try { await adminApi.changeCourseStatus(id, status); setCourses((items) => items.map((c) => c.id === id ? { ...c, status } : c)); } catch { /* leave UI unchanged */ }
  };

  const heading: Record<Section, [string, string]> = {
    overview: ['Bảng điều khiển Quản trị viên', 'Tổng quan vận hành hệ thống; chọn chức năng từ menu bên trái để quản lý chi tiết.'],
    users: ['Quản lý tài khoản & phân quyền', 'Quản lý trạng thái truy cập và vai trò người dùng.'],
    courses: ['Kiểm duyệt khóa học', 'Xuất bản, đưa về bản nháp hoặc lưu trữ từng khóa học.'],
    ai: ['Giám sát AI & dữ liệu', 'Trạng thái được kiểm tra từ backend, PostgreSQL/pgvector và AI Service.'],
  };

  if (!isAuthorized || authLoading) return <div className="min-h-[60vh] grid place-items-center text-sm font-medium text-slate-500">Đang kiểm tra quyền truy cập…</div>;

  return <main className="p-5 sm:p-7 lg:p-8 max-w-[1600px] mx-auto space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950">{heading[section][0]}</h1><p className="mt-1 text-sm text-slate-500">{heading[section][1]}</p></div>
      <div className="flex gap-2"><Link href="/quiz/bank" className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2 text-xs font-bold text-violet-700"><Layers className="w-4 h-4" />Ngân hàng đề</Link><button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 disabled:opacity-60"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Làm mới</button></div>
    </div>

    {section === 'overview' && <Overview stats={stats} />}
    {section === 'users' && <UsersPanel users={filteredUsers} search={search} role={role} setSearch={setSearch} setRole={setRole} onToggle={toggleUser} onRoleChange={changeRole} />}
    {section === 'courses' && <CoursesPanel courses={courses} onStatusChange={changeCourse} />}
    {section === 'ai' && <AiPanel monitoring={monitoring} />}
  </main>;
}

function Overview({ stats }: { stats: Stats }) {
  const cards = [[Users, 'Người dùng', stats.totalUsers, `${stats.totalStudents} học viên · ${stats.totalInstructors} giảng viên`], [BookOpen, 'Khóa học', stats.totalCourses, `${stats.publishedCourses} đã xuất bản`], [Layers, 'Bài học đã số hóa', stats.totalLessons, `${stats.totalIndexedChunks} đoạn dữ liệu vector`], [Activity, 'Lượt làm bài', stats.totalQuizSubmissions, 'Dữ liệu ghi nhận từ hệ thống']] as const;
  return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([Icon, label, value, note]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Icon className="w-5 h-5" /></div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-slate-950">{value}</p><p className="mt-2 text-xs text-slate-500">{note}</p></div>)}</div><div className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-bold text-slate-900">Điều hướng quản trị</h2><p className="mt-1 text-sm text-slate-500">Các phân hệ nằm ở menu trái để URL, mục đang chọn và nội dung luôn nhất quán.</p><div className="mt-5 grid gap-3 md:grid-cols-3"><QuickLink href="/admin-dashboard?tab=users" icon={<Users className="w-5 h-5" />} title="Tài khoản & phân quyền" text="Quản lý truy cập và vai trò." /><QuickLink href="/admin-dashboard?tab=courses" icon={<BookOpen className="w-5 h-5" />} title="Kiểm duyệt khóa học" text="Quản lý vòng đời khóa học." /><QuickLink href="/admin-dashboard?tab=ai" icon={<Bot className="w-5 h-5" />} title="AI & dữ liệu" text="Xem tình trạng hạ tầng thực tế." /></div></div></>;
}
function QuickLink({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) { return <Link href={href} className="rounded-xl border border-slate-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/30 transition"><div className="text-indigo-600">{icon}</div><p className="mt-3 text-sm font-bold text-slate-900">{title}</p><p className="mt-1 text-xs text-slate-500">{text}</p></Link>; }

function UsersPanel({ users, search, role, setSearch, setRole, onToggle, onRoleChange }: { users: UserItem[]; search: string; role: string; setSearch: (s: string) => void; setRole: (s: string) => void; onToggle: (id: string) => void; onRoleChange: (id: string, role: string) => void }) { return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Danh sách người dùng ({users.length})</h2><p className="text-xs text-slate-500 mt-1">Thay đổi quyền hoặc khóa/mở khóa tài khoản.</p></div><div className="flex gap-2"><label className="relative"><Search className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tên hoặc email" className="w-48 rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-400" /></label><select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-slate-200 px-3 text-xs font-semibold"><option value="all">Tất cả vai trò</option><option value="student">Học viên</option><option value="instructor">Giảng viên</option><option value="admin">Admin</option></select></div></div><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4 font-bold">NGƯỜI DÙNG</th><th className="p-4 font-bold">VAI TRÒ</th><th className="p-4 font-bold">TRẠNG THÁI</th><th className="p-4 font-bold">NGÀY TẠO</th><th className="p-4 font-bold text-right">THAO TÁC</th></tr></thead><tbody>{users.map((u) => <tr key={u.id} className="border-t border-slate-100"><td className="p-4"><p className="font-bold text-slate-900">{u.name}</p><p className="mt-0.5 text-slate-500">{u.email}</p></td><td className="p-4"><select value={u.role} onChange={(e) => onRoleChange(u.id, e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold"><option value="student">Học viên</option><option value="instructor">Giảng viên</option><option value="admin">Admin</option></select></td><td className="p-4"><span className={`rounded-full px-2.5 py-1 font-bold ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{u.isActive ? 'Hoạt động' : 'Đã khóa'}</span></td><td className="p-4 text-slate-500">{u.createdAt}</td><td className="p-4 text-right"><button onClick={() => onToggle(u.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50">{u.isActive ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}{u.isActive ? 'Khóa' : 'Mở khóa'}</button></td></tr>)}</tbody></table></div></section>; }

function CoursesPanel({ courses, onStatusChange }: { courses: CourseItem[]; onStatusChange: (id: string, status: CourseItem['status']) => void }) { const label: Record<CourseItem['status'], string> = { draft: 'Bản nháp', published: 'Đã xuất bản', archived: 'Đã lưu trữ' }; return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-900">Tất cả khóa học ({courses.length})</h2><p className="mt-1 text-xs text-slate-500">Chỉ Admin có quyền thay đổi trạng thái xuất bản.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">KHÓA HỌC</th><th className="p-4">GIẢNG VIÊN</th><th className="p-4">BÀI HỌC</th><th className="p-4">CẤP ĐỘ</th><th className="p-4">TRẠNG THÁI</th></tr></thead><tbody>{courses.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="p-4 font-bold text-slate-900">{c.title}</td><td className="p-4 text-slate-600">{c.instructor.fullName}</td><td className="p-4 text-slate-600">{c.totalLessons}</td><td className="p-4 capitalize text-slate-600">{c.level}</td><td className="p-4"><select value={c.status} onChange={(e) => onStatusChange(c.id, e.target.value as CourseItem['status'])} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold"><option value="draft">{label.draft}</option><option value="published">{label.published}</option><option value="archived">{label.archived}</option></select></td></tr>)}</tbody></table></div></section>; }

function AiPanel({ monitoring }: { monitoring: Monitoring | null }) { if (!monitoring) return <section className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Chưa nhận được dữ liệu giám sát. Hãy làm mới để kiểm tra lại.</section>; const services = [[Server, 'Backend API', monitoring.backend.status, `Phiên bản ${monitoring.backend.version || 'không xác định'}`], [Database, 'PostgreSQL + pgvector', monitoring.database.status, `${monitoring.database.vectorChunks} đoạn vector · ${monitoring.database.indexedLessons} bài học đã lập chỉ mục`], [Bot, 'AI Service', monitoring.aiService.status, monitoring.aiService.status === 'online' ? `${monitoring.aiService.provider || 'AI'} · ${monitoring.aiService.model || 'mô hình không công bố'}` : 'Không nhận được phản hồi từ AI Service']] as const; return <><div className="grid gap-4 lg:grid-cols-3">{services.map(([Icon, name, status, detail]) => <section key={name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Icon className="w-5 h-5" /></div><StatusPill status={status} /></div><h2 className="mt-5 font-bold text-slate-900">{name}</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p></section>)}</div><section className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex gap-3"><ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" /><div><h2 className="font-bold text-slate-900">Phạm vi giám sát</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">Trang này chỉ hiển thị trạng thái dịch vụ và dữ liệu có thể xác minh. Hệ thống hiện chưa lưu telemetry cho token, độ trễ hay tỉ lệ thành công, nên các chỉ số suy diễn đã được loại bỏ thay vì hiển thị số liệu không chính xác.</p></div></div></section></>; }
