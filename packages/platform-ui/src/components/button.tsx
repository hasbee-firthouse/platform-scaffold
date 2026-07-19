import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from './cn.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius)] ' +
    'transition-colors focus-visible:outline focus-visible:outline-2 ' +
    'focus-visible:outline-[var(--color-primary)] ' +
    'disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
        secondary: 'bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]',
        ghost:
          'bg-transparent text-[var(--color-foreground)] border border-[var(--color-border)]',
        destructive: 'bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)]',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
