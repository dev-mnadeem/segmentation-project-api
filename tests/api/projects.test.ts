import { describe, expect, it } from 'vitest';
import { ABSENT_ID, api, createHarness, seedProjectWithImage, square } from '../helpers/harness';

describe('POST /api/projects', () => {
  it('creates a project', async () => {
    const response = await api(createHarness())
      .post('/api/projects')
      .send({ name: 'Street scenes', description: 'Dashcam frames' })
      .expect(201);
    expect(response.body.name).toBe('Street scenes');
    expect(response.body.status).toBe('active');
  });

  it('returns a domain record with no Mongo fields on it', async () => {
    const response = await api(createHarness())
      .post('/api/projects')
      .send({ name: 'Street scenes' })
      .expect(201);
    expect(response.body._id).toBeUndefined();
    expect(response.body.__v).toBeUndefined();
    expect(response.body.id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('rejects a blank name', async () => {
    const response = await api(createHarness())
      .post('/api/projects')
      .send({ name: '   ' })
      .expect(400);
    expect(response.body.error.details[0].path).toBe('name');
  });

  it('rejects a createdBy that is not an object id', async () => {
    await api(createHarness())
      .post('/api/projects')
      .send({ name: 'ok', createdBy: 'nope' })
      .expect(400);
  });

  it('rejects a body that is not JSON', async () => {
    const response = await api(createHarness())
      .post('/api/projects')
      .set('Content-Type', 'application/json')
      .send('{not json')
      .expect(400);
    expect(response.body.error.code).toBe('bad_request');
  });
});

describe('GET /api/projects', () => {
  it('pages the list newest-first', async () => {
    const harness = createHarness();
    for (const name of ['first', 'second', 'third']) {
      await api(harness).post('/api/projects').send({ name }).expect(201);
    }
    const response = await api(harness).get('/api/projects?limit=2').expect(200);
    expect(response.body.total).toBe(3);
    expect(response.body.items.map((p: { name: string }) => p.name)).toEqual(['third', 'second']);
  });

  it('honours the page parameter', async () => {
    const harness = createHarness();
    for (const name of ['first', 'second', 'third']) {
      await api(harness).post('/api/projects').send({ name }).expect(201);
    }
    const response = await api(harness).get('/api/projects?limit=2&page=2').expect(200);
    expect(response.body.items.map((p: { name: string }) => p.name)).toEqual(['first']);
  });

  it('defaults to page 1 with a limit of 20', async () => {
    const response = await api(createHarness()).get('/api/projects').expect(200);
    expect(response.body).toMatchObject({ page: 1, limit: 20, total: 0, items: [] });
  });

  it('rejects a non-numeric page instead of skipping NaN rows', async () => {
    const response = await api(createHarness()).get('/api/projects?page=abc').expect(400);
    expect(response.body.error.details[0].path).toBe('page');
  });

  it('rejects page 0', async () => {
    await api(createHarness()).get('/api/projects?page=0').expect(400);
  });

  it('rejects a limit above the maximum', async () => {
    await api(createHarness()).get('/api/projects?limit=1000').expect(400);
  });

  it('rejects a page number past the offset ceiling', async () => {
    await api(createHarness()).get('/api/projects?page=10001').expect(400);
  });

  it('filters by status', async () => {
    const harness = createHarness();
    await api(harness).post('/api/projects').send({ name: 'live' }).expect(201);
    const active = await api(harness).get('/api/projects?status=active').expect(200);
    expect(active.body.total).toBe(1);
    const archived = await api(harness).get('/api/projects?status=archived').expect(200);
    expect(archived.body.total).toBe(0);
  });

  it('rejects an unknown status', async () => {
    await api(createHarness()).get('/api/projects?status=deleted').expect(400);
  });
});

describe('GET /api/projects/:id', () => {
  it('returns the project', async () => {
    const harness = createHarness();
    const created = await api(harness).post('/api/projects').send({ name: 'x' }).expect(201);
    const response = await api(harness).get(`/api/projects/${created.body.id}`).expect(200);
    expect(response.body.id).toBe(created.body.id);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await api(createHarness()).get(`/api/projects/${ABSENT_ID}`).expect(404);
    expect(response.body.error.code).toBe('not_found');
  });

  it('returns 400 for a malformed id', async () => {
    const response = await api(createHarness()).get('/api/projects/notanid').expect(400);
    expect(response.body.error.code).toBe('validation_error');
  });
});

describe('GET /api/projects/:id/stats', () => {
  it('counts images and annotations', async () => {
    const harness = createHarness();
    const { projectId, imageId } = await seedProjectWithImage(harness);
    await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'cat', segmentation: square(10) })
      .expect(201);

    const response = await api(harness).get(`/api/projects/${projectId}/stats`).expect(200);
    expect(response.body).toMatchObject({ projectId, images: 1, annotations: 1 });
  });

  it('groups annotations by annotator and resolves the name', async () => {
    const harness = createHarness();
    const signup = await api(harness)
      .post('/api/auth/signup')
      .send({ name: 'Grace', email: 'grace@example.com', password: 'hunter2hunter2' })
      .expect(201);

    const { projectId, imageId } = await seedProjectWithImage(harness);
    await api(harness)
      .post('/api/annotations')
      .set('Authorization', `Bearer ${signup.body.token}`)
      .send({ image: imageId, label: 'cat', segmentation: square(10) })
      .expect(201);

    const response = await api(harness).get(`/api/projects/${projectId}/stats`).expect(200);
    expect(response.body.perAnnotator).toEqual([
      { annotatorId: signup.body.user.id, count: 1, name: 'Grace', email: 'grace@example.com' },
    ]);
  });

  it('reports an empty breakdown for a project with no annotations', async () => {
    const harness = createHarness();
    const created = await api(harness).post('/api/projects').send({ name: 'empty' }).expect(201);
    const response = await api(harness).get(`/api/projects/${created.body.id}/stats`).expect(200);
    expect(response.body).toMatchObject({ images: 0, annotations: 0, perAnnotator: [] });
  });

  it('returns 404 for a project that does not exist', async () => {
    await api(createHarness()).get(`/api/projects/${ABSENT_ID}/stats`).expect(404);
  });
});
