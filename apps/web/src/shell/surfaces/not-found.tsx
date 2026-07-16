import type { ReactElement } from 'react';

/**
 * The 404 surface rendered when no route matches the current location
 * (E3-S4 AC3). Wired as the shell root route's `notFoundComponent`.
 */
export function NotFound(): ReactElement {
  return (
    <section role="region" aria-labelledby="not-found-heading" className="shell-surface">
      <p aria-hidden="true">404</p>
      <h1 id="not-found-heading">Page not found</h1>
      <p>The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
    </section>
  );
}
