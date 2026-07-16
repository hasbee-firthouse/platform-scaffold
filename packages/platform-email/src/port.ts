import { z } from 'zod';
import type { ProductConfig } from '@platform/config';
import { defineJob, type JobDefinition } from '@platform/jobs';
import { renderTemplate, type TemplateDataMap, type TemplateName } from './templates/index.js';

/** A fully rendered message handed to a transport adapter. */
export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Performs the actual transport when the email-delivery job runs (SMTP or dev). */
export interface EmailAdapter {
  transport(message: EmailMessage): Promise<void>;
}

/** Input to {@link EmailPort.send} — `data` is type-checked against the chosen template. */
export interface SendEmailInput<K extends TemplateName = TemplateName> {
  to: string;
  template: K;
  data: TemplateDataMap[K];
}

/**
 * The email port (SPEC §6.3 / §13). `send` ENQUEUES the email-delivery job — it
 * never transports synchronously; direct synchronous send is not exposed.
 */
export interface EmailPort {
  send<K extends TemplateName>(input: SendEmailInput<K>): Promise<void>;
}

const templateNameSchema = z.enum([
  'verify',
  'reset',
  'magic-link',
  'invite',
  'account-created',
  'generic',
]);

/** The payload carried by the email-delivery job through the queue. */
export const emailDeliveryPayloadSchema = z.object({
  to: z.string().email(),
  template: templateNameSchema,
  data: z.unknown(),
});
export type EmailDeliveryPayload = z.infer<typeof emailDeliveryPayloadSchema>;

function formatFrom(config: ProductConfig): string {
  return `${config.email.fromName} <${config.email.fromAddress}>`;
}

/** Dependencies for the email-delivery job's worker handler. */
export interface EmailDeliveryDeps {
  config: ProductConfig;
  adapter: EmailAdapter;
}

/**
 * Build the email-delivery {@link JobDefinition} (AC #4). Its handler renders the
 * requested template with the product's branding and terminology, then hands the
 * message to the transport adapter — this is where mail actually leaves the system.
 */
export function createEmailDeliveryJob(deps: EmailDeliveryDeps): JobDefinition<EmailDeliveryPayload> {
  return defineJob('email-delivery', emailDeliveryPayloadSchema, async (payload) => {
    const rendered = renderTemplate(
      payload.template,
      deps.config.branding,
      deps.config.terminology,
      payload.data,
    );
    await deps.adapter.transport({
      from: formatFrom(deps.config),
      to: payload.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  });
}

/**
 * Dependencies for the enqueue-only email port. `enqueue` is typed for the
 * delivery payload specifically; a generic `platformJobs.enqueue` is assignable
 * to it, so the API composition root can pass its enqueuer directly.
 */
export interface EmailPortDeps {
  deliveryJob: JobDefinition<EmailDeliveryPayload>;
  enqueue: (definition: JobDefinition<EmailDeliveryPayload>, payload: EmailDeliveryPayload) => Promise<unknown>;
}

/**
 * Build the {@link EmailPort}. `send` validates and enqueues the email-delivery
 * job via the injected `enqueue` (typically `platformJobs.enqueue`); transport
 * happens later when the worker runs the job (AC #3).
 */
export function createEmailPort(deps: EmailPortDeps): EmailPort {
  return {
    async send(input) {
      await deps.enqueue(deps.deliveryJob, {
        to: input.to,
        template: input.template,
        data: input.data,
      });
    },
  };
}
