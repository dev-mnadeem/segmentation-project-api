import { describe, expect, it } from 'vitest';
import { api, createHarness, seedProjectWithImage, square } from '../helpers/harness';

/**
 * With AUTH_REQUIRED=true every write needs a token and every read stays open.
 */
describe('AUTH_REQUIRED=true', () => {
  const harness = () => createHarness({ authRequired: true });

  async function tokenFor(h: ReturnType<typeof harness>, email: string) {
    const response = await api(h)
      .post('/api/auth/signup')
      .send({ name: 'Ada', email, password: 'hunter2hunter2' })
      .expect(201);
    return response.body.token as string;
  }

  it('rejects an anonymous project create with 401', async () => {
    const response = await api(harness()).post('/api/projects').send({ name: 'x' }).expect(401);
    expect(response.body.error.code).toBe('unauthorized');
  });

  it('rejects an anonymous annotation create with 401', async () => {
    await api(harness())
      .post('/api/annotations')
      .send({ image: '0'.repeat(24), label: 'cat', segmentation: square(10) })
      .expect(401);
  });

  it('rejects an anonymous bulk image create with 401', async () => {
    await api(harness())
      .post(`/api/projects/${'0'.repeat(24)}/images`)
      .send({ images: [{ uri: 'https://example.com/a.jpg', width: 10, height: 10 }] })
      .expect(401);
  });

  it('rejects an anonymous label suggestion with 401', async () => {
    await api(harness())
      .post('/api/annotations/suggest-label')
      .send({ image: '0'.repeat(24), segmentation: square(10) })
      .expect(401);
  });

  it('allows the same write with a valid token', async () => {
    const h = harness();
    const token = await tokenFor(h, 'ada@example.com');
    await api(h)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'x' })
      .expect(201);
  });

  it('leaves reads open to anonymous callers', async () => {
    await api(harness()).get('/api/projects').expect(200);
    await api(harness()).get('/api/annotations').expect(200);
    await api(harness()).get('/api/health').expect(200);
  });
});

describe('AUTH_REQUIRED=false', () => {
  it('allows an anonymous write', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'cat', segmentation: square(10) })
      .expect(201);
  });

  it('still attributes an annotation when a token is supplied', async () => {
    const harness = createHarness();
    const signup = await api(harness)
      .post('/api/auth/signup')
      .send({ name: 'Ada', email: 'ada@example.com', password: 'hunter2hunter2' })
      .expect(201);
    const { imageId } = await seedProjectWithImage(harness);
    const response = await api(harness)
      .post('/api/annotations')
      .set('Authorization', `Bearer ${signup.body.token}`)
      .send({ image: imageId, label: 'cat', segmentation: square(10) })
      .expect(201);
    expect(response.body.createdBy).toBe(signup.body.user.id);
  });
});
