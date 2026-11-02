import React from 'react';
import Link from 'next/link';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PageHeaderBadge {
  label: string;
  variant?: BadgeProps['variant'];
}

export interface PageHeaderAction {
  label: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export interface PageHeaderProps {
  badges?: PageHeaderBadge[];
  title: string;
  description?: string;
  actions?: PageHeaderAction[];
  className?: string;
}

function renderActionContent(action: PageHeaderAction) {
  return (
    <>
      {action.icon}
      {action.label}
    </>
  );
}

export function PageHeader({ badges, title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        {badges && badges.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {badges.map((badge) => (
              <Badge key={badge.label} variant={badge.variant ?? 'info'}>
                {badge.label}
              </Badge>
            ))}
          </div>
        )}
        <h1 className="text-[26px] leading-tight text-foreground sm:text-[30px]">{title}</h1>
        {description && <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>

      {actions && actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) =>
            action.href ? (
              <Button key={action.label} asChild size="sm" disabled={action.disabled}>
                <Link href={action.href}>{renderActionContent(action)}</Link>
              </Button>
            ) : (
              <Button
                key={action.label}
                type="button"
                size="sm"
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {renderActionContent(action)}
              </Button>
            ),
          )}
        </div>
      )}
    </header>
  );
}
