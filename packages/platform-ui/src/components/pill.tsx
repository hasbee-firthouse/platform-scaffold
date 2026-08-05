import type { HTMLAttributes, ReactElement } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from './cn.js';

const pillVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs font-medium ' +
    'uppercase tracking-wide leading-none',
  {
    variants: {
      variant: {
        ok: 'bg-[var(--color-ok-weak)] text-[var(--color-ok)]',
        warn: 'bg-[var(--color-warn-weak)] text-[var(--color-warn)]',
        info: 'bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]',
        neutral: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface PillProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {
  /** Show the leading status dot (default `true`). */
  dot?: boolean;
}

/**
 * A compact status chip: a soft, token-driven badge with an optional leading
 * dot, used to encode state — Draft / Published, Active / Invited, Owner — so it
 * reads at a glance. The semantic `ok`/`warn` variants resolve to the
 * `--color-ok` / `--color-warn` tokens and are intentionally kept distinct from
 * the brand accent (which stays reserved for interaction).
 */
export function Pill({
  variant,
  dot = true,
  className,
  children,
  ...props
}: PillProps): ReactElement {
  return (
    <span
      data-variant={variant ?? 'neutral'}
      className={cn(pillVariants({ variant }), className)}
      {...props}
    >
      {dot ? (
        <span data-pill-dot aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  );
}

export { pillVariants };
