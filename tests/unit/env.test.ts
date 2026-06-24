import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env';

const base = { PERSISTENCE: 'memory' } as NodeJS.ProcessEnv;

describe('parseEnv', () => {
  it('treats AUTH_REQUIRED="false" as false', () => {
    // Regression guard. `z.coerce.boolean()` delegates to `Boolean(value)`, and
    // `Boolean('false')` is true, so the documented default would silently
    // switch auth on for anyone who wrote the value out explicitly.
    expect(parseEnv({ ...base, AUTH_REQUIRED: 'false' }).AUTH_REQUIRED).toBe(false);
  });

  it('accepts the other spellings of off', () => {
    for (const value of ['0', 'no', 'off']) {
      expect(parseEnv({ ...base, AUTH_REQUIRED: value }).AUTH_REQUIRED).toBe(false);
    }
  });

  it('accepts the spellings of on when a secret is present', () => {
    for (const value of ['true', '1', 'yes', 'on']) {
      const env = parseEnv({ ...base, AUTH_REQUIRED: value, JWT_SECRET: 'a'.repeat(32) });
      expect(env.AUTH_REQUIRED).toBe(true);
    }
  });

  it('rejects a value that is neither on nor off', () => {
    expect(() => parseEnv({ ...base, AUTH_REQUIRED: 'maybe' })).toThrow(/AUTH_REQUIRED/);
  });

  it('defaults AUTH_REQUIRED to false when unset', () => {
    expect(parseEnv(base).AUTH_REQUIRED).toBe(false);
  });

  it('requires JWT_SECRET when AUTH_REQUIRED is on', () => {
    expect(() => parseEnv({ ...base, AUTH_REQUIRED: 'true' })).toThrow(/JWT_SECRET/);
  });

  it('rejects a JWT_SECRET that is too short to be worth having', () => {
    expect(() => parseEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('requires MONGODB_URI when PERSISTENCE is mongo', () => {
    expect(() => parseEnv({ PERSISTENCE: 'mongo' } as NodeJS.ProcessEnv)).toThrow(/MONGODB_URI/);
  });

  it('requires ANTHROPIC_API_KEY when the anthropic suggester is selected', () => {
    expect(() => parseEnv({ ...base, LABEL_SUGGESTER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('defaults to the heuristic suggester', () => {
    expect(parseEnv(base).LABEL_SUGGESTER).toBe('heuristic');
  });

  it('rejects a port outside the valid range', () => {
    expect(() => parseEnv({ ...base, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects a non-numeric port', () => {
    expect(() => parseEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects an unknown log level', () => {
    expect(() => parseEnv({ ...base, LOG_LEVEL: 'chatty' })).toThrow(/LOG_LEVEL/);
  });
});
