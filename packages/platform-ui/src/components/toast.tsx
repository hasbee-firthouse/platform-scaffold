import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { cn } from './cn.js';

export const ToastProvider = ToastPrimitive.Provider;
export const ToastClose = ToastPrimitive.Close;
export const ToastAction = ToastPrimitive.Action;

export const ToastViewport = forwardRef<
  ElementRef<typeof ToastPrimitive.Viewport>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      'fixed bottom-0 right-0 z-50 flex w-96 max-w-full flex-col gap-2.5 p-5',
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = 'ToastViewport';

export const Toast = forwardRef<
  ElementRef<typeof ToastPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(
      'flex items-start gap-3 rounded-[var(--radius)] border border-[var(--color-border)] ' +
        'border-l-[3px] border-l-[var(--color-primary)] bg-[var(--color-background)] ' +
        'p-3.5 text-[var(--color-foreground)] shadow-md',
      className,
    )}
    {...props}
  />
));
Toast.displayName = 'Toast';

export const ToastTitle = forwardRef<
  ElementRef<typeof ToastPrimitive.Title>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title ref={ref} className={cn('text-sm font-semibold', className)} {...props} />
));
ToastTitle.displayName = 'ToastTitle';

export const ToastDescription = forwardRef<
  ElementRef<typeof ToastPrimitive.Description>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn('text-sm text-[var(--color-muted)]', className)}
    {...props}
  />
));
ToastDescription.displayName = 'ToastDescription';
