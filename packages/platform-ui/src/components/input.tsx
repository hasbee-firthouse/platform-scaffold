import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from './cn.js';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'w-full rounded-[var(--radius)] border border-[var(--color-border)] ' +
          'bg-[var(--color-background)] text-[var(--color-foreground)] px-3 py-2 text-sm ' +
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] ' +
          'aria-[invalid=true]:border-[var(--color-destructive)]',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
