import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { api, createHarness, serve } from '../helpers/harness';

describe('health endpoints', () => {
  const harness = createHarness();

  it('reports the service name and dependencies', async () => {
    const response = await api(harness).get('/api/health').expect(200);
    expect(response.body.service).toBe('PearlAI API');
    expect(response.body.status).toBe('ok');
    expect(response.body.dependencies).toEqual([
      { name: 'persistence', state: 'skipped', detail: 'in-memory' },
    ]);
  });

  it('answers the liveness probe', async () => {
    const response = await api(harness).get('/api/health/live').expect(200);
    expect(response.body).toEqual({ status: 'alive' });
  });

  it('answers the readiness probe with 200 when nothing is down', async () => {
    const response = await api(harness).get('/api/health/ready').expect(200);
    expect(response.body.status).toBe('ready');
  });

  it('answers the readiness probe with 503 when a dependency is down', async () => {
    const degraded = createHarness();
    degraded.container.probe = async () => [
      { name: 'mongodb', state: 'down', detail: 'disconnected' },
    ];
    // The probe is read through the container at request time, so rebuild the
    // app to pick it up.
    const response = await request(serve(createApp(degraded.container)))
      .get('/api/health/ready')
      .expect(503);
    expect(response.body.status).toBe('not_ready');
  });

  it('returns a structured 404 for an unknown route', async () => {
    const response = await api(harness).get('/api/nope').expect(404);
    expect(response.body.error.code).toBe('not_found');
    expect(response.body.error.message).toContain('GET /api/nope');
  });

  it('does not advertise the framework', async () => {
    const response = await api(harness).get('/api/health').expect(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('sets the helmet security headers', async () => {
    const response = await api(harness).get('/api/health').expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
