/**
 * The public authentication routes (integration workstream). They render the
 * existing `screens/auth/*` inside a shell-less centered layout and, when the
 * caller is already authenticated, redirect into the app (`beforeLoad`). Tokens
 * (verify/reset) and identifiers (invite) come from the URL search params; each
 * screen's success callback re-bootstraps the session or navigates onward.
 *
 * The magic-link route is only mounted when the product enables
 * `capabilities.magicLink`, so a product that never turned it on exposes no
 * magic-link URL at all.
 */
import type { ReactElement } from 'react';
import {
  createRoute,
  redirect,
  useNavigate,
  useSearch,
  Outlet,
  type AnyRoute,
} from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { ProductConfig } from '@platform/config';
import { SignInScreen } from '../screens/auth/sign-in.screen.js';
import { SignUpScreen } from '../screens/auth/sign-up.screen.js';
import { VerifyEmailScreen } from '../screens/auth/verify-email.screen.js';
import { ForgotPasswordScreen } from '../screens/auth/forgot-password.screen.js';
import { ResetPasswordScreen } from '../screens/auth/reset-password.screen.js';
import { AcceptInviteScreen } from '../screens/auth/accept-invite.screen.js';
import { MagicLinkScreen } from '../screens/auth/magic-link.screen.js';
import { SESSION_QUERY_KEY } from '../session/use-session.js';
import { activeOrgSlug, isAuthenticated } from '../session/session.js';
import type { AppRouterContext } from './route-context.js';

/** Where an authenticated caller is sent: their active org, else the personal home. */
function authedDestination(context: AppRouterContext): string {
  if (!isAuthenticated(context.session)) {
    return '/app';
  }
  const slug = activeOrgSlug(context.session.me);
  return slug ? `/o/${slug}` : '/app';
}

/** Redirect an already-authenticated visitor away from the public auth pages. */
function redirectIfAuthed(context: AppRouterContext): void {
  if (isAuthenticated(context.session)) {
    throw redirect({ to: authedDestination(context) });
  }
}

/** Read the current URL search params (untyped — screens pick the fields they need). */
function useAuthSearch(): Record<string, string | undefined> {
  return useSearch({ strict: false }) as Record<string, string | undefined>;
}

/** A callback that re-bootstraps the session so the app root re-routes into the app. */
function useReturnToApp(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  };
}

function SignInRoute(): ReactElement {
  const navigate = useNavigate();
  const returnToApp = useReturnToApp();
  return (
    <SignInScreen
      onSignedIn={returnToApp}
      onForgotPassword={() => void navigate({ to: '/forgot-password' })}
    />
  );
}

function SignUpRoute(): ReactElement {
  const navigate = useNavigate();
  return (
    <SignUpScreen
      onSignedUp={(email) => void navigate({ to: '/verify-email', search: { email } })}
    />
  );
}

function VerifyEmailRoute(): ReactElement {
  const search = useAuthSearch();
  const returnToApp = useReturnToApp();
  return <VerifyEmailScreen token={search.token} email={search.email} onVerified={returnToApp} />;
}

function ForgotPasswordRoute(): ReactElement {
  const navigate = useNavigate();
  return <ForgotPasswordScreen onBackToSignIn={() => void navigate({ to: '/sign-in' })} />;
}

function ResetPasswordRoute(): ReactElement {
  const search = useAuthSearch();
  const navigate = useNavigate();
  return (
    <ResetPasswordScreen token={search.token ?? ''} onReset={() => void navigate({ to: '/sign-in' })} />
  );
}

function AcceptInviteRoute(): ReactElement {
  const search = useAuthSearch();
  const returnToApp = useReturnToApp();
  return (
    <AcceptInviteScreen
      invitationId={search.invitationId ?? ''}
      invitation={{
        organizationName: search.org ?? 'this organization',
        invitedByName: search.invitedBy,
        role: search.role,
      }}
      onAccepted={returnToApp}
    />
  );
}

function MagicLinkRoute(): ReactElement {
  return <MagicLinkScreen />;
}

/** The centered, shell-less layout every auth screen renders inside. */
function AuthLayout(): ReactElement {
  return (
    <main className="auth-layout">
      <Outlet />
    </main>
  );
}

/**
 * Build the public auth routes as children of the (shell-less) root route.
 * `beforeLoad` redirects an authenticated caller into the app. Magic-link is
 * config-gated at the route level, not just inside the screen.
 */
export function createAuthRoutes(rootRoute: AnyRoute, config: ProductConfig): AnyRoute {
  const authLayout = createRoute({
    getParentRoute: () => rootRoute,
    id: 'auth',
    component: AuthLayout,
    beforeLoad: ({ context }) => redirectIfAuthed(context as AppRouterContext),
  }) as AnyRoute;

  const child = (path: string, component: () => ReactElement): AnyRoute =>
    createRoute({ getParentRoute: () => authLayout, path, component }) as AnyRoute;

  const routes: AnyRoute[] = [
    child('/sign-in', SignInRoute),
    child('/sign-up', SignUpRoute),
    child('/verify-email', VerifyEmailRoute),
    child('/forgot-password', ForgotPasswordRoute),
    child('/reset-password', ResetPasswordRoute),
    child('/accept-invite', AcceptInviteRoute),
  ];
  if (config.capabilities.magicLink) {
    routes.push(child('/magic-link', MagicLinkRoute));
  }

  return authLayout.addChildren(routes) as AnyRoute;
}
