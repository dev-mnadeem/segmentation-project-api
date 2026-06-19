import { describe, expect, it } from 'vitest';
import { ABSENT_ID, api, createHarness, seedProjectWithImage } from '../helpers/harness';

const image = (uri: string) => ({ uri, width: 640, height: 480 });

async function newProject(harness: ReturnType<typeof createHarness>) {
  const response = await api(harness).post('/api/projects').send({ name: 'p' }).expect(201);
  return response.body.id as string;
}

describe('POST /api/projects/:projectId/images', () => {
  it('bulk-inserts images and reports the count', async () => {
    const harness = createHarness();
    const projectId = await newProject(harness);
    const response = await api(harness)
      .post(`/api/projects/${projectId}/images`)
      .send({ images: [image('https://example.com/a.jpg'), image('https://example.com/b.jpg')] })
      .expect(201);
    expect(response.body.inserted).toBe(2);
    expect(response.body.images).toHaveLength(2);
  });

  it('attaches every image to the project in the path', async () => {
    const harness = createHarness();
    const projectId = await newProject(harness);
    const response = await api(harness)
      .post(`/api/projects/${projectId}/images`)
      .send({ images: [image('https://example.com/a.jpg')] })
      .expect(201);
    expect(response.body.images[0].projectId).toBe(projectId);
  });

  it('defaults new images to unassigned', async () => {
    const harness = createHarness();
    const projectId = await newProject(harness);
    const response = await api(harness)
      .post(`/api/projects/${projectId}/images`)
      .send({ images: [image('https://example.com/a.jpg')] })
      .expect(201);
    expect(response.body.images[0].status).toBe('unassigned');
  });

  it('returns 404 when the project does not exist', async () => {
    await api(createHarness())
      .post(`/api/projects/${ABSENT_ID}/images`)
      .send({ images: [image('https://example.com/a.jpg')] })
      .expect(404);
  });

  it('rejects an empty images array', async () => {
    const harness = createHarness();
    const projectId = await newProject(harness);
    const response = await api(harness)
      .post(`/api/projects/${projectId}/images`)
      .send({ images: [] })
      .expect(400);
    expect(response.body.error.details[0].path).toBe('images');
  });

  it('rejects an image missing its dimensions', async () => {
    const harness = createHarness();
    const projectId = await newProject(harness);
    const response = await api(harness)
      .post(`/api/projects/${projectId}/images`)
      .send({ images: [{ uri: 'https://example.com/a.jpg' }] })
      .expect(400);
    const paths = response.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(['images.0.width', 'images.0.height']);
  });

  it('rejects a non-zero but negative width', async () => {
    const harness = createHarness();
    const projectId = await newProject(harness);
    await api(harness)
      .post(`/api/projects/${projectId}/images`)
      .send({ images: [{ uri: 'https://example.com/a.jpg', width: -1, height: 10 }] })
      .expect(400);
  });

  it('rejects a uri that is not a URL', async () => {
    const harness = createHarness();
    const projectId = await newProject(harness);
    await api(harness)
      .post(`/api/projects/${projectId}/images`)
      .send({ images: [{ uri: 'not a url', width: 10, height: 10 }] })
      .expect(400);
  });

  it('rejects a batch larger than the bulk limit', async () => {
    const harness = createHarness();
    const projectId = await newProject(harness);
    const images = Array.from({ length: 501 }, (_, i) => image(`https://example.com/${i}.jpg`));
    await api(harness).post(`/api/projects/${projectId}/images`).send({ images }).expect(400);
  });

  it('inserts nothing when any image in the batch is invalid', async () => {
    const harness = createHarness();
    const projectId = await newProject(harness);
    await api(harness)
      .post(`/api/projects/${projectId}/images`)
      .send({ images: [image('https://example.com/a.jpg'), { uri: 'https://x.com/b.jpg' }] })
      .expect(400);
    const listed = await api(harness).get(`/api/projects/${projectId}/images`).expect(200);
    expect(listed.body.total).toBe(0);
  });

  it('rejects a malformed project id', async () => {
    await api(createHarness())
      .post('/api/projects/notanid/images')
      .send({ images: [image('https://example.com/a.jpg')] })
      .expect(400);
  });
});

describe('GET /api/projects/:projectId/images', () => {
  it('lists the project images', async () => {
    const harness = createHarness();
    const projectId = await newProject(harness);
    await api(harness)
      .post(`/api/projects/${projectId}/images`)
      .send({ images: [image('https://example.com/a.jpg'), image('https://example.com/b.jpg')] })
      .expect(201);
    const response = await api(harness).get(`/api/projects/${projectId}/images`).expect(200);
    expect(response.body.total).toBe(2);
  });

  it('filters by status', async () => {
    const harness = createHarness();
    const projectId = await newProject(harness);
    await api(harness)
      .post(`/api/projects/${projectId}/images`)
      .send({ images: [image('https://example.com/a.jpg')] })
      .expect(201);
    const annotated = await api(harness)
      .get(`/api/projects/${projectId}/images?status=annotated`)
      .expect(200);
    expect(annotated.body.total).toBe(0);
  });

  it('returns 404 for a project that does not exist', async () => {
    await api(createHarness()).get(`/api/projects/${ABSENT_ID}/images`).expect(404);
  });
});

describe('GET /api/images/:id', () => {
  it('returns the image', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    const response = await api(harness).get(`/api/images/${imageId}`).expect(200);
    expect(response.body.id).toBe(imageId);
    expect(response.body.width).toBe(640);
  });

  it('returns 404 for an image that does not exist', async () => {
    await api(createHarness()).get(`/api/images/${ABSENT_ID}`).expect(404);
  });

  it('returns 400 for a malformed id', async () => {
    await api(createHarness()).get('/api/images/notanid').expect(400);
  });
});
