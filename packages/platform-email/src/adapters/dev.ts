import { createTransport, type Transporter } from 'nodemailer';
import type { EmailAdapter, EmailMessage } from '../port.js';

const MAILPIT_HOST = 'localhost';
const MAILPIT_PORT = 1025;

export type LogFn = (message: string) => void;

/**
 * Dev transport adapter (SPEC §13): delivers to Mailpit (localhost:1025, UI at
 * :8025) and logs each send so the message is discoverable during local dev.
 * The transporter and logger are injectable for tests; live Mailpit receipt is
 * verified in the evaluate phase.
 */
export function createDevAdapter(
  transporter: Transporter = createTransport({ host: MAILPIT_HOST, port: MAILPIT_PORT, secure: false }),
  log: LogFn = (message) => console.log(message),
): EmailAdapter {
  return {
    async transport(message: EmailMessage): Promise<void> {
      log(`[email:dev] -> ${message.to} :: ${message.subject}`);
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
