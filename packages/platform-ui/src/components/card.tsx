import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from './cn.js';

type DivProps = HTMLAttributes<HTMLDivElement>;

export const Card = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-[var(--radius)] border border-[var(--color-border)] ' +
        'bg-[var(--color-background)] text-[var(--color-foreground)] shadow-sm',
      className,
    )}
    {...props}
  />
));
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4',
      className,
    )}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-sm font-semibold', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardBody = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('px-5 py-4', className)} {...props} />
));
CardBody.displayName = 'CardBody';

export const CardFooter = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'border-t border-[var(--color-border)] px-5 py-4 text-[var(--color-muted)]',
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';
