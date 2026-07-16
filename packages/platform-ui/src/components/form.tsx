import { cloneElement, createContext, isValidElement, useContext, useId } from 'react';
import type { HTMLAttributes, LabelHTMLAttributes, ReactElement } from 'react';
import {
  Controller,
  FormProvider,
  useFormContext,
} from 'react-hook-form';
import type { ControllerProps, FieldPath, FieldValues } from 'react-hook-form';
import { cn } from './cn.js';

/** Root provider — spread a `useForm()` return value onto it. */
export const Form = FormProvider;

interface FormFieldContextValue {
  name: string;
}
const FormFieldContext = createContext<FormFieldContextValue | null>(null);

interface FormItemContextValue {
  id: string;
}
const FormItemContext = createContext<FormItemContextValue | null>(null);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>): ReactElement {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

interface FormFieldState {
  inputId: string;
  messageId: string;
  hasError: boolean;
  errorMessage: string | undefined;
}

function useFormField(): FormFieldState {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  if (!fieldContext) {
    throw new Error('useFormField must be used within a <FormField>');
  }
  if (!itemContext) {
    throw new Error('useFormField must be used within a <FormItem>');
  }

  const fieldState = getFieldState(fieldContext.name, formState);
  return {
    inputId: `${itemContext.id}-form-item`,
    messageId: `${itemContext.id}-form-item-message`,
    hasError: Boolean(fieldState.error),
    errorMessage: fieldState.error?.message,
  };
}

export function FormItem({ className, ...props }: HTMLAttributes<HTMLDivElement>): ReactElement {
  const id = useId();
  return (
    <FormItemContext.Provider value={{ id }}>
      <div className={cn('flex flex-col gap-1.5', className)} {...props} />
    </FormItemContext.Provider>
  );
}

export function FormLabel({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>): ReactElement {
  const { inputId, hasError } = useFormField();
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'text-sm font-medium text-[var(--color-foreground)]',
        hasError && 'text-[var(--color-destructive)]',
        className,
      )}
      {...props}
    />
  );
}

interface FormControlInjectedProps {
  id: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export function FormControl({ children }: { children: ReactElement }): ReactElement {
  const { inputId, messageId, hasError } = useFormField();
  if (!isValidElement(children)) {
    throw new Error('FormControl expects a single React element child');
  }
  const injected: FormControlInjectedProps = {
    id: inputId,
    'aria-invalid': hasError ? true : undefined,
    'aria-describedby': hasError ? messageId : undefined,
  };
  return cloneElement(children, injected);
}

export function FormMessage({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>): ReactElement | null {
  const { messageId, errorMessage } = useFormField();
  const body = errorMessage ?? children;
  if (!body) {
    return null;
  }
  return (
    <p
      id={messageId}
      className={cn('text-sm text-[var(--color-destructive)]', className)}
      {...props}
    >
      {body}
    </p>
  );
}
