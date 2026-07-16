import { describe, expect, it } from 'vitest';
import {
  INVITATION_TTL_DAYS,
  canResend,
  canRevoke,
  confirmationMatches,
  countOwners,
  emailsMatch,
  invitationAcceptability,
  invitationExpiry,
  isExpired,
  isOwner,
  wouldRemoveLastOwner,
} from './invariants.js';

describe('countOwners / isOwner', () => {
  it('counts only owner roles', () => {
    expect(countOwners(['owner', 'admin', 'owner', 'member'])).toBe(2);
    expect(countOwners([])).toBe(0);
    expect(isOwner('owner')).toBe(true);
    expect(isOwner('admin')).toBe(false);
  });
});

describe('wouldRemoveLastOwner (AC#2)', () => {
  it('blocks demoting the only owner', () => {
    expect(wouldRemoveLastOwner('owner', 1, 'admin')).toBe(true);
  });

  it('blocks removing the only owner (no next role)', () => {
    expect(wouldRemoveLastOwner('owner', 1)).toBe(true);
  });

  it('allows demoting an owner when another owner remains', () => {
    expect(wouldRemoveLastOwner('owner', 2, 'member')).toBe(false);
  });

  it('allows a no-op that keeps the member an owner', () => {
    expect(wouldRemoveLastOwner('owner', 1, 'owner')).toBe(false);
  });

  it('never blocks operations on non-owners', () => {
    expect(wouldRemoveLastOwner('admin', 1, 'member')).toBe(false);
    expect(wouldRemoveLastOwner('member', 1)).toBe(false);
  });
});

describe('confirmationMatches (AC#3)', () => {
  it('requires an exact, case-sensitive match', () => {
    expect(confirmationMatches('Acme', 'Acme')).toBe(true);
    expect(confirmationMatches('Acme', 'acme')).toBe(false);
    expect(confirmationMatches('Acme', ' Acme ')).toBe(false);
  });
});

describe('invitation expiry (AC#4)', () => {
  it('sets expiry 7 days out', () => {
    const from = new Date('2026-07-16T00:00:00Z');
    const expiry = invitationExpiry(from);
    expect(expiry.toISOString()).toBe('2026-07-23T00:00:00.000Z');
    expect(INVITATION_TTL_DAYS).toBe(7);
  });

  it('treats the exact expiry instant as expired', () => {
    const at = new Date('2026-07-23T00:00:00Z');
    expect(isExpired(at, at)).toBe(true);
    expect(isExpired(at, new Date('2026-07-22T23:59:59Z'))).toBe(false);
  });
});

describe('invitation state transitions (AC#4)', () => {
  it('only allows resend/revoke while pending', () => {
    expect(canResend('pending')).toBe(true);
    expect(canRevoke('pending')).toBe(true);
    for (const status of ['accepted', 'revoked', 'expired'] as const) {
      expect(canResend(status)).toBe(false);
      expect(canRevoke(status)).toBe(false);
    }
  });
});

describe('invitationAcceptability (AC#4)', () => {
  const base = {
    status: 'pending' as const,
    expiresAt: new Date('2026-07-23T00:00:00Z'),
    invitedEmail: 'grace@acme.com',
    accepterEmail: 'grace@acme.com',
    now: new Date('2026-07-17T00:00:00Z'),
  };

  it('accepts a valid, unexpired, matching-email pending invite', () => {
    expect(invitationAcceptability(base)).toBe('ok');
  });

  it('rejects a non-pending invite', () => {
    expect(invitationAcceptability({ ...base, status: 'revoked' })).toBe('not_pending');
  });

  it('rejects an expired invite', () => {
    expect(invitationAcceptability({ ...base, now: new Date('2026-07-24T00:00:00Z') })).toBe(
      'expired',
    );
  });

  it('rejects an email mismatch', () => {
    expect(invitationAcceptability({ ...base, accepterEmail: 'eve@evil.com' })).toBe(
      'email_mismatch',
    );
  });

  it('matches emails case-insensitively', () => {
    expect(emailsMatch('Grace@Acme.com', 'grace@acme.com')).toBe(true);
  });
});
