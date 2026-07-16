import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from './cn.js';

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('flex gap-1 border-b border-[var(--color-border)]', className)}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      '-mb-px border-b-2 border-transparent px-4 py-2 text-sm text-[var(--color-muted)] ' +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] ' +
        'data-[state=active]:border-[var(--color-primary)] data-[state=active]:font-semibold ' +
        'data-[state=active]:text-[var(--color-primary)]',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'pt-4 text-[var(--color-foreground)] ' +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';
