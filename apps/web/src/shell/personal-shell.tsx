import type { ReactElement } from 'react';
import { Outlet, useRouteContext } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { ProductConfig } from '@platform/config';
import defaultConfig from '../../../../product.config.js';
import { useTheme } from '../providers/theme-provider.js';
import { isAuthenticated } from '../session/session.js';
import { SESSION_QUERY_KEY } from '../session/use-session.js';
import type { AppRouterContext } from '../router/route-context.js';
import { emptyRegistry, type WebModuleRegistry } from '../router/assemble-routes.js';
import { NavLink, type ShellNavLink } from './nav.js';
import { resolveNavItems } from './sidebar.js';
import { UserMenu } from './user-menu.js';

/**
 * The module nav links shown in the personal (b2c) sidebar. Only modules
 * actually mounted under `/app` are linked — personal-scoped modules always are,
 * org-scoped modules only when `personalAccounts` is on — mirroring the route
 * assembly in `createAppRoutes` so a link never points at an unmounted route.
 */
function personalModuleNavLinks(
  registry: WebModuleRegistry,
  config: ProductConfig,
): ShellNavLink[] {
  const byId = new Map(registry.map((module) => [module.id, module]));
  return resolveNavItems(registry, config.navigation)
    .map((item): ShellNavLink | null => {
      const module = byId.get(item.moduleId);
      if (!module) {
        return null;
      }
      const mountedUnderApp = module.scope === 'personal' || config.capabilities.personalAccounts;
      return mountedUnderApp
        ? { key: `${item.moduleId}:${item.id}`, label: item.label, to: `/app/${module.basePath}` }
        : null;
    })
    .filter((link): link is ShellNavLink => link !== null);
}

/**
 * The personal (b2c) shell chrome. Uses the same left-sidebar layout as
 * {@link createOrgShell} so navigation lives in the same place regardless of
 * profile — a fork replacing the reference module fills this sidebar with its
 * real product nav. Bound to the module registry (closed over, never imported)
 * so the reference module stays deletable.
 */
export function createPersonalShell(
  registry: WebModuleRegistry = emptyRegistry,
  config: ProductConfig = defaultConfig,
): () => ReactElement {
  return function PersonalShell(): ReactElement {
    const context = useRouteContext({ strict: false }) as unknown as AppRouterContext;
    const queryClient = useQueryClient();
    const theme = useTheme();
    if (!isAuthenticated(context.session)) {
      return <Outlet />;
    }
    const navLinks = personalModuleNavLinks(registry, config);
    const logo = theme.mode === 'dark' ? config.branding.logo.dark : config.branding.logo.light;
    const signedOut = (): void => {
      queryClient.removeQueries({ queryKey: SESSION_QUERY_KEY });
      window.location.assign('/sign-in');
    };
    return (
      <div className="shell-layout">
        <aside className="shell-aside">
          <a href="/" className="shell-brand" aria-label="Go to home">
            <img src={logo} alt={`${config.branding.productName} logo`} />
            <span>{config.branding.productName}</span>
          </a>
          <nav aria-label="Primary" className="shell-sidebar">
            <ul>
              {navLinks.map((link) => (
                <NavLink key={link.key} link={link} />
              ))}
            </ul>
          </nav>
        </aside>
        <div className="shell-content">
          <header className="shell-topbar">
            <div className="shell-topbar-actions">
              <button
                type="button"
                className="theme-toggle"
                onClick={theme.toggleTheme}
                aria-label={`Switch to ${theme.mode === 'light' ? 'dark' : 'light'} theme`}
              >
                <span aria-hidden="true">{theme.mode === 'light' ? '◐' : '◑'}</span>
                <span>{theme.mode === 'light' ? 'Dark' : 'Light'}</span>
              </button>
              <UserMenu
                user={context.session.me.user}
                settingsBasePath="/app/settings"
                onSignedOut={signedOut}
              />
            </div>
          </header>
          <main className="shell-main">
            <Outlet />
          </main>
        </div>
      </div>
    );
  };
}
