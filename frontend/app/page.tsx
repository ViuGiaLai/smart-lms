'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, BookOpen, Search } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { categoriesApi, coursesApi, educationLevelsApi, publicApi } from '@/lib/api';

interface CourseItem {
  id: string | number;
  title: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  thumbnail?: string;
  price?: number;
  totalStudents?: number;
  totalLessons?: number;
  instructor?: { fullName?: string };
  category?: { name?: string } | string;
  categoryName?: string;
  gradeLabel?: string;
  educationLevelName?: string;
  level?: string;
}

const FALLBACK_COVER =
  'https://res.cloudinary.com/dqe5syxc0/image/upload/f_auto,q_auto,w_1200/smart-lms/courses/nextjs-ui.jpg';

const levelLabel: Record<string, string> = {
  beginner: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
};

const formatPrice = (price?: number) => {
  if (!price) return 'Miễn phí';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
};

interface CategoryNode {
  id: number;
  name: string;
  description?: string | null;
  children?: CategoryNode[];
}

interface EducationLevelItem {
  id: number;
  name: string;
  code: string;
}

export default function HomePage() {
  const router = useRouter();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [domains, setDomains] = useState<CategoryNode[]>([]);
  const [levels, setLevels] = useState<EducationLevelItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [platformStats, setPlatformStats] = useState<{
    totalCourses: number;
    totalLessons: number;
    totalStudents: number;
    totalInstructors: number;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchLandingData = async () => {
      try {
        const [coursesRes, statsRes, treeRes, levelsRes] = await Promise.allSettled([
          coursesApi.getAll({ limit: 30 }),
          publicApi.getStats(),
          categoriesApi.getTree(),
          educationLevelsApi.getAll(),
        ]);
        if (!isMounted) return;
        if (coursesRes.status === 'fulfilled' && coursesRes.value.data?.data) {
          setCourses(coursesRes.value.data.data);
        }
        if (statsRes.status === 'fulfilled' && statsRes.value.data?.data) {
          setPlatformStats(statsRes.value.data.data);
        }
        if (treeRes.status === 'fulfilled') {
          setDomains(treeRes.value.data?.data?.tree || []);
        }
        if (levelsRes.status === 'fulfilled') {
          setLevels(levelsRes.value.data?.data || []);
        }
      } catch (err) {
        console.error('Không tải được dữ liệu trang chủ:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchLandingData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = searchKeyword.trim();
    router.push(keyword ? `/courses?search=${encodeURIComponent(keyword)}` : '/courses');
  };

  // Khóa học nổi bật phải trải đều lĩnh vực, không chỉ lấy 3 khóa đầu (thường cùng một môn).
  const featuredCourses = useMemo(() => {
    const seen = new Set<string>();
    const picked: CourseItem[] = [];
    for (const course of courses) {
      const key =
        course.categoryName ||
        (typeof course.category === 'string' ? course.category : course.category?.name) ||
        '';
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      picked.push(course);
      if (picked.length >= 6) break;
    }
    return picked.length > 0 ? picked : courses.slice(0, 6);
  }, [courses]);

  const stats = [
    { label: 'Học viên đã đăng ký', value: platformStats?.totalStudents },
    { label: 'Khóa học đã xuất bản', value: platformStats?.totalCourses },
    { label: 'Bài giảng đã số hóa', value: platformStats?.totalLessons },
    { label: 'Giảng viên phụ trách', value: platformStats?.totalInstructors },
  ];

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <Navbar />

      {/* Thông tin đề tài — dải mực mảnh, không dùng banner quảng cáo. */}
      <div id="about" className="scroll-mt-20 border-b border-brand-900 bg-brand-950 px-5 py-2 text-brand-100 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-1 text-[11px]">
          <span className="uppercase tracking-[0.16em]">
            NCKH 2026 <span className="mx-2 text-brand-700">/</span> Trường Đại học Đông Á · Khoa Công nghệ Thông tin · ST23D
          </span>
          <span className="text-brand-300/80">
            Nguyễn Thanh Phước · Phan Thanh Huy · Rmah Viu
          </span>
        </div>
      </div>

      {/* ── Mở đầu ── */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div>
            <p className="kicker">Hệ thống quản lý học tập · Đại học Đông Á</p>
            <h1 className="mt-5 text-[38px] leading-[1.08] text-foreground sm:text-[52px] lg:text-[58px]">
              Bài giảng có người dẫn đường,
              <br />
              <span className="italic text-brand-700">sinh viên không đi một mình.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              Nền tảng hỗ trợ các khoa chuyên ngành tại Trường Đại học Đông Á: Công nghệ thông tin, Ngoại
              ngữ, Kinh tế, Kỹ thuật và Khoa học cơ bản. Mỗi học phần tích hợp Trợ lý Gia sư AI bám sát
              tài liệu slide và video bài giảng — câu trả lời trích dẫn chính xác số trang và mốc thời gian.
            </p>

            <form
              onSubmit={handleSearchSubmit}
              className="mt-8 flex max-w-xl items-stretch border border-border bg-card focus-within:border-brand-600"
              role="search"
            >
              <Search className="ml-3.5 mt-3 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Tìm học phần: Toán cao cấp, Python AI, Tiếng Anh chuyên ngành, Kế toán…"
                aria-label="Tìm kiếm khóa học"
                className="w-full bg-transparent px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="submit"
                className="m-1 flex shrink-0 items-center gap-2 bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Tìm
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </form>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted-foreground">
              <span className="uppercase tracking-[0.12em]">Gợi ý</span>
              {['Toán cao cấp', 'Tiếng Anh chuyên ngành', 'Lập trình Python', 'Cơ sở dữ liệu'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => router.push(`/courses?search=${encodeURIComponent(tag)}`)}
                  className="border-b border-border pb-0.5 transition-colors hover:border-foreground hover:text-foreground"
                >
                  {tag}
                </button>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/courses"
                className="inline-flex items-center gap-2 bg-primary px-5 py-3 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Xem danh mục khóa học
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 border-b border-foreground/30 pb-1 text-[13px] font-semibold text-foreground transition-colors hover:border-foreground"
              >
                Tạo tài khoản học viên
              </Link>
            </div>
          </div>

          {/* Ảnh bìa thật của khóa học, đặt như một trang bìa giáo trình. */}
          <div className="relative">
            <div className="cover-frame relative aspect-[4/5] w-full">
              <Image
                src={courses[0]?.thumbnail || FALLBACK_COVER}
                alt={courses[0]?.title ? `Bìa khóa học ${courses[0].title}` : 'Không gian học tập'}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-950/85 via-brand-950/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-brand-50">
                <p className="text-[10px] uppercase tracking-[0.2em] text-brand-200">Khóa học tiêu biểu</p>
                <p className="mt-2 font-serif text-xl leading-snug">
                  {courses[0]?.title || 'Lập trình Python nâng cao & ứng dụng AI'}
                </p>
                <p className="mt-2 text-[12px] text-brand-200/90">
                  {courses[0]?.instructor?.fullName || 'Khoa Công nghệ Thông tin'} ·{' '}
                  {courses[0]?.totalLessons ?? '—'} bài giảng
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Ảnh bìa và học liệu được lưu trên Cloudinary, phân phối qua CDN tối ưu cho thiết bị di động.
            </p>
          </div>
        </div>
      </section>

      {/* ── Số liệu nền tảng ── */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-border px-5 sm:px-8 md:grid-cols-4">
          {stats.map((item, index) => (
            <div
              key={item.label}
              className={`px-4 py-8 first:pl-0 ${index === 2 ? 'md:border-l-0' : ''}`}
            >
              <p className="font-serif text-3xl text-foreground sm:text-4xl">
                {item.value !== undefined ? item.value.toLocaleString('vi-VN') : '—'}
              </p>
              <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Khóa học nổi bật ── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
            <div>
              <p className="kicker">Danh mục đào tạo</p>
              <h2 className="mt-2 font-serif text-3xl text-foreground">Khóa học nổi bật</h2>
            </div>
            <Link
              href="/courses"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground transition-colors hover:text-brand-700"
            >
              Toàn bộ danh mục
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          {isLoading ? (
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="animate-pulse">
                  <div className="aspect-[16/10] border border-border bg-muted" />
                  <div className="mt-3 h-4 w-3/4 bg-muted" />
                  <div className="mt-2 h-3 w-1/2 bg-muted" />
                </div>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="mt-8 border border-dashed border-border px-6 py-12 text-center">
              <BookOpen className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm text-muted-foreground">
                Chưa có khóa học nào được xuất bản.
              </p>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 md:grid-cols-3">
              {featuredCourses.map((course) => (
                <Link key={course.id} href={`/courses/${course.id}`} className="group block">
                  <div className="cover-frame relative aspect-[16/10]">
                    <Image
                      src={course.thumbnail || FALLBACK_COVER}
                      alt={course.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    />
                  </div>
                  <div className="mt-3.5 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    <span>
                      {course.categoryName ||
                        (typeof course.category === 'string' ? course.category : course.category?.name) ||
                        'Đa lĩnh vực'}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{levelLabel[course.level || ''] || 'Mọi trình độ'}</span>
                  </div>
                  <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-foreground group-hover:text-brand-700">
                    {course.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                    {course.shortDescription || course.description || 'Giáo trình số kèm bài luyện tập và trợ lý học tập theo bài giảng.'}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-[12px] text-muted-foreground">
                    <span>{course.totalLessons ?? 0} bài giảng</span>
                    <span className="font-medium text-foreground">{formatPrice(course.price)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

        </div>
      </section>

      {/* ── Lĩnh vực & cấp độ đào tạo — đọc trực tiếp cây danh mục động ── */}
      {domains.length > 0 && (
        <section id="domains" className="border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
              <div>
                <p className="kicker">Danh mục động</p>
                <h2 className="mt-2 font-serif text-3xl text-foreground">Lĩnh vực & cấp độ đào tạo</h2>
                <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                  Quản trị viên tự tạo lĩnh vực, môn học và cấp độ ngay trên giao diện — mở thêm ngành
                  mới không cần sửa mã nguồn.
                </p>
              </div>
              <Link
                href="/courses"
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground transition-colors hover:text-brand-700"
              >
                Xem toàn bộ khóa học
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <div className="mt-8 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {domains.map((domain) => {
                const subjectCount = domain.children?.length ?? 0;
                return (
                  <Link
                    key={domain.id}
                    href={`/courses?category_id=${domain.id}`}
                    className="group bg-background px-5 py-6 transition-colors hover:bg-card"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-[15px] font-semibold text-foreground group-hover:text-brand-700">
                        {domain.name}
                      </h3>
                      <span className="shrink-0 border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        {subjectCount > 0 ? `${subjectCount} môn` : 'Đang mở'}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                      {domain.description ||
                        domain.children?.slice(0, 4).map((child) => child.name).join(' · ') ||
                        'Chương trình đào tạo đang được cập nhật.'}
                    </p>
                  </Link>
                );
              })}
            </div>

            {levels.length > 0 && (
              <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-border pt-5">
                <span className="mr-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Cấp độ
                </span>
                {levels.map((level) => (
                  <Link
                    key={level.id}
                    href={`/courses?education_level_id=${level.id}`}
                    className="border border-border px-3 py-1 text-[12px] text-foreground/80 transition-colors hover:border-brand-600 hover:text-brand-700"
                  >
                    {level.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Cách hệ thống vận hành ── */}
      <section id="features" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <p className="kicker">Thiết kế sư phạm</p>
          <h2 className="mt-2 max-w-2xl font-serif text-3xl leading-snug text-foreground">
            Ba lớp hỗ trợ, một mục tiêu: người học hiểu bài và kiểm chứng được điều mình vừa học.
          </h2>

          <div className="mt-10 grid gap-px border border-border bg-border md:grid-cols-3">
            {[
              {
                number: '01',
                title: 'Giáo trình số có cấu trúc',
                body: 'Bài giảng, video và học liệu được xếp theo lộ trình. Mỗi bài có mục tiêu, thời lượng và tài liệu đính kèm để tra cứu lại.',
              },
              {
                number: '02',
                title: 'Trợ lý giới hạn theo bài giảng',
                body: 'Câu trả lời chỉ lấy từ tài liệu của bài đang học, kèm số trang hoặc mốc thời gian để người học đối chiếu với nguồn gốc.',
              },
              {
                number: '03',
                title: 'Luyện tập và phản hồi',
                body: 'Đề trắc nghiệm bám thang Bloom, chấm điểm tự động và ghi nhận tiến độ theo từng chương; giảng viên theo dõi phần cần bổ trợ.',
              },
            ].map((item) => (
              <div key={item.number} className="bg-card px-6 py-8">
                <p className="font-serif text-2xl text-brand-700">{item.number}</p>
                <h3 className="mt-4 text-[15px] font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── So sánh với LMS truyền thống ── */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="kicker">Điểm khác biệt</p>
              <h2 className="mt-2 font-serif text-3xl leading-snug text-foreground">
                Không thêm một lớp phủ mới, chỉ sửa những chỗ giáo trình số còn thiếu.
              </h2>
              <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                Hệ thống đối chiếu hai hướng: người học cần lời giải thích đúng ngữ cảnh, giảng viên
                cần dữ liệu để biết phần nào chưa ổn. Cả hai đều dựa trên cùng một nguồn tài liệu.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-1/3 py-3 pr-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Tiêu chí
                    </th>
                    <th className="py-3 pr-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      LMS thông thường
                    </th>
                    <th className="py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700">
                      Smart LMS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Hỏi đáp khi học', 'Diễn đàn, chờ giảng viên trả lời', 'Trả lời ngay, giới hạn trong bài giảng'],
                    ['Nguồn câu trả lời', 'Không xác định', 'Trích dẫn slide, video, tài liệu gốc'],
                    ['Soạn đề kiểm tra', 'Nhập tay từng câu', 'Sinh nháp theo Bloom, giảng viên duyệt lại'],
                    ['Theo dõi tiến độ', 'Điểm cuối kỳ', 'Tiến độ theo bài, cảnh báo học viên chậm'],
                  ].map(([criterion, traditional, smart]) => (
                    <tr key={criterion} className="border-b border-border/70 last:border-0">
                      <td className="py-3.5 pr-4 font-medium text-foreground">{criterion}</td>
                      <td className="py-3.5 pr-4 text-muted-foreground">{traditional}</td>
                      <td className="py-3.5 text-foreground">{smart}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── Lời mời ── */}
      <section className="bg-brand-950 text-brand-50">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300">
              Bắt đầu từ khóa học đầu tiên
            </p>
            <h2 className="mt-3 max-w-2xl font-serif text-[32px] leading-tight sm:text-[40px]">
              Đăng ký học viên, vào lớp và để trợ lý học tập theo bạn suốt học phần.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-brand-50 px-5 py-3 text-[13px] font-semibold text-brand-950 transition-colors hover:bg-white"
            >
              Tạo tài khoản
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 border border-brand-700 px-5 py-3 text-[13px] font-semibold text-brand-50 transition-colors hover:border-brand-400"
            >
              Đã có tài khoản
            </Link>
          </div>
        </div>
      </section>

      {/* ── Chân trang ── */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 text-[12px] sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-serif text-lg text-foreground">Smart LMS</p>
            <p className="mt-2 max-w-sm leading-relaxed text-muted-foreground">
              Nền tảng học tập số của Khoa Công nghệ Thông tin, Trường Đại học Đông Á. Đề tài nghiên
              cứu khoa học 2026 về trợ lý học tập giới hạn theo bài giảng.
            </p>
          </div>
          <div>
            <p className="kicker">Học tập</p>
            <div className="mt-3 space-y-2">
              <Link href="/courses" className="block text-foreground/80 hover:text-foreground">Danh mục khóa học</Link>
              <Link href="/my-courses" className="block text-foreground/80 hover:text-foreground">Khóa học của tôi</Link>
              <Link href="/progress" className="block text-foreground/80 hover:text-foreground">Tiến độ học tập</Link>
            </div>
          </div>
          <div>
            <p className="kicker">Tài khoản</p>
            <div className="mt-3 space-y-2">
              <Link href="/login" className="block text-foreground/80 hover:text-foreground">Đăng nhập</Link>
              <Link href="/register" className="block text-foreground/80 hover:text-foreground">Đăng ký</Link>
              <Link href="/forgot-password" className="block text-foreground/80 hover:text-foreground">Quên mật khẩu</Link>
              <Link href="/terms" className="block text-foreground/80 hover:text-foreground">Điều khoản</Link>
              <Link href="/privacy" className="block text-foreground/80 hover:text-foreground">Quyền riêng tư</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-border px-5 py-4 text-center text-[11px] text-muted-foreground sm:px-8">
          © 2026 Smart LMS · Nguyễn Thanh Phước, Phan Thanh Huy, Rmah Viu
        </div>
      </footer>
    </div>
  );
}
