'use client';

import React from 'react';

export interface ProgressBarProps {
  progress?: number; // 0 - 100
  value?: number;    // Alias for progress
  label?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg' | string;
  className?: string;
}

export function ProgressBar({
  progress,
  value,
  label,
  showLabel,
  size = 'md',
  className = '',
}: ProgressBarProps) {
  const currentVal = value !== undefined ? value : (progress !== undefined ? progress : 0);
  const safeProgress = Math.max(0, Math.min(100, currentVal));

  const heightClass =
    size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3.5' : 'h-2.5';

  return (
    <div className={`w-full space-y-1.5 ${className}`}>
      {(label || showLabel) && (
        <div className="flex justify-between text-xs text-stone-600 font-medium">
          <span>{label || 'Tiến độ'}</span>
          <span>{safeProgress}%</span>
        </div>
      )}
      <div className={`w-full ${heightClass} bg-stone-100 rounded-full overflow-hidden border border-stone-200/60`}>
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-300 ease-out"
          style={{ width: `${safeProgress}%` }}
        />
      </div>
    </div>
  );
}

export default ProgressBar;
