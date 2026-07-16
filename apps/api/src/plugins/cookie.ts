import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

/** Cookie parsing/signing support (E2-S1), used later by the auth session module. */
export async function registerCookie(app: FastifyInstance): Promise<void> {
  await app.register(cookie);
}
