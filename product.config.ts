import { defineProduct } from '@platform/config';

/**
 * THE product definition (SPEC §7) — the entire rebrand surface. Forks edit this
 * file (and `modules/`) and nothing else under `apps/` or `packages/`.
 */
export default defineProduct({
  name: 'Scaffold Reference',
  profile: 'b2c-simple',
  branding: {
    productName: 'Scaffold Reference',
    logo: { light: '/brand/logo.svg', dark: '/brand/logo-dark.svg' },
    favicon: '/brand/favicon.svg',
    // `destructive` themes danger surfaces (e.g. the member-remove button and
    // its confirmation). Optional like the other non-primary tokens; the dark
    // variant is derived automatically. Falls back to the built-in red if unset.
    colors: { primary: '#4f46e5', destructive: '#dc2626' },
    typography: { fontFamily: 'Inter, sans-serif' },
    radius: '0.5rem',
  },
  terminology: {
    organization: { singular: 'Organization', plural: 'Organizations' },
    member: { singular: 'Member', plural: 'Members' },
  },
  email: { fromName: 'Scaffold Reference', fromAddress: 'no-reply@scaffold.example' },
});
