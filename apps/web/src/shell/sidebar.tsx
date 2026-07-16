import type { ReactElement } from 'react';
import type { Navigation, ProductConfig } from '@platform/config';
import defaultConfig from '../../../../product.config.js';
import { emptyRegistry } from '../router/assemble-routes.js';
import type { NavContribution, WebModuleRegistry } from '../router/assemble-routes.js';

/** A resolved sidebar entry tagged with the module that contributed it. */
export interface SidebarNavItem extends NavContribution {
  moduleId: string;
}

const UNORDERED_RANK = Number.MAX_SAFE_INTEGER;

/**
 * Flattens module nav contributions into the sidebar list, dropping entries
 * hidden by `navigation.hidden` and sorting by `navigation.order` (E3-S4 AC2).
 * Both `order` and `hidden` match on the nav entry `id` or its module `id`;
 * unordered entries keep their declaration order after ordered ones.
 */
export function resolveNavItems(
  registry: WebModuleRegistry,
  navigation?: Navigation,
): SidebarNavItem[] {
  const hidden = new Set(navigation?.hidden ?? []);
  const order = navigation?.order ?? [];

  const items: SidebarNavItem[] = registry
    .flatMap((module) => (module.nav ?? []).map((nav) => ({ ...nav, moduleId: module.id })))
    .filter((item) => !hidden.has(item.id) && !hidden.has(item.moduleId));

  const rankOf = (item: SidebarNavItem): number => {
    const index = order.indexOf(item.id);
    return index === -1 ? UNORDERED_RANK : index;
  };

  return items
    .map((item, declared) => ({ item, declared }))
    .sort((a, b) => rankOf(a.item) - rankOf(b.item) || a.declared - b.declared)
    .map(({ item }) => item);
}

export interface SidebarProps {
  /** Modules whose nav contributions populate the sidebar. Defaults to empty. */
  registry?: WebModuleRegistry;
  /** Active product config; its `navigation` drives order/visibility. */
  config?: ProductConfig;
}

/**
 * The shell sidebar. Renders module-contributed nav entries in the order and
 * visibility declared by the active product config (E3-S4 AC2).
 */
export function Sidebar({
  registry = emptyRegistry,
  config = defaultConfig,
}: SidebarProps): ReactElement {
  const items = resolveNavItems(registry, config.navigation);
  return (
    <nav aria-label="Primary" className="shell-sidebar">
      <ul>
        {items.map((item) => (
          <li key={`${item.moduleId}:${item.id}`}>
            <a href={item.path}>{item.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
