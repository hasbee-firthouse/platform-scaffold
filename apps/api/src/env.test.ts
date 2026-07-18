import { describe, expect, it } from 'vitest';
import { InvalidEnvError, loadEnv } from './env.js';

function validSource(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    APP_URL: 'https://app.example.com',
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/platform',
    BETTER_AUTH_SECRET: 'a-very-long-random-secret-value',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    SMTP_URL: 'smtp://mailpit:1025',
    ...overrides,
  };
}

describe('loadEnv', () => {
  it('returns a typed Env when every required variable is present and valid', () => {
    const env = loadEnv(validSource());

    expect(env).toEqual({
      NODE_ENV: 'test',
      APP_URL: 'https://app.example.com',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/platform',
      BETTER_AUTH_SECRET: 'a-very-long-random-secret-value',
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      SMTP_URL: 'smtp://mailpit:1025',
    });
  });

  it('accepts the absence of the optional APP_RUNTIME_DATABASE_URL (single-URL dev boot)', () => {
    const env = loadEnv(validSource());

    expect(env.APP_RUNTIME_DATABASE_URL).toBeUndefined();
  });

  it('carries APP_RUNTIME_DATABASE_URL through when present (two-role wiring)', () => {
    const runtimeUrl = 'postgres://app_runtime:app_runtime_dev_pw@localhost:5432/platform';

    const env = loadEnv(validSource({ APP_RUNTIME_DATABASE_URL: runtimeUrl }));

    expect(env.APP_RUNTIME_DATABASE_URL).toBe(runtimeUrl);
  });

  it('throws InvalidEnvError naming SMTP_URL when it is missing', () => {
    const source = validSource({ SMTP_URL: undefined });

    try {
      loadEnv(source);
      throw new Error('expected loadEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvError);
      expect((error as Error).message).toContain('SMTP_URL');
    }
  });

  it('throws InvalidEnvError naming DATABASE_URL when it is missing', () => {
    const source = validSource({ DATABASE_URL: undefined });

    expect(() => loadEnv(source)).toThrow(InvalidEnvError);
    try {
      loadEnv(source);
      throw new Error('expected loadEnv to throw');
    } catch (error) {
      expect((error as Error).message).toContain('DATABASE_URL');
    }
  });

  it('throws InvalidEnvError naming APP_URL when it is missing', () => {
    const source = validSource({ APP_URL: undefined });

    try {
      loadEnv(source);
      throw new Error('expected loadEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvError);
      expect((error as Error).message).toContain('APP_URL');
    }
  });

  it('throws InvalidEnvError naming BETTER_AUTH_SECRET when it is missing', () => {
    const source = validSource({ BETTER_AUTH_SECRET: undefined });

    try {
      loadEnv(source);
      throw new Error('expected loadEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvError);
      expect((error as Error).message).toContain('BETTER_AUTH_SECRET');
    }
  });

  it('throws InvalidEnvError naming NODE_ENV when it is missing or not one of the known values', () => {
    const source = validSource({ NODE_ENV: 'staging' });

    try {
      loadEnv(source);
      throw new Error('expected loadEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvError);
      expect((error as Error).message).toContain('NODE_ENV');
    }
  });

  it('throws InvalidEnvError naming GOOGLE_CLIENT_ID when it is missing', () => {
    const source = validSource({ GOOGLE_CLIENT_ID: undefined });

    try {
      loadEnv(source);
      throw new Error('expected loadEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvError);
      expect((error as Error).message).toContain('GOOGLE_CLIENT_ID');
    }
  });

  it('throws InvalidEnvError naming GOOGLE_CLIENT_SECRET when it is missing', () => {
    const source = validSource({ GOOGLE_CLIENT_SECRET: undefined });

    try {
      loadEnv(source);
      throw new Error('expected loadEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvError);
      expect((error as Error).message).toContain('GOOGLE_CLIENT_SECRET');
    }
  });

  it('rejects an APP_URL that is not a valid URL', () => {
    const source = validSource({ APP_URL: 'not-a-url' });

    expect(() => loadEnv(source)).toThrow(InvalidEnvError);
  });

  it('lists every offending variable when multiple are missing at once', () => {
    const source = validSource({ DATABASE_URL: undefined, BETTER_AUTH_SECRET: undefined });

    try {
      loadEnv(source);
      throw new Error('expected loadEnv to throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('BETTER_AUTH_SECRET');
    }
  });
});
