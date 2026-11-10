'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity, BookOpen, Bot, Database, Layers, Lock, RefreshCw,
  Search, Server, ShieldCheck, Unlock, Users, Plus, CheckCircle2,
  Sparkles, Wand2, ArrowRight, Play, FileText, Check, X,
} from 'lucide-react';
import { adminApi, categoriesApi, educationLevelsApi, aiDiscoveryApi } from '@/lib/api';
import { useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { LearningCategoryItem, EducationLevelItem, DiscoveryJobItem } from '@/types';

type Section = 'overview' | 'users' | 'courses' | 'ai' | 'categories' | 'discovery';
type ServiceStatus = 'online' | 'offline';

interface Stats { totalUsers: number; totalStudents: number; totalInstructors: number; totalCourses: number; publishedCourses: number; totalLessons: number; totalQuizSubmissions: number; totalIndexedChunks: number }
interface UserItem { id: string; name: string; email: string; role: string; isActive: boolean; createdAt: string }
interface CourseItem { id: string; title: string; instructor: { fullName: string }; level: string; totalLessons: number; status: 'draft' | 'published' | 'archived' }
interface UsageByFeature { feature: string; tokens: number; requests: number }
interface UsageSummary {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
  last7DaysTokens: number;
  /** Tỉ lệ 0–1 số lần gọi không có usage metadata thật, phải ước lượng. */
  estimatedShare: number;
  byFeature: UsageByFeature[];
}
interface Monitoring {
  backend: { status: ServiceStatus; version?: string };
  database: { status: ServiceStatus; vectorChunks: number; indexedLessons: number };
  aiService: { status: ServiceStatus; provider?: string | null; model?: string | null; version?: string | null };
  usage?: UsageSummary;
}

const FEATURE_LABELS: Record<string, string> = {
  tutor: 'Gia sư AI',
  quiz: 'Sinh đề trắc nghiệm',
  grader: 'Chấm bài tự luận',
  summarizer: 'Tóm tắt bài giảng',
  discovery: 'Khám phá học liệu',
};

function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

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
  const section: Section =
    tab === 'users' || tab === 'courses' || tab === 'ai' || tab === 'categories' || tab === 'discovery'
      ? tab
      : 'overview';
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [monitoring, setMonitoring] = useState<Monitoring | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [actionMessage, setActionMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const [statsResult, usersResult, coursesResult, monitoringResult] = await Promise.allSettled([
      adminApi.getStats(), adminApi.getUsers(), adminApi.getCourses(), adminApi.getAIMonitoring(),
    ]);
    if (statsResult.status === 'fulfilled') setStats(statsResult.value.data?.data || emptyStats);
    if (usersResult.status === 'fulfilled') setUsers(usersResult.value.data?.data || []);
    if (coursesResult.status === 'fulfilled') setCourses(coursesResult.value.data?.data || []);
    if (monitoringResult.status === 'fulfilled') setMonitoring(monitoringResult.value.data?.data || null);
    if (statsResult.status === 'rejected' && usersResult.status === 'rejected') {
      setActionMessage({
        kind: 'error',
        text:
          (statsResult.reason as any)?.response?.data?.detail ||
          'Không tải được dữ liệu quản trị. Vui lòng thử lại.',
      });
    }
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

  const reportError = (err: unknown, fallback: string) => {
    const detail =
      (err as any)?.response?.data?.detail || (err as any)?.response?.data?.message || '';
    setActionMessage({ kind: 'error', text: detail || fallback });
  };

  const toggleUser = async (id: string) => {
    setActionMessage(null);
    try {
      await adminApi.toggleUserStatus(id);
      setUsers((items) => items.map((u) => u.id === id ? { ...u, isActive: !u.isActive } : u));
      setActionMessage({ kind: 'ok', text: 'Đã cập nhật trạng thái tài khoản.' });
    } catch (err) {
      reportError(err, 'Không cập nhật được trạng thái tài khoản.');
    }
  };

  const changeRole = async (id: string, newRole: string) => {
    setActionMessage(null);
    try {
      await adminApi.changeUserRole(id, newRole);
      setUsers((items) => items.map((u) => u.id === id ? { ...u, role: newRole } : u));
      setActionMessage({ kind: 'ok', text: 'Đã cập nhật vai trò người dùng.' });
    } catch (err) {
      reportError(err, 'Không cập nhật được vai trò người dùng.');
    }
  };

  const changeCourse = async (id: string, newStatus: CourseItem['status']) => {
    setActionMessage(null);
    try {
      await adminApi.changeCourseStatus(id, newStatus);
      setCourses((items) => items.map((c) => c.id === id ? { ...c, status: newStatus } : c));
      setActionMessage({ kind: 'ok', text: 'Đã cập nhật trạng thái khóa học.' });
    } catch (err) {
      reportError(err, 'Không đổi được trạng thái khóa học.');
    }
  };

  const heading: Record<Section, [string, string]> = {
    overview: ['Bảng điều khiển Quản trị viên', 'Tổng quan vận hành hệ thống Smart LMS.'],
    users: ['Quản lý tài khoản & phân quyền', 'Quản lý trạng thái truy cập và vai trò người dùng.'],
    courses: ['Kiểm duyệt khóa học', 'Xuất bản, đưa về bản nháp hoặc lưu trữ từng khóa học.'],
    ai: ['Giám sát AI & dữ liệu', 'Trạng thái được kiểm tra từ backend, PostgreSQL/pgvector và AI Service.'],
    categories: ['Quản lý Danh mục & Cấp học', 'Cấu hình động lĩnh vực, môn học và cấp độ đào tạo mà không cần sửa mã nguồn.'],
    discovery: ['Trung tâm Khám phá Học liệu AI', 'AI tự động tìm kiếm, đề xuất chương trình, video và học liệu mở để Admin duyệt.'],
  };

  if (!isAuthorized || authLoading) {
    return <PageSkeleton />;
  }

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 p-5 sm:p-7 lg:p-8 font-sans">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{heading[section][0]}</h1>
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

      {actionMessage && (
        <div
          role={actionMessage.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-3.5 py-2.5 text-xs font-semibold ${
            actionMessage.kind === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {section === 'overview' && <Overview stats={stats} />}
      {section === 'users' && <UsersPanel users={filteredUsers} search={search} role={role} setSearch={setSearch} setRole={setRole} onToggle={toggleUser} onRoleChange={changeRole} />}
      {section === 'courses' && <CoursesPanel courses={courses} onStatusChange={changeCourse} />}
      {section === 'ai' && <AiPanel monitoring={monitoring} />}
      {section === 'categories' && <CategoriesPanel onMessage={setActionMessage} />}
      {section === 'discovery' && <DiscoveryPanel onMessage={setActionMessage} />}
    </main>
  );
}

function Overview({ stats }: { stats: Stats }) {
  const cards = [
    [Users, 'Tổng người dùng', stats.totalUsers, `${stats.totalStudents} học sinh/sinh viên · ${stats.totalInstructors} giảng viên`],
    [BookOpen, 'Tổng khóa học', stats.totalCourses, `${stats.publishedCourses} đã xuất bản`],
    [Layers, 'Bài học & Nội dung', stats.totalLessons, `${stats.totalQuizSubmissions} lượt làm bài kiểm tra`],
    [Database, 'Kho tri thức AI (pgvector)', stats.totalIndexedChunks, 'Đoạn văn bản/phụ đề đã số hóa cho RAG'],
  ] as const;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(([Icon, title, value, sub]) => (
        <Card key={title}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">{title}</p>
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UsersPanel({ users, search, role, setSearch, setRole, onToggle, onRoleChange }: { users: UserItem[]; search: string; role: string; setSearch: (v: string) => void; setRole: (v: string) => void; onToggle: (id: string) => void; onRoleChange: (id: string, role: string) => void }) {
  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold text-foreground">Danh sách tài khoản ({users.length})</h2>
          <p className="mt-1 text-xs text-muted-foreground">Khóa tài khoản hoặc phân quyền giảng viên, quản trị viên.</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Tìm theo tên hoặc email..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-56 text-xs" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-input bg-background px-2.5 text-xs font-semibold text-foreground shadow-sm">
            <option value="all">Tất cả vai trò</option>
            <option value="student">Học viên</option>
            <option value="instructor">Giảng viên</option>
            <option value="admin">Quản trị viên</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-4 font-bold">NGƯỜI DÙNG</th>
              <th className="p-4 font-bold">VAI TRÒ</th>
              <th className="p-4 font-bold">TRẠNG THÁI</th>
              <th className="p-4 font-bold">THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="p-4">
                  <div className="font-bold text-foreground">{u.name}</div>
                  <div className="text-muted-foreground">{u.email}</div>
                </td>
                <td className="p-4">
                  <select value={u.role} onChange={(e) => onRoleChange(u.id, e.target.value)} className="rounded-lg border border-input bg-background px-2 py-1 text-xs font-semibold text-foreground shadow-sm">
                    <option value="student">Học viên</option>
                    <option value="instructor">Giảng viên</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                </td>
                <td className="p-4">
                  <Badge variant={u.isActive ? 'success' : 'destructive'} className="text-[11px] font-bold">
                    {u.isActive ? 'Đang hoạt động' : 'Bị khóa'}
                  </Badge>
                </td>
                <td className="p-4">
                  <Button variant="outline" size="sm" onClick={() => onToggle(u.id)} className="gap-1.5 text-xs font-semibold">
                    {u.isActive ? <Lock className="h-3.5 w-3.5 text-destructive" /> : <Unlock className="h-3.5 w-3.5 text-emerald-600" />}
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
              <th className="p-4 font-bold text-right">HỌC LIỆU</th>
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
                <td className="p-4 text-right">
                  <Link
                    href={`/courses/${c.id}/manage`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-input px-2.5 py-1.5 font-bold text-foreground hover:bg-muted"
                  >
                    <FileText className="h-3.5 w-3.5" /> Quản lý học liệu
                  </Link>
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
  const usage = monitoring.usage;
  const featureRows = usage?.byFeature ?? [];
  const maxFeatureTokens = featureRows.reduce((max, row) => Math.max(max, row.tokens), 0);
  const estimatedPercent = Math.round((usage?.estimatedShare ?? 0) * 100);
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        {services.map(([Icon, name, status, detail]) => (
          <Card key={name}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
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
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <div>
                <h2 className="font-bold text-foreground">Lượng token AI đã dùng</h2>
                <p className="text-xs text-muted-foreground">
                  Số liệu ghi tại bảng <code className="rounded bg-muted px-1 py-0.5 text-[11px]">ai_usage_logs</code> sau mỗi lượt gọi mô hình.
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="text-[11px] font-semibold">
              {usage?.requests ?? 0} lượt gọi
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground">Tổng token</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatTokens(usage?.totalTokens ?? 0)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatTokens(usage?.promptTokens ?? 0)} đầu vào · {formatTokens(usage?.completionTokens ?? 0)} đầu ra
              </p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground">7 ngày gần nhất</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatTokens(usage?.last7DaysTokens ?? 0)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">Token tiêu thụ trong tuần</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground">Số liệu ước lượng</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{estimatedPercent}%</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {estimatedPercent > 0
                  ? 'Phần còn lại là số thật do nhà cung cấp trả về'
                  : 'Toàn bộ đều là số thật do nhà cung cấp trả về'}
              </p>
            </div>
          </div>

          {featureRows.length > 0 ? (
            <div className="space-y-2.5">
              {featureRows.map((row) => {
                const width = maxFeatureTokens > 0 ? Math.max(4, Math.round((row.tokens / maxFeatureTokens) * 100)) : 0;
                return (
                  <div key={row.feature} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-foreground">
                        {FEATURE_LABELS[row.feature] || row.feature}
                      </span>
                      <span className="text-muted-foreground">
                        {formatTokens(row.tokens)} token · {row.requests} lượt
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              Chưa có lượt gọi AI nào được ghi nhận. Số liệu sẽ xuất hiện sau khi học viên hỏi gia sư AI, giảng viên sinh đề hoặc chấm bài tự luận.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex gap-3 p-6">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-bold text-foreground">Phạm vi giám sát & Tương thích Đa lĩnh vực</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Hệ thống AI Tutor RAG áp dụng pgvector cho toàn bộ các lĩnh vực (Toán học, Ngoại ngữ, Lập trình, Kỹ năng sống...). Mỗi bài học được lưu trữ độc lập theo lesson_id và course_id để đảm bảo độ chính xác và trích dẫn chuẩn xác mốc thời gian.</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function CategoriesPanel({ onMessage }: { onMessage: (msg: { kind: 'ok' | 'error'; text: string }) => void }) {
  const [tree, setTree] = useState<LearningCategoryItem[]>([]);
  const [levels, setLevels] = useState<EducationLevelItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Form tạo category mới
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatParent, setNewCatParent] = useState<number | null>(null);

  // Form tạo level mới
  const [newLevelName, setNewLevelName] = useState('');
  const [newLevelCode, setNewLevelCode] = useState('');
  const [newLevelDesc, setNewLevelDesc] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, lvlRes] = await Promise.all([
        categoriesApi.getTree(true),
        educationLevelsApi.getAll(true),
      ]);
      setTree(catRes.data?.data?.tree || []);
      setLevels(lvlRes.data?.data || []);
    } catch {
      onMessage({ kind: 'error', text: 'Không tải được danh mục hoặc cấp học.' });
    }
    setLoading(false);
  }, [onMessage]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await categoriesApi.create({
        name: newCatName.trim(),
        description: newCatDesc.trim() || undefined,
        parent_id: newCatParent,
      });
      onMessage({ kind: 'ok', text: `Đã thêm danh mục '${newCatName}' thành công.` });
      setNewCatName('');
      setNewCatDesc('');
      setNewCatParent(null);
      loadData();
    } catch (err: any) {
      onMessage({ kind: 'error', text: err?.response?.data?.detail || 'Lỗi khi tạo danh mục.' });
    }
  };

  const handleCreateLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLevelName.trim() || !newLevelCode.trim()) return;
    try {
      await educationLevelsApi.create({
        name: newLevelName.trim(),
        code: newLevelCode.trim().toUpperCase(),
        description: newLevelDesc.trim() || undefined,
      });
      onMessage({ kind: 'ok', text: `Đã thêm cấp học '${newLevelName}' thành công.` });
      setNewLevelName('');
      setNewLevelCode('');
      setNewLevelDesc('');
      loadData();
    } catch (err: any) {
      onMessage({ kind: 'error', text: err?.response?.data?.detail || 'Lỗi khi tạo cấp học.' });
    }
  };

  const toggleCategoryStatus = async (cat: LearningCategoryItem) => {
    try {
      await categoriesApi.update(cat.id, { is_active: !cat.isActive });
      onMessage({ kind: 'ok', text: `Đã cập nhật trạng thái '${cat.name}'.` });
      loadData();
    } catch {
      onMessage({ kind: 'error', text: 'Lỗi khi cập nhật danh mục.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Cây Danh mục Lĩnh vực & Môn học ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <div className="border-b border-border p-5 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-foreground">Cây Danh mục Lĩnh vực & Môn học ({tree.length} nhóm chính)</h2>
                <p className="mt-1 text-xs text-muted-foreground">Admin chủ động thêm môn học, phân nhánh cha-con mà không cần sửa code.</p>
              </div>
              <Button size="sm" variant="outline" onClick={loadData} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Làm mới
              </Button>
            </div>
            <div className="p-5 space-y-4 max-h-[550px] overflow-y-auto">
              {tree.map((parent) => (
                <div key={parent.id} className="border border-stone-200 rounded-lg p-3.5 bg-stone-50/50 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-stone-900">{parent.name}</span>
                      <Badge variant={parent.isActive ? 'success' : 'secondary'} className="text-[10px]">
                        {parent.isActive ? 'Hoạt động' : 'Đã ẩn'}
                      </Badge>
                      <span className="text-[11px] text-stone-400">({parent.children?.length || 0} môn con)</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleCategoryStatus(parent)}>
                      {parent.isActive ? 'Ẩn' : 'Bật'}
                    </Button>
                  </div>
                  {parent.description && <p className="text-xs text-stone-500">{parent.description}</p>}

                  {/* Môn học con */}
                  {parent.children && parent.children.length > 0 && (
                    <div className="pl-4 pt-1 border-l-2 border-brand-200 space-y-1.5">
                      {parent.children.map((ch) => (
                        <div key={ch.id} className="flex items-center justify-between text-xs py-1 px-2.5 bg-white rounded border border-stone-200">
                          <span className="font-medium text-stone-800">{ch.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-stone-400 font-mono">/{ch.slug}</span>
                            <button
                              type="button"
                              onClick={() => toggleCategoryStatus(ch)}
                              className="text-[10px] text-brand-600 hover:underline"
                            >
                              {ch.isActive ? 'Ẩn' : 'Bật'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Form thêm danh mục */}
        <div>
          <Card className="p-5 space-y-4">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-brand-600" /> Thêm Lĩnh vực / Môn học
            </h3>
            <form onSubmit={handleCreateCategory} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-stone-700">Tên lĩnh vực / môn học *</label>
                <Input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="VD: Toán học, Tiếng Nhật, Trí tuệ Nhân tạo..."
                  className="mt-1 text-xs"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-700">Thuộc nhóm cha (để trống nếu là gốc)</label>
                <select
                  value={newCatParent ?? ''}
                  onChange={(e) => setNewCatParent(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1 w-full rounded-lg border border-input bg-background p-2 text-xs font-medium"
                >
                  <option value="">(Là lĩnh vực gốc - Không có cha)</option>
                  {tree.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-700">Mô tả ngắn</label>
                <Input
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Mô tả tóm tắt nội dung đào tạo..."
                  className="mt-1 text-xs"
                />
              </div>
              <Button type="submit" size="sm" className="w-full text-xs font-semibold">
                Thêm vào hệ thống
              </Button>
            </form>
          </Card>
        </div>
      </div>

      {/* ── Cấp học & Trình độ đào tạo độc lập ── */}
      <div className="grid gap-6 lg:grid-cols-3 pt-2">
        <div className="lg:col-span-2">
          <Card>
            <div className="border-b border-border p-5">
              <h2 className="font-bold text-foreground">Cấp học & Trình độ Đào tạo ({levels.length} cấp)</h2>
              <p className="mt-1 text-xs text-muted-foreground">Bậc học đại học (ĐH Đông Á): Đại cương, Cơ sở ngành, Chuyên ngành, Đồ án, Chuẩn đầu ra, Sau đại học.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-3.5 font-bold">MÃ (CODE)</th>
                    <th className="p-3.5 font-bold">TÊN CẤP HỌC</th>
                    <th className="p-3.5 font-bold">MÔ TẢ</th>
                    <th className="p-3.5 font-bold">TRẠNG THÁI</th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map((lvl) => (
                    <tr key={lvl.id} className="border-t border-border">
                      <td className="p-3.5 font-mono font-bold text-brand-600">{lvl.code}</td>
                      <td className="p-3.5 font-bold text-foreground">{lvl.name}</td>
                      <td className="p-3.5 text-stone-500">{lvl.description}</td>
                      <td className="p-3.5">
                        <Badge variant={lvl.isActive ? 'success' : 'secondary'} className="text-[10px]">
                          {lvl.isActive ? 'Bật' : 'Tắt'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Form thêm cấp học */}
        <div>
          <Card className="p-5 space-y-4">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-brand-600" /> Thêm Cấp học mới
            </h3>
            <form onSubmit={handleCreateLevel} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-stone-700">Tên cấp học *</label>
                <Input
                  value={newLevelName}
                  onChange={(e) => setNewLevelName(e.target.value)}
                  placeholder="VD: Sau Đại học, Chứng chỉ Quốc tế..."
                  className="mt-1 text-xs"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-700">Mã cấp học (Unique code) *</label>
                <Input
                  value={newLevelCode}
                  onChange={(e) => setNewLevelCode(e.target.value)}
                  placeholder="VD: POST_GRADUATE, CERTIFIED..."
                  className="mt-1 text-xs font-mono uppercase"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-700">Mô tả</label>
                <Input
                  value={newLevelDesc}
                  onChange={(e) => setNewLevelDesc(e.target.value)}
                  placeholder="Mô tả phạm vi đào tạo..."
                  className="mt-1 text-xs"
                />
              </div>
              <Button type="submit" size="sm" className="w-full text-xs font-semibold">
                Thêm Cấp học
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DiscoveryPanel({ onMessage }: { onMessage: (msg: { kind: 'ok' | 'error'; text: string }) => void }) {
  const [topic, setTopic] = useState('');
  const [targetLevel, setTargetLevel] = useState('Chuyên ngành (Năm 3 - 4)');
  const [domainCategory, setDomainCategory] = useState('Khoa Công nghệ Thông tin');
  const [targetAudience, setTargetAudience] = useState('Sinh viên');

  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<DiscoveryJobItem[]>([]);
  const [activeJob, setActiveJob] = useState<any | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const res = await aiDiscoveryApi.getJobs();
      setJobs(res.data?.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const handleRunDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const res = await aiDiscoveryApi.discover({
        topic: topic.trim(),
        target_level: targetLevel,
        domain_category: domainCategory,
        target_audience: targetAudience,
      });
      onMessage({ kind: 'ok', text: `AI đã khám phá và sinh cấu trúc khóa học thành công cho '${topic}'!` });
      loadJobs();
      // Mở chi tiết job vừa tạo
      const jobId = res.data?.data?.jobId;
      if (jobId) {
        const detailRes = await aiDiscoveryApi.getJob(jobId);
        setActiveJob(detailRes.data?.data);
      }
    } catch (err: any) {
      onMessage({ kind: 'error', text: err?.response?.data?.detail || 'Lỗi khi chạy AI Discovery.' });
    }
    setLoading(false);
  };

  const handleApprove = async (id: number) => {
    try {
      await aiDiscoveryApi.approve(id);
      onMessage({ kind: 'ok', text: 'Đã phê duyệt đề xuất khóa học.' });
      loadJobs();
      if (activeJob?.id === id) setActiveJob((p: any) => ({ ...p, status: 'approved' }));
    } catch {
      onMessage({ kind: 'error', text: 'Lỗi khi duyệt.' });
    }
  };

  const handleConvertToCourse = async (id: number) => {
    try {
      const res = await aiDiscoveryApi.convertToCourse(id, { auto_publish: true });
      onMessage({ kind: 'ok', text: res.data?.message || 'Đã chuyển đổi thành khóa học thực tế trên LMS!' });
      loadJobs();
      if (activeJob?.id === id) setActiveJob((p: any) => ({ ...p, status: 'converted' }));
    } catch {
      onMessage({ kind: 'error', text: 'Lỗi khi chuyển đổi thành khóa học.' });
    }
  };

  const viewDetail = async (id: number) => {
    try {
      const res = await aiDiscoveryApi.getJob(id);
      setActiveJob(res.data?.data);
    } catch {}
  };

  return (
    <div className="space-y-6">
      {/* ── Search / Discovery Input Form ── */}
      <Card className="p-6 bg-linear-to-r from-brand-50/50 to-white border-brand-200">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-100 text-brand-800">
            <Sparkles className="w-3.5 h-3.5 text-brand-600" /> AI Discovery & Curriculum Builder
          </span>
        </div>
        <h2 className="text-xl font-bold text-stone-900">Khám phá và Đề xuất Học liệu Tự động bằng AI</h2>
        <p className="mt-1 text-xs text-stone-600 max-w-2xl leading-relaxed">
          Nhập chủ đề bất kỳ (Toán học, Tiếng Anh, Lập trình, Kỹ năng sống...). AI sẽ tự động nghiên cứu khung chương trình, đề xuất các bài học kèm video YouTube thực tế, bài tập và học liệu mở để bạn xem trước và duyệt.
        </p>

        <form onSubmit={handleRunDiscovery} className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-stone-700">Học phần / Chủ đề đào tạo cần khám phá *</label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="VD: Toán cao cấp & Giải tích, Lập trình Web Next.js/FastAPI, Tiếng Anh chuyên ngành IT..."
                className="mt-1 text-xs h-10 bg-white"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-700">Khoa / Khối ngành</label>
              <select
                value={domainCategory}
                onChange={(e) => setDomainCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-white p-2 text-xs font-medium h-10"
              >
                <option value="Khoa Công nghệ Thông tin">Khoa Công nghệ Thông tin</option>
                <option value="Khoa Ngoại ngữ">Khoa Ngoại ngữ</option>
                <option value="Khoa Quản trị - Kinh tế">Khoa Quản trị - Kinh tế</option>
                <option value="Khoa Khoa học Cơ bản & Đại cương">Khoa Khoa học Cơ bản & Đại cương</option>
                <option value="Khoa Kỹ thuật - Tự động hóa">Khoa Kỹ thuật - Tự động hóa</option>
                <option value="Kỹ năng Bổ trợ & Hướng nghiệp ĐH Đông Á">Kỹ năng Bổ trợ & Hướng nghiệp</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-700">Bậc đào tạo</label>
              <select
                value={targetLevel}
                onChange={(e) => setTargetLevel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-white p-2 text-xs font-medium h-10"
              >
                <option value="Đại cương (Năm 1 - 2)">Đại cương (Năm 1 - 2)</option>
                <option value="Cơ sở ngành (Năm 2 - 3)">Cơ sở ngành (Năm 2 - 3)</option>
                <option value="Chuyên ngành (Năm 3 - 4)">Chuyên ngành (Năm 3 - 4)</option>
                <option value="Đồ án & Khóa luận tốt nghiệp">Đồ án & Khóa luận tốt nghiệp</option>
                <option value="Chuẩn đầu ra & Chứng chỉ nghề">Chuẩn đầu ra & Chứng chỉ nghề</option>
                <option value="Sau đại học & Nghiên cứu">Sau đại học & Nghiên cứu</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={loading || !topic.trim()} className="text-xs font-semibold h-10 px-6 gap-2">
              <Wand2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'AI đang tìm kiếm & xây dựng giáo trình...' : 'Bắt đầu Khám phá & Sinh khóa học'}
            </Button>
          </div>
        </form>
      </Card>

      {/* ── Kết quả Khám phá gần đây & Chi tiết Đề xuất ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Danh sách jobs */}
        <div>
          <Card>
            <div className="border-b border-border p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm text-foreground">Lịch sử Khám phá ({jobs.length})</h3>
              <Button variant="ghost" size="sm" onClick={loadJobs} className="h-7 text-xs">
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
            <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
              {jobs.length === 0 ? (
                <p className="text-xs text-stone-400 text-center py-6">Chưa có phiên khám phá nào. Hãy nhập chủ đề ở trên!</p>
              ) : (
                jobs.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => viewDetail(j.id)}
                    className={`w-full text-left p-3 rounded-lg border transition text-xs space-y-1 cursor-pointer ${
                      activeJob?.id === j.id
                        ? 'border-brand-500 bg-brand-50/60 shadow-xs'
                        : 'border-stone-200 bg-white hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-stone-900 truncate max-w-[180px]">{j.topic}</span>
                      <Badge
                        variant={
                          j.status === 'converted' ? 'success' : j.status === 'approved' ? 'default' : 'secondary'
                        }
                        className="text-[9px]"
                      >
                        {j.status === 'converted' ? 'Đã thành Course' : j.status === 'approved' ? 'Đã duyệt' : 'Chờ duyệt'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-stone-500">
                      <span>{j.domainCategory} · {j.targetLevel}</span>
                      <span>{j.itemCount} học liệu</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Xem trước Chi tiết Blueprint của Job */}
        <div className="lg:col-span-2">
          {activeJob ? (
            <Card className="p-5 space-y-4">
              <div className="flex items-start justify-between border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">{activeJob.domainCategory} · {activeJob.targetLevel}</span>
                    <Badge variant={activeJob.status === 'converted' ? 'success' : 'default'} className="text-[10px]">
                      {activeJob.status === 'converted' ? 'Đã khởi tạo thành Course' : activeJob.status}
                    </Badge>
                  </div>
                  <h3 className="text-lg font-bold text-stone-900 mt-1">{activeJob.blueprint?.course_title || activeJob.topic}</h3>
                  <p className="text-xs text-stone-500 mt-0.5">{activeJob.summary}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {activeJob.status !== 'approved' && activeJob.status !== 'converted' && (
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => handleApprove(activeJob.id)}>
                      <Check className="w-3.5 h-3.5 text-emerald-600" /> Duyệt đề xuất
                    </Button>
                  )}
                  {activeJob.status !== 'converted' && (
                    <Button size="sm" className="text-xs gap-1 font-semibold" onClick={() => handleConvertToCourse(activeJob.id)}>
                      <ArrowRight className="w-3.5 h-3.5" /> Tạo thành Khóa học LMS
                    </Button>
                  )}
                </div>
              </div>

              {/* Mục tiêu đào tạo */}
              {activeJob.blueprint?.outcomes && (
                <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 text-xs space-y-1.5">
                  <span className="font-bold text-stone-800">Mục tiêu đầu ra (Learning Outcomes):</span>
                  <ul className="list-disc pl-4 space-y-0.5 text-stone-600">
                    {activeJob.blueprint.outcomes.map((oc: string, idx: number) => (
                      <li key={idx}>{oc}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Danh sách bài học đề xuất */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-stone-800">Danh sách bài học & Video bài giảng ({activeJob.items?.length || 0}):</span>
                <div className="space-y-2 max-h-[350px] overflow-y-auto">
                  {activeJob.items?.map((item: any) => (
                    <div key={item.id} className="p-3 bg-white border border-stone-200 rounded-lg flex items-start justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-stone-900">Bài {item.order}: {item.title}</span>
                          <span className="text-[10px] text-stone-400">({item.provider})</span>
                        </div>
                        {item.description && <p className="text-stone-500 text-[11px]">{item.description}</p>}
                        {item.sourceUrl && (
                          <div className="flex items-center gap-1 text-[11px] text-brand-600 truncate max-w-md">
                            <Play className="w-3 h-3 text-rose-500 shrink-0" />
                            <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline truncate">
                              {item.sourceUrl}
                            </a>
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {item.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-12 text-center text-stone-400 text-xs">
              Chọn một đề xuất từ danh sách bên trái hoặc nhập chủ đề mới để xem chi tiết giáo trình do AI khám phá.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
