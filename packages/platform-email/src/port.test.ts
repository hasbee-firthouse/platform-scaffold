import { describe, expect, it, vi } from 'vitest';
import type { ProductConfig } from '@platform/config';
import type { Boss, JobDefinition } from '@platform/jobs';
import { enqueue } from '@platform/jobs';
import {
  createEmailDeliveryJob,
  createEmailPort,
  type EmailAdapter,
  type EmailDeliveryPayload,
} from './port.js';

const config: ProductConfig = {
  name: 'acme',
  profile: 'b2b-standard',
  capabilities: {
    personalAccounts: false,
    organizations: true,
    magicLink: false,
    enterpriseEntitlements: false,
  },
  branding: {
    productName: 'Acme Suite',
    logo: { light: 'l.png', dark: 'd.png' },
    favicon: 'f.ico',
    colors: { primary: '#4f46e5' },
    typography: { fontFamily: 'Inter, sans-serif' },
    radius: '8px',
  },
  terminology: {
    organization: { singular: 'Clinic', plural: 'Clinics' },
    member: { singular: 'Member', plural: 'Members' },
  },
  email: { fromName: 'Acme Suite', fromAddress: 'noreply@acme.test' },
};

function spyAdapter(): EmailAdapter & { transport: ReturnType<typeof vi.fn> } {
  return { transport: vi.fn().mockResolvedValue(undefined) };
}

/** Minimal in-memory {@link Boss} recording sends — enqueue only calls `send`. */
function recordingBoss(): Boss & { sent: Array<{ name: string; data: object }> } {
  const sent: Array<{ name: string; data: object }> = [];
  return {
    sent,
    start: async () => undefined,
    stop: async () => undefined,
    createQueue: async () => undefined,
    send: async (name, data) => {
      sent.push({ name, data });
      return 'job-id';
    },
    work: async () => 'worker',
    schedule: async () => undefined,
  };
}

describe('createEmailDeliveryJob (AC #4 / AC #3 content)', () => {
  it('names the queue email-delivery and renders + transports on run', async () => {
    const adapter = spyAdapter();
    const job = createEmailDeliveryJob({ config, adapter });
    expect(job.name).toBe('email-delivery');

    await job.handler({
      to: 'user@acme.test',
      template: 'verify',
      data: { verificationUrl: 'https://x/verify' },
    });

    expect(adapter.transport).toHaveBeenCalledTimes(1);
    const message = adapter.transport.mock.calls[0]?.[0];
    expect(message.to).toBe('user@acme.test');
    expect(message.from).toBe('Acme Suite <noreply@acme.test>');
    expect(message.subject).toContain('Acme Suite');
    expect(message.html).toContain('Acme Suite');
  });
});

describe('createEmailPort.send enqueues, never transports (AC #3)', () => {
  it('enqueues the delivery job and leaves transport untouched', async () => {
    const adapter = spyAdapter();
    const deliveryJob = createEmailDeliveryJob({ config, adapter });
    const enqueueSpy = vi
      .fn<(definition: JobDefinition<EmailDeliveryPayload>, payload: EmailDeliveryPayload) => Promise<unknown>>()
      .mockResolvedValue('id');
    const email = createEmailPort({ deliveryJob, enqueue: enqueueSpy });

    await email.send({
      to: 'user@acme.test',
      template: 'invite',
      data: { inviteUrl: 'https://x/i', organizationName: 'Downtown', inviterName: 'Sam' },
    });

    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(enqueueSpy.mock.calls[0]?.[0]).toBe(deliveryJob);
    expect(enqueueSpy.mock.calls[0]?.[1]).toEqual({
      to: 'user@acme.test',
      template: 'invite',
      data: { inviteUrl: 'https://x/i', organizationName: 'Downtown', inviterName: 'Sam' },
    });
    expect(adapter.transport).not.toHaveBeenCalled();
  });

  it('routes the send through the real enqueue onto the queue as email-delivery', async () => {
    const adapter = spyAdapter();
    const deliveryJob = createEmailDeliveryJob({ config, adapter });
    const boss = recordingBoss();
    const email = createEmailPort({
      deliveryJob,
      enqueue: (definition, payload) => enqueue(boss, definition, payload),
    });

    await email.send({ to: 'user@acme.test', template: 'reset', data: { resetUrl: 'https://x/r' } });
    expect(boss.sent).toHaveLength(1);
    expect(boss.sent[0]?.name).toBe('email-delivery');
    expect(adapter.transport).not.toHaveBeenCalled();
  });

  it('rejects a send whose recipient is not a valid email (validated at enqueue)', async () => {
    const adapter = spyAdapter();
    const deliveryJob = createEmailDeliveryJob({ config, adapter });
    const boss = recordingBoss();
    const email = createEmailPort({
      deliveryJob,
      enqueue: (definition, payload) => enqueue(boss, definition, payload),
    });

    await expect(
      email.send({ to: 'not-an-email', template: 'reset', data: { resetUrl: 'https://x/r' } }),
    ).rejects.toThrow();
    expect(boss.sent).toHaveLength(0);
  });
});
