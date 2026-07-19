import type { ReactNode } from 'react';
import { cn } from './cn.js';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps): ReactNode {
  return (
    <div
      className={cn(
        'flex flex-col items-center px-6 py-12 text-center text-[var(--color-muted-foreground)]',
        className,
      )}
    >
      {icon ? <div className="mb-3 text-[var(--color-foreground)]">{icon}</div> : null}
      <h3 className="text-base font-semibold text-[var(--color-foreground)]">{title}</h3>
      {description ? <p className="mt-1">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
