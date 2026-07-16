import { describe, expect, it, vi } from 'vitest';
import type { Transporter } from 'nodemailer';
import type { EmailMessage } from '../port.js';
import { createSmtpAdapter } from './smtp.js';
import { createDevAdapter } from './dev.js';

const message: EmailMessage = {
  from: 'Acme Suite <noreply@acme.test>',
  to: 'user@acme.test',
  subject: 'Verify your email for Acme Suite',
  html: '<p>hi</p>',
  text: 'hi',
};

/** A stub nodemailer transporter capturing sendMail calls (no live SMTP). */
function stubTransporter(): { sendMail: ReturnType<typeof vi.fn>; transporter: Transporter } {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'x' });
  return { sendMail, transporter: { sendMail } as unknown as Transporter };
}

describe('createSmtpAdapter', () => {
  it('forwards the rendered message to nodemailer sendMail', async () => {
    const { sendMail, transporter } = stubTransporter();
    const adapter = createSmtpAdapter('smtp://localhost:2525', transporter);
    await adapter.transport(message);
    expect(sendMail).toHaveBeenCalledWith({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  });
});

describe('createDevAdapter', () => {
  it('logs the send and forwards it to Mailpit via sendMail', async () => {
    const { sendMail, transporter } = stubTransporter();
    const log = vi.fn();
    const adapter = createDevAdapter(transporter, log);
    await adapter.transport(message);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain(message.subject);
    expect(log.mock.calls[0]?.[0]).toContain(message.to);
  });
});
