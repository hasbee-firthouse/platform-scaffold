// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { ReactElement } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Button } from './button.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './form.js';
import { Input } from './input.js';

afterEach(cleanup);

const schema = z.object({
  workspaceName: z.string().min(1, 'Workspace name is required'),
});
type WorkspaceForm = z.infer<typeof schema>;

function DemoForm({ onValid }: { onValid: (values: WorkspaceForm) => void }) {
  const form = useForm<WorkspaceForm>({
    resolver: zodResolver(schema),
    defaultValues: { workspaceName: '' },
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onValid)}>
        <FormField
          control={form.control}
          name="workspaceName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Workspace name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Create</Button>
      </form>
    </Form>
  );
}

describe('Form primitives (AC3 — react-hook-form + Zod)', () => {
  it('surfaces a Zod validation error associated with the labeled input on empty submit', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<DemoForm onValid={onValid} />);

    await user.click(screen.getByRole('button', { name: 'Create' }));

    const input = screen.getByLabelText('Workspace name');
    const message = await screen.findByText('Workspace name is required');

    expect(onValid).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', message.id);
    expect(message.id).not.toBe('');
  });

  it('submits the parsed values once the field is valid', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<DemoForm onValid={onValid} />);

    await user.type(screen.getByLabelText('Workspace name'), 'Q3 Onboarding');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(onValid).toHaveBeenCalledWith(
        { workspaceName: 'Q3 Onboarding' },
        expect.anything(),
      ),
    );
  });

  it('renders static FormMessage helper text when there is no validation error', () => {
    function HintForm() {
      const form = useForm<WorkspaceForm>({ defaultValues: { workspaceName: '' } });
      return (
        <Form {...form}>
          <FormField
            control={form.control}
            name="workspaceName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Workspace name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage>Shown to new members of this workspace.</FormMessage>
              </FormItem>
            )}
          />
        </Form>
      );
    }
    render(<HintForm />);

    const input = screen.getByLabelText('Workspace name');
    expect(screen.getByText('Shown to new members of this workspace.')).toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('renders nothing from FormMessage when there is neither an error nor children', () => {
    function EmptyMessage() {
      const form = useForm<WorkspaceForm>({ defaultValues: { workspaceName: '' } });
      return (
        <Form {...form}>
          <FormField
            control={form.control}
            name="workspaceName"
            render={() => (
              <FormItem>
                <FormMessage />
              </FormItem>
            )}
          />
        </Form>
      );
    }
    const { container } = render(<EmptyMessage />);

    expect(container.querySelector('p')).toBeNull();
  });

  it('throws when a form primitive is used outside <FormField>', () => {
    function Orphan() {
      const form = useForm<WorkspaceForm>({ defaultValues: { workspaceName: '' } });
      return (
        <Form {...form}>
          <FormLabel>Orphan</FormLabel>
        </Form>
      );
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Orphan />)).toThrow('useFormField must be used within a <FormField>');

    spy.mockRestore();
  });

  it('throws when a form primitive is used outside <FormItem>', () => {
    function OrphanItem() {
      const form = useForm<WorkspaceForm>({ defaultValues: { workspaceName: '' } });
      return (
        <Form {...form}>
          <FormField
            control={form.control}
            name="workspaceName"
            render={() => <FormLabel>Orphan</FormLabel>}
          />
        </Form>
      );
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<OrphanItem />)).toThrow('useFormField must be used within a <FormItem>');

    spy.mockRestore();
  });

  it('rejects a non-element FormControl child', () => {
    function BadControl() {
      const form = useForm<WorkspaceForm>({ defaultValues: { workspaceName: '' } });
      const notAnElement = 'plain text' as unknown as ReactElement;
      return (
        <Form {...form}>
          <FormField
            control={form.control}
            name="workspaceName"
            render={() => (
              <FormItem>
                <FormControl>{notAnElement}</FormControl>
              </FormItem>
            )}
          />
        </Form>
      );
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<BadControl />)).toThrow(
      'FormControl expects a single React element child',
    );

    spy.mockRestore();
  });
});
