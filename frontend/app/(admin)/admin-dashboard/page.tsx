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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

type Section = 'overview' | 'users' | 'courses' | 'ai';
type ServiceStatus = 'online' | 'offline';

interface Stats { totalUsers: number; totalStudents: number; totalInstructors: number; totalCourses: number; publishedCourses: number; totalLessons: number; totalQuizSubmissions: number; totalIndexedChunks: number }
interface UserItem { id: string; name: string; email: string; role: string; isActive: boolean; createdAt: string }
interface CourseItem { id: string; title: string; instructor: { fullName: string }; level: string; totalLessons: number; status: 'draft' | 'published' | 'archived' }
interface Monitoring { backend: { status: ServiceStatus; version?: string }; database: { status: ServiceStatus; vectorChunks: number; indexedLessons: number }; aiService: { status: ServiceStatus; provider?: string | null; model?: string | null; version?: string | null } }

const emptyStats: Stats = { totalUsers: 0, totalStudents: 0, totalInstructors: 0, totalCourses: 0, publishedCourses: 0, totalLessons: 0, totalQuizSubmissions: 0, totalIndexedChunks: 0 };

function StatusPill({ status }: { status: ServiceStatus }) {
  const online = status === 'online';
  return (
    <Badge variant={online ? 'success' : 'destructive'} className="gap-1.5 px-2.5 py-1 text-[11px] font-bold">
      <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-rose-500'}`} />
      {online ? 'Sẵn sàng' : 'Không kết nối'}
    </Badge>
  );
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

  if (!isAuthorized || authLoading) return <div className="grid min-h-[60vh] place-items-center text-sm font-medium text-muted-foreground">Đang kiểm tra quyền truy cập…</div>;

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{heading[section][0]}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{heading[section][1]}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/quiz/bank">
              <Layers className="h-4 w-4" />Ngân hàng đề
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Làm mới
          </Button>
        </div>
      </div>

      {section === 'overview' && <Overview stats={stats} />}
      {section === 'users' && <UsersPanel users={filteredUsers} search={search} role={role} setSearch={setSearch} setRole={setRole} onToggle={toggleUser} onRoleChange={changeRole} />}
      {section === 'courses' && <CoursesPanel courses={courses} onStatusChange={changeCourse} />}
      {section === 'ai' && <AiPanel monitoring={monitoring} />}
    </main>
  );
}

function Overview({ stats }: { stats: Stats }) {
  const cards = [[Users, 'Người dùng', stats.totalUsers, `${stats.totalStudents} học viên · ${stats.totalInstructors} giảng viên`], [BookOpen, 'Khóa học', stats.totalCourses, `${stats.publishedCourses} đã xuất bản`], [Layers, 'Bài học đã số hóa', stats.totalLessons, `${stats.totalIndexedChunks} đoạn dữ liệu vector`], [Activity, 'Lượt làm bài', stats.totalQuizSubmissions, 'Dữ liệu ghi nhận từ hệ thống']] as const;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([Icon, label, value, note]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p className="mt-1 text-3xl font-black text-foreground">{value}</p>
              <p className="mt-2 text-xs text-muted-foreground">{note}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-6">
          <h2 className="font-bold text-foreground">Điều hướng quản trị</h2>
          <p className="mt-1 text-sm text-muted-foreground">Các phân hệ nằm ở menu trái để URL, mục đang chọn và nội dung luôn nhất quán.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <QuickLink href="/admin-dashboard?tab=users" icon={<Users className="h-5 w-5" />} title="Tài khoản & phân quyền" text="Quản lý truy cập và vai trò." />
            <QuickLink href="/admin-dashboard?tab=courses" icon={<BookOpen className="h-5 w-5" />} title="Kiểm duyệt khóa học" text="Quản lý vòng đời khóa học." />
            <QuickLink href="/admin-dashboard?tab=ai" icon={<Bot className="h-5 w-5" />} title="AI & dữ liệu" text="Xem tình trạng hạ tầng thực tế." />
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function QuickLink({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Button asChild variant="outline" size="default" className="h-auto block w-full justify-start rounded-xl p-4 text-left">
      <Link href={href}>
        <div className="text-primary">{icon}</div>
        <p className="mt-3 text-sm font-bold text-foreground">{title}</p>
        <p className="mt-1 text-xs font-normal text-muted-foreground">{text}</p>
      </Link>
    </Button>
  );
}

function UsersPanel({ users, search, role, setSearch, setRole, onToggle, onRoleChange }: { users: UserItem[]; search: string; role: string; setSearch: (s: string) => void; setRole: (s: string) => void; onToggle: (id: string) => void; onRoleChange: (id: string, role: string) => void }) {
  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold text-foreground">Danh sách người dùng ({users.length})</h2>
          <p className="mt-1 text-xs text-muted-foreground">Thay đổi quyền hoặc khóa/mở khóa tài khoản.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tên hoặc email"
              className="h-9 w-48 pl-9 text-xs"
            />
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Tất cả vai trò</option>
            <option value="student">Học viên</option>
            <option value="instructor">Giảng viên</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-4 font-bold">NGƯỜI DÙNG</th>
              <th className="p-4 font-bold">VAI TRÒ</th>
              <th className="p-4 font-bold">TRẠNG THÁI</th>
              <th className="p-4 font-bold">NGÀY TẠO</th>
              <th className="p-4 text-right font-bold">THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="p-4">
                  <p className="font-bold text-foreground">{u.name}</p>
                  <p className="mt-0.5 text-muted-foreground">{u.email}</p>
                </td>
                <td className="p-4">
                  <select
                    value={u.role}
                    onChange={(e) => onRoleChange(u.id, e.target.value)}
                    className="rounded-lg border border-input bg-background px-2.5 py-1.5 font-semibold text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="student">Học viên</option>
                    <option value="instructor">Giảng viên</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="p-4">
                  <Badge variant={u.isActive ? 'success' : 'destructive'} className="font-bold">
                    {u.isActive ? 'Hoạt động' : 'Đã khóa'}
                  </Badge>
                </td>
                <td className="p-4 text-muted-foreground">{u.createdAt}</td>
                <td className="p-4 text-right">
                  <Button variant="outline" size="sm" onClick={() => onToggle(u.id)} className="gap-1.5">
                    {u.isActive ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                    {u.isActive ? 'Khóa' : 'Mở khóa'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CoursesPanel({ courses, onStatusChange }: { courses: CourseItem[]; onStatusChange: (id: string, status: CourseItem['status']) => void }) {
  const label: Record<CourseItem['status'], string> = { draft: 'Bản nháp', published: 'Đã xuất bản', archived: 'Đã lưu trữ' };
  return (
    <Card>
      <div className="border-b border-border p-5">
        <h2 className="font-bold text-foreground">Tất cả khóa học ({courses.length})</h2>
        <p className="mt-1 text-xs text-muted-foreground">Chỉ Admin có quyền thay đổi trạng thái xuất bản.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-4 font-bold">KHÓA HỌC</th>
              <th className="p-4 font-bold">GIẢNG VIÊN</th>
              <th className="p-4 font-bold">BÀI HỌC</th>
              <th className="p-4 font-bold">CẤP ĐỘ</th>
              <th className="p-4 font-bold">TRẠNG THÁI</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-4 font-bold text-foreground">{c.title}</td>
                <td className="p-4 text-muted-foreground">{c.instructor.fullName}</td>
                <td className="p-4 text-muted-foreground">{c.totalLessons}</td>
                <td className="p-4 capitalize text-muted-foreground">{c.level}</td>
                <td className="p-4">
                  <select
                    value={c.status}
                    onChange={(e) => onStatusChange(c.id, e.target.value as CourseItem['status'])}
                    className="rounded-lg border border-input bg-background px-2.5 py-1.5 font-semibold text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="draft">{label.draft}</option>
                    <option value="published">{label.published}</option>
                    <option value="archived">{label.archived}</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AiPanel({ monitoring }: { monitoring: Monitoring | null }) {
  if (!monitoring) {
    return (
      <Card className="p-8 text-sm text-muted-foreground">Chưa nhận được dữ liệu giám sát. Hãy làm mới để kiểm tra lại.</Card>
    );
  }
  const services = [[Server, 'Backend API', monitoring.backend.status, `Phiên bản ${monitoring.backend.version || 'không xác định'}`], [Database, 'PostgreSQL + pgvector', monitoring.database.status, `${monitoring.database.vectorChunks} đoạn vector · ${monitoring.database.indexedLessons} bài học đã lập chỉ mục`], [Bot, 'AI Service', monitoring.aiService.status, monitoring.aiService.status === 'online' ? `${monitoring.aiService.provider || 'AI'} · ${monitoring.aiService.model || 'mô hình không công bố'}` : 'Không nhận được phản hồi từ AI Service']] as const;
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {services.map(([Icon, name, status, detail]) => (
          <Card key={name}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <StatusPill status={status} />
              </div>
              <h2 className="mt-5 font-bold text-foreground">{name}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="flex gap-3 p-6">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-bold text-foreground">Phạm vi giám sát</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Trang này chỉ hiển thị trạng thái dịch vụ và dữ liệu có thể xác minh. Hệ thống hiện chưa lưu telemetry cho token, độ trễ hay tỉ lệ thành công, nên các chỉ số suy diễn đã được loại bỏ thay vì hiển thị số liệu không chính xác.</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
