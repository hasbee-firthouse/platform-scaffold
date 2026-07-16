import { describe, expect, it } from 'vitest';
import type { Branding, Terminology } from '@platform/config';
import { renderVerifyEmail } from './verify.js';
import { renderResetPassword } from './reset.js';
import { renderMagicLink } from './magic-link.js';
import { renderInvite } from './invite.js';
import { renderAccountCreated } from './account-created.js';
import { renderGeneric } from './generic.js';

const branding: Branding = {
  productName: 'Acme Suite',
  logo: { light: 'l.png', dark: 'd.png' },
  favicon: 'f.ico',
  colors: { primary: '#4f46e5' },
  typography: { fontFamily: 'Inter, sans-serif' },
  radius: '8px',
};

// Rebranded terminology: an "organization" is a "Clinic" for this product.
const terminology: Terminology = {
  organization: { singular: 'Clinic', plural: 'Clinics' },
  member: { singular: 'Member', plural: 'Members' },
};

describe('email templates reflect branding.productName (AC #3)', () => {
  it('verify email subject and body carry the product name', () => {
    const email = renderVerifyEmail(branding, terminology, { verificationUrl: 'https://x/verify' });
    expect(email.subject).toContain('Acme Suite');
    expect(email.html).toContain('Acme Suite');
    expect(email.text).toContain('Acme Suite');
    expect(email.html).toContain('https://x/verify');
  });

  it('reset password subject carries the product name', () => {
    const email = renderResetPassword(branding, terminology, { resetUrl: 'https://x/reset' });
    expect(email.subject).toBe('Reset your Acme Suite password');
    expect(email.html).toContain('https://x/reset');
  });

  it('magic-link subject carries the product name', () => {
    const email = renderMagicLink(branding, terminology, { magicLinkUrl: 'https://x/magic' });
    expect(email.subject).toBe('Your Acme Suite sign-in link');
  });

  it('account-created subject carries the product name and greets by name', () => {
    const email = renderAccountCreated(branding, terminology, { name: 'Dana' });
    expect(email.subject).toBe('Welcome to Acme Suite');
    expect(email.html).toContain('Dana');
  });

  it('generic template uses the supplied subject but frames it with branding', () => {
    const email = renderGeneric(branding, terminology, {
      subject: 'Your export is ready',
      heading: 'Export ready',
      body: 'Download it now.',
    });
    expect(email.subject).toBe('Your export is ready');
    expect(email.html).toContain('Acme Suite');
    expect(email.html).toContain('Download it now.');
  });
});

describe('invite template reflects active terminology (AC #3)', () => {
  it('uses the rebranded organization noun in subject, body and CTA', () => {
    const email = renderInvite(branding, terminology, {
      inviteUrl: 'https://x/invite',
      organizationName: 'Downtown Health',
      inviterName: 'Sam',
    });
    expect(email.html).toContain('Clinic');
    expect(email.text).toContain('Clinic');
    expect(email.html).toContain('Downtown Health');
    expect(email.html).toContain('Sam');
    expect(email.subject).toBe("You're invited to join Downtown Health on Acme Suite");
  });
});

describe('template escaping', () => {
  it('escapes HTML in user-supplied invite fields', () => {
    const email = renderInvite(branding, terminology, {
      inviteUrl: 'https://x/invite',
      organizationName: '<script>alert(1)</script>',
      inviterName: 'Sam',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});
