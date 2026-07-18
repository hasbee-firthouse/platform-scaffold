import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { ThemeProvider } from './providers/theme-provider.js';
import { TerminologyProvider } from './providers/terminology-provider.js';
import { QueryProvider } from './providers/query-client.js';
import { PermissionsProvider } from './lib/can.js';
import { createAppRouter } from './router/router.js';
import { useSessionQuery } from './session/use-session.js';
import { sessionPermissions, type SessionState } from './session/session.js';
import type { MeResponse } from './lib/org-client.js';
import { WEB_MODULE_MANIFESTS } from '../../../modules/register-web.js';

/**
 * Bridges the resolved session into the router (a fresh router per auth
 * transition so `beforeLoad` guards see the current session synchronously) and
 * publishes the caller's permission set to the `<Can>` gate. Depends only on the
 * stable `me` reference so the router is not rebuilt on every render.
 */
function AuthenticatedApp({ me }: { me: MeResponse | null }): ReactElement {
  const router = useMemo(() => {
    const session: SessionState = me
      ? { status: 'authenticated', me }
      : { status: 'unauthenticated' };
    return createAppRouter({ registry: WEB_MODULE_MANIFESTS, session });
  }, [me]);

  const permissions = useMemo(
    () => sessionPermissions(me ? { status: 'authenticated', me } : { status: 'unauthenticated' }),
    [me],
  );

  return (
    <PermissionsProvider permissions={permissions}>
      <RouterProvider router={router} />
    </PermissionsProvider>
  );
}

/** Runs the `/api/me` bootstrap; shows a splash until the session resolves. */
function SessionGate(): ReactElement {
  const session = useSessionQuery();
  if (session.status === 'loading') {
    return (
      <div role="status" aria-live="polite" className="app-splash">
        Loading…
      </div>
    );
  }
  return <AuthenticatedApp me={session.status === 'authenticated' ? session.me : null} />;
}

/**
 * The web composition root (integration workstream). Layers branding, data,
 * terminology and the session bootstrap around the router: ThemeProvider →
 * QueryClientProvider → session bootstrap → TerminologyProvider +
 * PermissionsProvider → RouterProvider.
 */
export function App(): ReactElement {
  return (
    <ThemeProvider>
      <QueryProvider>
        <TerminologyProvider>
          <SessionGate />
        </TerminologyProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
