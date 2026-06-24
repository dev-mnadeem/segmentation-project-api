import { describe, expect, it, vi } from 'vitest';
import type { LabelSuggester } from '../../src/ai/types';
import { ABSENT_ID, api, createHarness, seedProjectWithImage, square } from '../helpers/harness';

describe('POST /api/annotations/suggest-label', () => {
  it('ranks labels from the project using the heuristic provider', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness, { width: 100, height: 100 });

    await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'sign', segmentation: square(50) })
      .expect(201);
    await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'bolt', segmentation: square(3) })
      .expect(201);

    const response = await api(harness)
      .post('/api/annotations/suggest-label')
      .send({ image: imageId, segmentation: square(49) })
      .expect(200);

    expect(response.body.provider).toBe('heuristic');
    expect(response.body.suggestions[0].label).toBe('sign');
  });

  it('returns no suggestions for a project with no annotations yet', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness, { width: 100, height: 100 });
    const response = await api(harness)
      .post('/api/annotations/suggest-label')
      .send({ image: imageId, segmentation: square(10) })
      .expect(200);
    expect(response.body.suggestions).toEqual([]);
  });

  it('gives the same answer twice for the same input', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness, { width: 100, height: 100 });
    await api(harness)
      .post('/api/annotations')
      .send({ image: imageId, label: 'sign', segmentation: square(50) })
      .expect(201);

    const body = { image: imageId, segmentation: square(40) };
    const first = await api(harness).post('/api/annotations/suggest-label').send(body).expect(200);
    const second = await api(harness).post('/api/annotations/suggest-label').send(body).expect(200);
    expect(first.body).toEqual(second.body);
  });

  it('validates the mask against the image before asking a provider', async () => {
    const suggest = vi.fn();
    const stub: LabelSuggester = { name: 'stub', suggest };
    const harness = createHarness({ labelSuggester: stub });
    const { imageId } = await seedProjectWithImage(harness, { width: 20, height: 20 });

    await api(harness)
      .post('/api/annotations/suggest-label')
      .send({ image: imageId, segmentation: square(40) })
      .expect(400);
    expect(suggest).not.toHaveBeenCalled();
  });

  it('passes scale-invariant features rather than raw coordinates to the provider', async () => {
    const suggest = vi.fn().mockResolvedValue({ provider: 'stub', suggestions: [] });
    const harness = createHarness({ labelSuggester: { name: 'stub', suggest } });
    const { imageId } = await seedProjectWithImage(harness, { width: 100, height: 100 });

    await api(harness)
      .post('/api/annotations/suggest-label')
      .send({ image: imageId, segmentation: square(50) })
      .expect(200);

    const request = suggest.mock.calls[0][0];
    expect(request.features.areaRatio).toBeCloseTo(0.25, 6);
    expect(request.features.kind).toBe('polygon');
    expect(request.imageWidth).toBe(100);
  });

  it('reports whichever provider answered', async () => {
    const suggest = vi.fn().mockResolvedValue({
      provider: 'stub',
      suggestions: [{ label: 'cat', confidence: 1, reason: 'stubbed' }],
    });
    const harness = createHarness({ labelSuggester: { name: 'stub', suggest } });
    const { imageId } = await seedProjectWithImage(harness, { width: 100, height: 100 });

    const response = await api(harness)
      .post('/api/annotations/suggest-label')
      .send({ image: imageId, segmentation: square(50) })
      .expect(200);
    expect(response.body.provider).toBe('stub');
  });

  it('returns 404 when the image does not exist', async () => {
    await api(createHarness())
      .post('/api/annotations/suggest-label')
      .send({ image: ABSENT_ID, segmentation: square(10) })
      .expect(404);
  });

  it('rejects a body with no segmentation', async () => {
    const harness = createHarness();
    const { imageId } = await seedProjectWithImage(harness);
    await api(harness).post('/api/annotations/suggest-label').send({ image: imageId }).expect(400);
  });

  it('is not shadowed by the /:id route', async () => {
    const harness = createHarness();
    // "suggest-label" is not a valid object id, so if the :id route matched
    // first this would be a 400 from param validation instead of a 404.
    const response = await api(harness)
      .post('/api/annotations/suggest-label')
      .send({ image: ABSENT_ID, segmentation: square(10) });
    expect(response.status).toBe(404);
  });
});
