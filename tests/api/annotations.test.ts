import { describe, expect, it } from 'vitest';
import { ABSENT_ID, api, createHarness, seedProjectWithImage, square } from '../helpers/harness';

/** A 4x4 RLE mask covering exactly 16 pixels, 4 of them foreground. */
const fullRle = { type: 'rle' as const, size: [4, 4] as [number, number], counts: [4, 4, 8] };

describe('POST /api/annotations', () => {
  it('creates a polygon annotation and computes the area server-side', async () => {
    const harness = createHarness();
    const { projectId, imageId } = await seedProjectWithImage(harness);
    const response = await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'cat', segmentation: square(20) })
      .expect(201);
    expect(response.body.area).toBe(400);
    expect(response.body.projectId).toBe(projectId);
  });

  it('derives the project from the image', async () => {
    const harness = createHarness();
    const { projectId, imageId } = await seedProjectWithImage(harness);
    const response = await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'cat', segmentation: square(20) })
      .expect(201);
    expect(response.body.projectId).toBe(projectId);
  });

  it('flips the image status to annotated in the same unit of work', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'cat', segmentation: square(20) })
      .expect(201);
    const image = await api(harness).get(`/api/images/${imageId}`).expect(200);
    expect(image.body.status).toBe('annotated');
  });

  it('creates an RLE annotation when the mask covers the whole image', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness, { width: 4, height: 4 });
    const response = await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'dog', segmentation: fullRle })
      .expect(201);
    expect(response.body.area).toBe(4);
  });

  it('rejects an RLE whose size does not match the image', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness, { width: 8, height: 8 });
    const response = await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'dog', segmentation: fullRle })
      .expect(400);
    expect(response.body.error.message).toContain('must equal image dimensions');
  });

  it('rejects an RLE whose counts do not cover every pixel', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness, { width: 4, height: 4 });
    const response = await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'dog', segmentation: { ...fullRle, counts: [4, 4] } })
      .expect(400);
    expect(response.body.error.message).toContain('must cover exactly 16 pixels');
  });

  it('rejects a polygon that falls outside the image', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness, { width: 50, height: 50 });
    const response = await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'cat', segmentation: square(40, 30, 30) })
      .expect(400);
    expect(response.body.error.message).toContain('falls outside');
  });

  it('accepts a matching client-supplied area', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'cat', segmentation: square(20), area: 400 })
      .expect(201);
  });

  it('rejects a mismatched client-supplied area', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    const response = await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'cat', segmentation: square(20), area: 123 })
      .expect(400);
    expect(response.body.error.message).toContain('does not match server-computed area');
  });

  it('rejects a client-supplied area of 0 rather than ignoring it', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'cat', segmentation: square(20), area: 0 })
      .expect(400);
  });

  it('rejects a degenerate polygon that encloses no area', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    const collinear = {
      type: 'polygon' as const,
      polygons: [
        {
          rings: [
            [
              [0, 0],
              [10, 0],
              [20, 0],
            ],
          ],
        },
      ],
    };
    const response = await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'cat', segmentation: collinear })
      .expect(400);
    expect(response.body.error.message).toBe('Segmentation encloses no area');
  });

  it('rejects a ring with fewer than three points', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    await api(harness)
      .post('/api/annotations')
      .send({
        image: imageId,
        label: 'cat',
        segmentation: {
          type: 'polygon',
          polygons: [
            {
              rings: [
                [
                  [0, 0],
                  [1, 1],
                ],
              ],
            },
          ],
        },
      })
      .expect(400);
  });

  it('rejects a mismatched explicit project', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    const response = await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, project: ABSENT_ID, label: 'cat', segmentation: square(20) })
      .expect(400);
    expect(response.body.error.message).toContain('does not match');
  });

  it('rejects a missing label', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    const response = await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, segmentation: square(20) })
      .expect(400);
    expect(response.body.error.details[0].path).toBe('label');
  });

  it('rejects a missing segmentation', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    await api(harness).post('/api/annotations').send({ image: imageId, label: 'cat' }).expect(400);
  });

  it('rejects an unknown segmentation type', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'cat', segmentation: { type: 'mask', data: [] } })
      .expect(400);
  });

  it('rejects a malformed image id', async () => {
    await api(createHarness())
      .post('/api/annotations')
      .send({ image: 'notanid', label: 'cat', segmentation: square(20) })
      .expect(400);
  });

  it('returns 404 when the image does not exist', async () => {
    await api(createHarness())
      .post('/api/annotations')
      .send({ image: ABSENT_ID, label: 'cat', segmentation: square(20) })
      .expect(404);
  });

  it('defaults createdBy to the authenticated caller', async () => {
    const harness = createHarness();
    const signup = await api(harness)
      .post('/api/auth/signup')
      .send({ name: 'Ada', email: 'ada@example.com', password: 'hunter2hunter2' })
      .expect(201);
    const { imageId } = await seedProjectWithImage(harness);
    const response = await api(harness)
      .post('/api/annotations')
      .set('Authorization', `Bearer ${signup.body.token}`)
      .send({ image: imageId, label: 'cat', segmentation: square(20) })
      .expect(201);
    expect(response.body.createdBy).toBe(signup.body.user.id);
  });

  it('lets an explicit createdBy override the caller', async () => {
    const harness = createHarness();
    const signup = await api(harness)
      .post('/api/auth/signup')
      .send({ name: 'Ada', email: 'ada@example.com', password: 'hunter2hunter2' })
      .expect(201);
    const { imageId } = await seedProjectWithImage(harness);
    const response = await api(harness)
      .post('/api/annotations')
      .set('Authorization', `Bearer ${signup.body.token}`)
      .send({ image: imageId, label: 'cat', segmentation: square(20), createdBy: ABSENT_ID })
      .expect(201);
    expect(response.body.createdBy).toBe(ABSENT_ID);
  });
});

describe('GET /api/annotations', () => {
  async function seedThree() {
    const harness = createHarness();
    const { projectId, imageId } = await seedProjectWithImage(harness);
    for (const [label, side] of [
      ['cat', 10],
      ['cat', 20],
      ['dog', 30],
    ] as const) {
      await api(harness)
        .post('/api/annotations')
        .send({ image: imageId, label, segmentation: square(side) })
        .expect(201);
    }
    return { harness, projectId, imageId };
  }

  it('returns every annotation by default', async () => {
    const { harness } = await seedThree();
    const response = await api(harness).get('/api/annotations').expect(200);
    expect(response.body.total).toBe(3);
  });

  it('filters by label', async () => {
    const { harness } = await seedThree();
    const response = await api(harness).get('/api/annotations?label=cat').expect(200);
    expect(response.body.total).toBe(2);
  });

  it('filters by project', async () => {
    const { harness, projectId } = await seedThree();
    const response = await api(harness).get(`/api/annotations?projectId=${projectId}`).expect(200);
    expect(response.body.total).toBe(3);
  });

  it('filters by image', async () => {
    const { harness, imageId } = await seedThree();
    const response = await api(harness).get(`/api/annotations?imageId=${imageId}`).expect(200);
    expect(response.body.total).toBe(3);
  });

  it('accepts createdBy as a synonym for annotator', async () => {
    const { harness } = await seedThree();
    const byAnnotator = await api(harness)
      .get(`/api/annotations?annotator=${ABSENT_ID}`)
      .expect(200);
    const byCreatedBy = await api(harness)
      .get(`/api/annotations?createdBy=${ABSENT_ID}`)
      .expect(200);
    expect(byAnnotator.body.total).toBe(byCreatedBy.body.total);
  });

  it('pages the results', async () => {
    const { harness } = await seedThree();
    const response = await api(harness).get('/api/annotations?limit=2').expect(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.total).toBe(3);
  });

  it('rejects a malformed imageId filter', async () => {
    const { harness } = await seedThree();
    await api(harness).get('/api/annotations?imageId=notanid').expect(400);
  });
});

describe('GET /api/annotations/:id and /rank', () => {
  it('returns the annotation', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    const created = await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'cat', segmentation: square(20) })
      .expect(201);
    const response = await api(harness).get(`/api/annotations/${created.body.id}`).expect(200);
    expect(response.body.label).toBe('cat');
  });

  it('ranks the largest annotation on an image first', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    const ids: string[] = [];
    for (const side of [10, 30, 20]) {
      const created = await api(harness)
        .post('/api/annotations')
        .send({ image: imageId, label: 'x', segmentation: square(side) })
        .expect(201);
      ids.push(created.body.id);
    }
    const biggest = await api(harness).get(`/api/annotations/${ids[1]}/rank`).expect(200);
    expect(biggest.body).toMatchObject({ rank: 1, total: 3, area: 900 });
    const smallest = await api(harness).get(`/api/annotations/${ids[0]}/rank`).expect(200);
    expect(smallest.body.rank).toBe(3);
  });

  it('ranks a lone annotation first of one', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    const created = await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'x', segmentation: square(20) })
      .expect(201);
    const response = await api(harness).get(`/api/annotations/${created.body.id}/rank`).expect(200);
    expect(response.body).toMatchObject({ rank: 1, total: 1 });
  });

  it('returns 404 for an annotation that does not exist', async () => {
    await api(createHarness()).get(`/api/annotations/${ABSENT_ID}`).expect(404);
  });

  it('returns 400 for a malformed id', async () => {
    await api(createHarness()).get('/api/annotations/notanid/rank').expect(400);
  });
});

describe('GET /api/projects/:id/annotations/export', () => {
  it('exports every annotation with a bounding box', async () => {
    const harness = createHarness();
    const { projectId, imageId } = await seedProjectWithImage(harness);
    await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'cat', segmentation: square(20, 5, 5) })
      .expect(201);

    const response = await api(harness)
      .get(`/api/projects/${projectId}/annotations/export`)
      .expect(200);
    expect(response.body.count).toBe(1);
    expect(response.body.truncated).toBe(false);
    expect(response.body.annotations[0].bbox).toEqual([5, 5, 20, 20]);
  });

  it('exports an empty project as an empty list', async () => {
    const harness = createHarness();
    const created = await api(harness).post('/api/projects').send({ name: 'p' }).expect(201);
    const response = await api(harness)
      .get(`/api/projects/${created.body.id}/annotations/export`)
      .expect(200);
    expect(response.body).toMatchObject({ count: 0, truncated: false, annotations: [] });
  });

  it('returns 404 for a project that does not exist', async () => {
    await api(createHarness()).get(`/api/projects/${ABSENT_ID}/annotations/export`).expect(404);
  });
});
