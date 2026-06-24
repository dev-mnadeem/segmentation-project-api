import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../../src/app';
import { AuthService } from '../../src/services/AuthService';
import { api, createHarness, serve, TEST_JWT_SECRET } from '../helpers/harness';

const credentials = {
  name: 'Ada Lovelace',
  email: 'Ada@Example.com',
  password: 'correct-horse-battery',
};

describe('POST /api/auth/signup', () => {
  it('creates an account and returns a token', async () => {
    const response = await api(createHarness()).post('/api/auth/signup').send(credentials);
    expect(response.status).toBe(201);
    expect(response.body.user.name).toBe('Ada Lovelace');
    expect(typeof response.body.token).toBe('string');
    expect(response.body.expiresIn).toBe('12h');
  });

  it('never returns the password hash', async () => {
    const response = await api(createHarness()).post('/api/auth/signup').send(credentials);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it('normalises the email to lowercase', async () => {
    const response = await api(createHarness()).post('/api/auth/signup').send(credentials);
    expect(response.body.user.email).toBe('ada@example.com');
  });

  it('issues a token whose subject is the user id', async () => {
    const response = await api(createHarness()).post('/api/auth/signup').send(credentials);
    const claims = jwt.verify(response.body.token, TEST_JWT_SECRET) as jwt.JwtPayload;
    expect(claims.sub).toBe(response.body.user.id);
    expect(claims.exp).toBeGreaterThan(claims.iat!);
  });

  it('defaults the role to annotator', async () => {
    const response = await api(createHarness()).post('/api/auth/signup').send(credentials);
    expect(response.body.user.role).toBe('annotator');
  });

  it('rejects a duplicate email with 409', async () => {
    const harness = createHarness();
    await api(harness).post('/api/auth/signup').send(credentials).expect(201);
    const response = await api(harness).post('/api/auth/signup').send(credentials).expect(409);
    expect(response.body.error.code).toBe('conflict');
  });

  it('treats a differently-cased email as the same account', async () => {
    const harness = createHarness();
    await api(harness).post('/api/auth/signup').send(credentials).expect(201);
    await api(harness)
      .post('/api/auth/signup')
      .send({ ...credentials, email: 'ADA@EXAMPLE.COM' })
      .expect(409);
  });

  it('rejects a password shorter than the minimum', async () => {
    const response = await api(createHarness())
      .post('/api/auth/signup')
      .send({ ...credentials, password: 'short' })
      .expect(400);
    expect(response.body.error.code).toBe('validation_error');
    expect(response.body.error.details[0].path).toBe('password');
  });

  it('rejects a malformed email', async () => {
    const response = await api(createHarness())
      .post('/api/auth/signup')
      .send({ ...credentials, email: 'not-an-email' })
      .expect(400);
    expect(response.body.error.details[0].path).toBe('email');
  });

  it('reports every invalid field at once', async () => {
    const response = await api(createHarness())
      .post('/api/auth/signup')
      .send({ name: '', email: 'nope', password: 'x' })
      .expect(400);
    expect(response.body.error.details).toHaveLength(3);
  });

  it('rejects an unknown role', async () => {
    await api(createHarness())
      .post('/api/auth/signup')
      .send({ ...credentials, role: 'superuser' })
      .expect(400);
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token for correct credentials', async () => {
    const harness = createHarness();
    await api(harness).post('/api/auth/signup').send(credentials).expect(201);
    const response = await api(harness)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    expect(typeof response.body.token).toBe('string');
  });

  it('rejects a wrong password with 401', async () => {
    const harness = createHarness();
    await api(harness).post('/api/auth/signup').send(credentials).expect(201);
    const response = await api(harness)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: 'wrong' })
      .expect(401);
    expect(response.body.error.message).toBe('Invalid credentials');
  });

  it('gives the same message for an unknown account as for a wrong password', async () => {
    const harness = createHarness();
    const unknown = await api(harness)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' })
      .expect(401);
    expect(unknown.body.error.message).toBe('Invalid credentials');
  });

  it('returns 503 when JWT_SECRET is not configured', async () => {
    const harness = createHarness({ jwtSecret: undefined });
    // A harness built without a secret still parses because AUTH_REQUIRED is
    // off; the auth endpoints themselves are what refuse.
    harness.container.services.auth = new AuthService({
      users: harness.container.repositories.users,
    });
    const response = await request(serve(createApp(harness.container)))
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(503);
    expect(response.body.error.code).toBe('service_unavailable');
  });
});

describe('bearer token handling', () => {
  it('rejects an expired token with 401', async () => {
    const expired = jwt.sign({ email: 'a@b.com', role: 'annotator' }, TEST_JWT_SECRET, {
      subject: 'a'.repeat(24),
      expiresIn: '-1s',
    });
    const response = await api(createHarness())
      .get('/api/projects')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
    expect(response.body.error.message).toContain('expired');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ email: 'a@b.com', role: 'admin' }, 'some-other-secret-value', {
      subject: 'a'.repeat(24),
    });
    const response = await api(createHarness())
      .get('/api/projects')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
    expect(response.body.error.code).toBe('unauthorized');
  });

  it('ignores a non-bearer Authorization header', async () => {
    await api(createHarness())
      .get('/api/projects')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .expect(200);
  });
});
