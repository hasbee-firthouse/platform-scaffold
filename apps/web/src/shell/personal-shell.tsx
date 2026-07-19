import type { ReactElement } from 'react';
import { Outlet, useRouteContext } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { ProductConfig } from '@platform/config';
import { useTheme } from '../providers/theme-provider.js';
import { isAuthenticated } from '../session/session.js';
import { SESSION_QUERY_KEY } from '../session/use-session.js';
import type { AppRouterContext } from '../router/route-context.js';
import { UserMenu } from './user-menu.js';

export function createPersonalShell(config: ProductConfig): () => ReactElement {
  return function PersonalShell(): ReactElement {
    const context = useRouteContext({ strict: false }) as unknown as AppRouterContext;
    const queryClient = useQueryClient();
    const theme = useTheme();
    if (!isAuthenticated(context.session)) {
      return <Outlet />;
    }
    const logo = theme.mode === 'dark' ? config.branding.logo.dark : config.branding.logo.light;
    const signedOut = (): void => {
      queryClient.removeQueries({ queryKey: SESSION_QUERY_KEY });
      window.location.assign('/sign-in');
    };
    return (
      <div className="personal-shell">
        <header className="personal-topbar">
          <a href="/" className="personal-brand" aria-label="Go to home">
            <img src={logo} alt={`${config.branding.productName} logo`} />
            <span>{config.branding.productName}</span>
          </a>
          <UserMenu
            user={context.session.me.user}
            settingsBasePath="/app/settings"
            onSignedOut={signedOut}
          />
        </header>
        <main className="personal-layout">
          <Outlet />
        </main>
      </div>
    );
  };
}
