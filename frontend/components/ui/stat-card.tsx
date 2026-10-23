import React from 'react';
import type { LucideIcon } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const accentStyles = {
  primary: 'bg-primary/10 text-primary',
  violet: 'bg-violet-100 text-violet-700',
  purple: 'bg-purple-100 text-purple-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
} as const;

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  accent?: keyof typeof accentStyles;
  loading?: boolean;
  className?: string;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  accent = 'primary',
  loading = false,
  className,
}: StatCardProps) {
  return (
    <Card className={cn('flex items-center gap-3 p-4 sm:p-5', className)}>
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          accentStyles[accent],
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-16" />
        ) : (
          <p className="text-xl font-extrabold leading-tight text-foreground">{value}</p>
        )}
      </div>
    </Card>
  );
}
