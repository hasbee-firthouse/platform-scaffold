import { describe, expect, it } from 'vitest';
import {
  assertRoutesProtected,
  findUnprotectedRoutes,
  type RegisteredRoute,
} from './static-check.js';

const protectedRoute: RegisteredRoute = {
  method: 'DELETE',
  path: '/api/org',
  permission: 'org.delete',
};
const publicRoute: RegisteredRoute = { method: 'GET', path: '/api/health', public: true };
const unguardedRoute: RegisteredRoute = { method: 'POST', path: '/api/org/secret' };

describe('findUnprotectedRoutes', () => {
  it('flags a route with neither a permission nor public:true (AC #4)', () => {
    const violations = findUnprotectedRoutes([unguardedRoute]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.path).toBe('/api/org/secret');
  });

  it('passes a route that declares an explicit permission (AC #4)', () => {
    expect(findUnprotectedRoutes([protectedRoute])).toEqual([]);
  });

  it('passes a route explicitly marked public:true (AC #4)', () => {
    expect(findUnprotectedRoutes([publicRoute])).toEqual([]);
  });

  it('treats an empty permission string as unprotected (AC #4)', () => {
    expect(findUnprotectedRoutes([{ method: 'GET', path: '/x', permission: '' }])).toHaveLength(1);
  });

  it('reports only the offending routes in a mixed set (AC #4)', () => {
    const violations = findUnprotectedRoutes([protectedRoute, publicRoute, unguardedRoute]);
    expect(violations.map((v) => v.path)).toEqual(['/api/org/secret']);
  });
});

describe('assertRoutesProtected', () => {
  it('throws when any route is unprotected (AC #4)', () => {
    expect(() => assertRoutesProtected([unguardedRoute])).toThrow(/POST \/api\/org\/secret/);
  });

  it('does not throw when every route is protected or public (AC #4)', () => {
    expect(() => assertRoutesProtected([protectedRoute, publicRoute])).not.toThrow();
  });
});
