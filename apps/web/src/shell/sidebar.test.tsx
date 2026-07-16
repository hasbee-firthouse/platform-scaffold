// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { defineProduct } from '@platform/config';
import type { Navigation, ProductConfig } from '@platform/config';
import { Sidebar, resolveNavItems } from './sidebar.js';
import type { WebModuleManifest, WebModuleRegistry } from '../router/assemble-routes.js';

function manifest(id: string, nav: WebModuleManifest['nav']): WebModuleManifest {
  return { id, basePath: id, scope: 'org', webRoutes: () => [], nav };
}

const registry: WebModuleRegistry = [
  manifest('reports', [{ id: 'reports', label: 'Reports', path: '/o/acme/reports' }]),
  manifest('billing', [{ id: 'billing', label: 'Billing', path: '/o/acme/billing' }]),
  manifest('admin', [{ id: 'admin', label: 'Admin', path: '/o/acme/admin' }]),
];

function configWith(navigation: Navigation): ProductConfig {
  return defineProduct({
    name: 'Nav Test',
    profile: 'b2b-standard',
    navigation,
    branding: {
      productName: 'Nav Test',
      logo: { light: '/l.svg', dark: '/d.svg' },
      favicon: '/f.svg',
      colors: { primary: '#4f46e5' },
      typography: { fontFamily: 'Inter, sans-serif' },
      radius: '0.5rem',
    },
    email: { fromName: 'Nav Test', fromAddress: 'no-reply@nav.example' },
  });
}

afterEach(cleanup);

describe('resolveNavItems', () => {
  it('orders items by navigation.order (AC2)', () => {
    const items = resolveNavItems(registry, { order: ['billing', 'reports', 'admin'] });
    expect(items.map((i) => i.id)).toEqual(['billing', 'reports', 'admin']);
  });

  it('omits items listed in navigation.hidden (AC2)', () => {
    const items = resolveNavItems(registry, { hidden: ['admin'] });
    expect(items.map((i) => i.id)).toEqual(['reports', 'billing']);
  });

  it('places unordered items after ordered ones in declaration order', () => {
    const items = resolveNavItems(registry, { order: ['admin'] });
    expect(items.map((i) => i.id)).toEqual(['admin', 'reports', 'billing']);
  });
});

describe('Sidebar', () => {
  it('renders nav contributions in configured order, hiding hidden ones (AC2)', () => {
    render(
      <Sidebar registry={registry} config={configWith({ order: ['billing', 'reports'], hidden: ['admin'] })} />,
    );
    const nav = screen.getByRole('navigation', { name: /primary/i });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Billing', 'Reports']);
    expect(within(nav).queryByText('Admin')).not.toBeInTheDocument();
  });

  it('renders an empty nav for the default empty registry without crashing', () => {
    render(<Sidebar />);
    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(within(nav).queryAllByRole('link')).toHaveLength(0);
  });
});
