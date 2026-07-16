import type { BetterAuthInstance } from './auth.js';
import type { IdentityPort, IdentitySessionResult } from '../port.js';

/**
 * Adapts a configured better-auth instance to the `IdentityPort` surface
 * (E4-S1). This is the only file, besides `auth.ts`, that touches the
 * better-auth API directly; everything downstream depends on `IdentityPort`.
 */
export function toIdentityPort(auth: BetterAuthInstance): IdentityPort {
  return {
    handler: (request) => auth.handler(request),
    async getSession(request) {
      const result = await auth.api.getSession({ headers: request.headers });
      if (!result) {
        return null;
      }
      return toIdentitySessionResult(result);
    },
  };
}

interface BetterAuthSessionResult {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
  };
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
}

function toIdentitySessionResult(result: BetterAuthSessionResult): IdentitySessionResult {
  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      emailVerified: result.user.emailVerified,
      image: result.user.image ?? null,
    },
    session: {
      id: result.session.id,
      userId: result.session.userId,
      token: result.session.token,
      expiresAt: result.session.expiresAt,
      ipAddress: result.session.ipAddress ?? null,
      userAgent: result.session.userAgent ?? null,
    },
  };
}
