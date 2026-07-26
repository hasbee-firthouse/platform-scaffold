import { forwardRef } from 'react';
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from './cn.js';

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    // Horizontal-scroll container: on narrow screens a wide table scrolls
    // sideways within its own box instead of clipping or squishing, so the
    // page body never scrolls horizontally. `tabIndex` lets keyboard users
    // reach the scroll region.
    <div className="w-full overflow-x-auto" tabIndex={0}>
      <table
        ref={ref}
        className={cn(
          'w-full overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] ' +
            'border-separate border-spacing-0 bg-[var(--color-background)] text-sm ' +
            'text-[var(--color-foreground)] shadow-sm',
          className,
        )}
        {...props}
      />
    </div>
  ),
);
Table.displayName = 'Table';

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => <thead ref={ref} className={cn(className)} {...props} />);
TableHeader.displayName = 'TableHeader';

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => <tbody ref={ref} className={cn(className)} {...props} />);
TableBody.displayName = 'TableBody';

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn('hover:bg-[var(--color-muted)]', className)}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'border-b border-[var(--color-border)] px-4 py-2.5 text-left text-xs font-semibold ' +
          'uppercase tracking-wide text-[var(--color-muted-foreground)]',
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = 'TableHead';

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('border-b border-[var(--color-border)] px-4 py-3', className)}
      {...props}
    />
  ),
);
TableCell.displayName = 'TableCell';
