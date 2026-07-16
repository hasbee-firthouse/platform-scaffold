import type { IdentityPort, IdentityRequestHandler } from '../port.js';

/** Where the identity handler is mounted once wired into an HTTP framework. */
export const IDENTITY_MOUNT_BASE_PATH = '/api/auth';

/**
 * The mountable surface for `/api/auth/*`, wired into Fastify in a later
 * story (E4-S2). Exposes only the web-standard handler contract so this
 * package stays framework-agnostic — no `fastify` dependency here.
 */
export interface IdentityMount {
  readonly basePath: string;
  readonly handler: IdentityRequestHandler;
}

/** Build the mount descriptor consumed by the Fastify wiring in a later story. */
export function toIdentityMount(port: IdentityPort): IdentityMount {
  return { basePath: IDENTITY_MOUNT_BASE_PATH, handler: port.handler };
}
