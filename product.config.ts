import { defineProduct } from '@platform/config';

/**
 * THE product definition (SPEC §7) — the entire rebrand surface. Forks edit this
 * file (and `modules/`) and nothing else under `apps/` or `packages/`.
 */
export default defineProduct({
  name: 'Scaffold Reference',
  profile: 'b2b-standard',
  branding: {
    productName: 'Scaffold Reference',
    logo: { light: '/brand/logo.svg', dark: '/brand/logo-dark.svg' },
    favicon: '/brand/favicon.svg',
    // `destructive` themes danger surfaces (e.g. the member-remove button and
    // its confirmation). Optional like the other non-primary tokens; the dark
    // variant is derived automatically. Falls back to the built-in red if unset.
    // "Blueprint" direction: a single structural cobalt accent + a warm red for
    // danger. Neutrals, surfaces, sidebar, and semantic status colors are driven
    // by apps/web/src/styles/globals.css (both themes); only the runtime-injected
    // brand tokens live here (ThemeProvider derives their dark variants).
    colors: { primary: '#2b44cc', destructive: '#bb3a2c' },
    // System grotesk for text (crisp, no webfont dependency). A monospace
    // "instrument" face for labels/data/timestamps is exposed as --font-mono.
    typography: {
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
    radius: '0.5rem',
  },
  terminology: {
    organization: { singular: 'Organization', plural: 'Organizations' },
    member: { singular: 'Member', plural: 'Members' },
    // Reference-module nouns: the module screens resolve `workspace`/`task` via
    // useTerm(), so relabeling them here renames the UI to Space/Note with no
    // component edits (SPEC §7.3). The DB tables are `space`/`note` to match.
    workspace: { singular: 'Space', plural: 'Spaces' },
    task: { singular: 'Note', plural: 'Notes' },
  },
  // Org typing (SPEC §7 / control-plane Gap 3): the two sides of the reference
  // product. A Writer org authors notes (the `workspace`/Spaces nav; Author/Editor
  // roles); a Reader org browses + engages (the `library` nav; Reader/Commenter
  // roles). The shell reads this to offer the right roles per org type and — once
  // it gates nav by type — to show the right nav. A marketplace fork would instead
  // declare `buyer`/`seller` here the same way.
  orgTypes: {
    writer: { nav: ['reference-workspace'], roles: ['Author', 'Editor'] },
    reader: { nav: ['reference-library'], roles: ['Reader', 'Commenter'] },
  },
  email: { fromName: 'Scaffold Reference', fromAddress: 'no-reply@scaffold.example' },
});
