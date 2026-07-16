import type { ReactElement } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { ThemeProvider } from './providers/theme-provider.js';
import { TerminologyProvider } from './providers/terminology-provider.js';
import { QueryProvider } from './providers/query-client.js';
import { router } from './router/router.js';

/**
 * The web composition root (E3-S4). Layers the branding, terminology, data, and
 * routing providers around the assembled shell — the single place the app tree
 * is wired together.
 */
export function App(): ReactElement {
  return (
    <ThemeProvider>
      <TerminologyProvider>
        <QueryProvider>
          <RouterProvider router={router} />
        </QueryProvider>
      </TerminologyProvider>
    </ThemeProvider>
  );
}
