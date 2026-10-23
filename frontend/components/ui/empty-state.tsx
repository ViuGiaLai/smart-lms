import React from 'react';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-card px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          {icon}
        </span>
      )}
      <div className="space-y-1">
        <p className="text-sm font-bold text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actionLabel && onAction && (
        <Button type="button" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      {children}
    </div>
  );
}

export interface ErrorStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function ErrorState({ message, actionLabel, onAction, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-destructive sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-xs font-medium leading-relaxed">{message}</p>
      </div>
      {actionLabel && onAction && (
        <Button type="button" size="sm" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
