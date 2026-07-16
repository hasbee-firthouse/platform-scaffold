import { createTransport, type Transporter } from 'nodemailer';
import type { EmailAdapter, EmailMessage } from '../port.js';

/**
 * SMTP transport adapter (SPEC §13). Builds a nodemailer transport from a
 * `SMTP_URL` connection string; a transporter may be injected for tests. This is
 * the production adapter — live delivery is verified in the evaluate phase.
 */
export function createSmtpAdapter(
  smtpUrl: string,
  transporter: Transporter = createTransport(smtpUrl),
): EmailAdapter {
  return {
    async transport(message: EmailMessage): Promise<void> {
      await transporter.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    },
  };
}
