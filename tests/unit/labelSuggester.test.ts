import { describe, expect, it } from 'vitest';
import { extractFeatures, featureDistance } from '../../src/ai/features';
import { HeuristicLabelSuggester } from '../../src/ai/heuristicSuggester';
import { parseSuggestions } from '../../src/ai/anthropicSuggester';
import type { Annotation } from '../../src/domain/models';
import type { Segmentation } from '../../src/domain/segmentation';

const square = (side: number): Segmentation => ({
  type: 'polygon',
  polygons: [
    {
      rings: [
        [
          [0, 0],
          [side, 0],
          [side, side],
          [0, side],
        ],
      ],
    },
  ],
});

const wideRect = (width: number, height: number): Segmentation => ({
  type: 'polygon',
  polygons: [
    {
      rings: [
        [
          [0, 0],
          [width, 0],
          [width, height],
          [0, height],
        ],
      ],
    },
  ],
});

function annotation(label: string, segmentation: Segmentation): Annotation {
  return {
    id: 'a'.repeat(24),
    projectId: 'b'.repeat(24),
    imageId: 'c'.repeat(24),
    label,
    segmentation,
    area: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe('extractFeatures', () => {
  it('reports the fraction of the image a mask covers', () => {
    const features = extractFeatures(square(50), 100, 100);
    expect(features.areaRatio).toBeCloseTo(0.25, 6);
  });

  it('reports the bounding-box aspect ratio', () => {
    expect(extractFeatures(wideRect(80, 20), 100, 100).aspectRatio).toBeCloseTo(4, 6);
  });

  it('reports a full box as fully filled for a rectangle', () => {
    expect(extractFeatures(wideRect(80, 20), 100, 100).fillRatio).toBeCloseTo(1, 6);
  });

  it('clamps areaRatio to 1 when a mask exceeds the stated image size', () => {
    expect(extractFeatures(square(500), 100, 100).areaRatio).toBe(1);
  });

  it('carries the encoding through', () => {
    expect(extractFeatures({ type: 'rle', size: [4, 4], counts: [4, 12] }, 4, 4).kind).toBe('rle');
  });
});

describe('featureDistance', () => {
  it('is zero for identical features', () => {
    const features = extractFeatures(square(50), 100, 100);
    expect(featureDistance(features, features)).toBe(0);
  });

  it('grows as shapes diverge', () => {
    const reference = extractFeatures(square(50), 100, 100);
    const near = extractFeatures(square(52), 100, 100);
    const far = extractFeatures(square(5), 100, 100);
    expect(featureDistance(reference, near)).toBeLessThan(featureDistance(reference, far));
  });

  it('penalises a different encoding', () => {
    const polygon = extractFeatures(square(2), 4, 4);
    const rle = extractFeatures({ type: 'rle', size: [4, 4], counts: [12, 4] }, 4, 4);
    expect(featureDistance(polygon, rle)).toBeGreaterThan(0);
  });
});

describe('HeuristicLabelSuggester', () => {
  const suggester = new HeuristicLabelSuggester();

  const request = (exemplars: Annotation[], vocabulary: string[] = []) => ({
    features: extractFeatures(square(50), 100, 100),
    vocabulary,
    exemplars,
    imageWidth: 100,
    imageHeight: 100,
  });

  it('identifies itself as the heuristic provider', async () => {
    const result = await suggester.suggest(request([]));
    expect(result.provider).toBe('heuristic');
  });

  it('ranks the label whose shapes match most closely first', async () => {
    const result = await suggester.suggest(
      request([
        annotation('car', wideRect(90, 10)),
        annotation('sign', square(49)),
        annotation('sign', square(51)),
      ]),
    );
    expect(result.suggestions[0].label).toBe('sign');
  });

  it('is deterministic across repeated calls', async () => {
    const exemplars = [annotation('cat', square(40)), annotation('dog', square(60))];
    const first = await suggester.suggest(request(exemplars));
    const second = await suggester.suggest(request(exemplars));
    expect(first).toEqual(second);
  });

  it('returns confidences that sum to about 1', async () => {
    const result = await suggester.suggest(
      request([annotation('cat', square(40)), annotation('dog', square(60))]),
    );
    const total = result.suggestions.reduce((acc, s) => acc + s.confidence, 0);
    expect(total).toBeCloseTo(1, 2);
  });

  it('returns at most three suggestions', async () => {
    const exemplars = ['a', 'b', 'c', 'd', 'e'].map((label) => annotation(label, square(40)));
    const result = await suggester.suggest(request(exemplars));
    expect(result.suggestions).toHaveLength(3);
  });

  it('falls back to the vocabulary when there are no exemplars', async () => {
    const result = await suggester.suggest(request([], ['person', 'car']));
    expect(result.suggestions.map((s) => s.label)).toEqual(['person', 'car']);
    expect(result.suggestions[0].reason).toContain('no comparable shapes');
  });

  it('returns nothing when there is neither an exemplar nor a vocabulary', async () => {
    expect((await suggester.suggest(request([]))).suggestions).toEqual([]);
  });

  it('explains each suggestion', async () => {
    const result = await suggester.suggest(request([annotation('cat', square(50))]));
    expect(result.suggestions[0].reason).toContain('cat');
  });
});

describe('parseSuggestions', () => {
  const vocabulary = ['cat', 'dog'];

  it('reads a plain JSON object', () => {
    const text = '{"suggestions":[{"label":"cat","confidence":0.9,"reason":"whiskers"}]}';
    expect(parseSuggestions(text, vocabulary)).toEqual([
      { label: 'cat', confidence: 0.9, reason: 'whiskers' },
    ]);
  });

  it('reads JSON wrapped in prose', () => {
    const text =
      'Here you go:\n{"suggestions":[{"label":"dog","confidence":0.5}]}\nHope that helps.';
    expect(parseSuggestions(text, vocabulary)[0].label).toBe('dog');
  });

  it('drops labels outside the supplied vocabulary', () => {
    const text =
      '{"suggestions":[{"label":"unicorn","confidence":1},{"label":"cat","confidence":0.2}]}';
    expect(parseSuggestions(text, vocabulary).map((s) => s.label)).toEqual(['cat']);
  });

  it('drops duplicates', () => {
    const text =
      '{"suggestions":[{"label":"cat","confidence":1},{"label":"cat","confidence":0.5}]}';
    expect(parseSuggestions(text, vocabulary)).toHaveLength(1);
  });

  it('clamps a confidence outside 0-1', () => {
    const text = '{"suggestions":[{"label":"cat","confidence":7}]}';
    expect(parseSuggestions(text, vocabulary)[0].confidence).toBe(1);
  });

  it('substitutes a default reason when one is missing', () => {
    const text = '{"suggestions":[{"label":"cat","confidence":0.4}]}';
    expect(parseSuggestions(text, vocabulary)[0].reason).toBe('suggested by Claude');
  });

  it('returns nothing for text with no JSON in it', () => {
    expect(parseSuggestions('I could not decide.', vocabulary)).toEqual([]);
  });

  it('returns nothing for malformed JSON', () => {
    expect(parseSuggestions('{"suggestions": [', vocabulary)).toEqual([]);
  });

  it('returns nothing when suggestions is not an array', () => {
    expect(parseSuggestions('{"suggestions": "cat"}', vocabulary)).toEqual([]);
  });
});
