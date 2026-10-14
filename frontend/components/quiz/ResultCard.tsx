'use client';

import React from 'react';
import Link from 'next/link';
import { Award, RotateCcw, PlayCircle, LayoutDashboard, ArrowLeft } from 'lucide-react';

interface ResultCardProps {
  score: number;
  totalQuestions: number;
  onRetry?: () => void;
  courseId?: string | number;
  lessonId?: string | number;
}

export default function ResultCard({
  score,
  totalQuestions,
  onRetry,
  courseId = '1',
  lessonId = '1',
}: ResultCardProps) {
  const percentage = Math.round((score / totalQuestions) * 100);
  const isPassed = percentage >= 70;

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm text-center max-w-md mx-auto space-y-6">
      <div
        className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center shadow-lg ${
          isPassed
            ? 'bg-emerald-100 text-emerald-600 shadow-emerald-100'
            : 'bg-amber-100 text-amber-600 shadow-amber-100'
        }`}
      >
        <Award className="w-10 h-10" />
      </div>

      <div className="space-y-1">
        <h3 className="text-2xl font-bold text-slate-800">
          {isPassed ? 'Chúc mừng bạn đã đạt!' : 'Cần cố gắng thêm nhé!'}
        </h3>
        <p className="text-xs text-slate-500">
          Kết quả bài trắc nghiệm củng cố kiến thức bài học
        </p>
      </div>

      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex justify-around items-center">
        <div>
          <p className="text-xs text-slate-500 font-medium">Đúng</p>
          <p className="text-xl font-bold text-emerald-600">
            {score} / {totalQuestions}
          </p>
        </div>
        <div className="h-8 w-px bg-slate-200" />
        <div>
          <p className="text-xs text-slate-500 font-medium">Tỷ lệ</p>
          <p className={`text-xl font-bold ${isPassed ? 'text-indigo-600' : 'text-amber-600'}`}>
            {percentage}%
          </p>
        </div>
      </div>

      {/* ── Các nút điều hướng thông minh (Smart Actions) ── */}
      <div className="space-y-2.5 pt-2">
        {/* Nút chính: Quay lại bài học để tiếp tục xem bài giảng */}
        <Link
          href={`/courses/${courseId}/learn?lessonId=${lessonId}`}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-md shadow-indigo-100"
        >
          <PlayCircle className="w-4 h-4" />
          <span>Tiếp tục bài giảng (Quay lại bài học)</span>
        </Link>

        {/* Nút làm lại bài kiểm tra */}
        {onRetry && (
          <button
            onClick={onRetry}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Làm lại bài kiểm tra</span>
          </button>
        )}

        {/* Lối tắt về Bàn học */}
        <Link
          href="/dashboard"
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs text-slate-400 hover:text-slate-600 transition"
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Về Bàn học (Dashboard)</span>
        </Link>
      </div>
    </div>
  );
}
