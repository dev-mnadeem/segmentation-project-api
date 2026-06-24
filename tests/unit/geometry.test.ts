import { describe, expect, it } from 'vitest';
import {
  boundingBox,
  polygonArea,
  ringArea,
  ringCount,
  rleArea,
  rleCoverage,
  segmentationArea,
} from '../../src/lib/geometry';
import type { PolygonSegmentation, RleSegmentation } from '../../src/domain/segmentation';

const unitSquare = (side: number, x = 0, y = 0): PolygonSegmentation => ({
  type: 'polygon',
  polygons: [
    {
      rings: [
        [
          [x, y],
          [x + side, y],
          [x + side, y + side],
          [x, y + side],
        ],
      ],
    },
  ],
});

describe('ringArea', () => {
  it('returns zero for a ring with fewer than three points', () => {
    expect(ringArea([])).toBe(0);
    expect(
      ringArea([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(0);
  });

  it('computes the area of a 10x10 square', () => {
    expect(
      ringArea([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]),
    ).toBe(100);
  });

  it('is independent of winding direction', () => {
    const clockwise = ringArea([
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
    ]);
    const counterClockwise = ringArea([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(clockwise).toBe(counterClockwise);
  });

  it('is unchanged when the caller repeats the first point at the end', () => {
    const open = ringArea([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]);
    const closed = ringArea([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ]);
    expect(closed).toBe(open);
  });

  it('computes the area of a triangle', () => {
    expect(
      ringArea([
        [0, 0],
        [6, 0],
        [0, 4],
      ]),
    ).toBe(12);
  });
});

describe('polygonArea', () => {
  it('subtracts a hole from its outer ring', () => {
    const withHole: PolygonSegmentation = {
      type: 'polygon',
      polygons: [
        {
          rings: [
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 10],
            ],
            [
              [2, 2],
              [4, 2],
              [4, 4],
              [2, 4],
            ],
          ],
        },
      ],
    };
    expect(polygonArea(withHole)).toBe(96);
  });

  it('never returns a negative area when holes exceed the outer ring', () => {
    const impossible: PolygonSegmentation = {
      type: 'polygon',
      polygons: [
        {
          rings: [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
            ],
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 10],
            ],
          ],
        },
      ],
    };
    expect(polygonArea(impossible)).toBe(0);
  });

  it('sums disjoint polygons', () => {
    const two: PolygonSegmentation = {
      type: 'polygon',
      polygons: [...unitSquare(3).polygons, ...unitSquare(4, 100, 100).polygons],
    };
    expect(polygonArea(two)).toBe(9 + 16);
  });
});

describe('rleArea and rleCoverage', () => {
  const mask: RleSegmentation = { type: 'rle', size: [4, 4], counts: [3, 5, 2, 6] };

  it('counts only the odd-indexed foreground runs', () => {
    expect(rleArea(mask)).toBe(11);
  });

  it('sums every run for coverage', () => {
    expect(rleCoverage(mask)).toBe(16);
  });

  it('treats a mask that starts with background and never toggles as empty', () => {
    expect(rleArea({ type: 'rle', size: [2, 2], counts: [4] })).toBe(0);
  });
});

describe('segmentationArea', () => {
  it('dispatches on the discriminant', () => {
    expect(segmentationArea(unitSquare(5))).toBe(25);
    expect(segmentationArea({ type: 'rle', size: [2, 2], counts: [1, 3] })).toBe(3);
  });
});

describe('boundingBox', () => {
  it('bounds a polygon', () => {
    expect(boundingBox(unitSquare(10, 5, 7))).toEqual([5, 7, 10, 10]);
  });

  it('returns a zero box for a polygon with no rings', () => {
    expect(boundingBox({ type: 'polygon', polygons: [{ rings: [] }] })).toEqual([0, 0, 0, 0]);
  });

  it('bounds an RLE mask using column-major order', () => {
    // 4 rows: runs are [background 4][foreground 4] => the whole second column.
    const seg: RleSegmentation = { type: 'rle', size: [4, 4], counts: [4, 4, 8] };
    expect(boundingBox(seg)).toEqual([1, 0, 1, 4]);
  });

  it('returns a zero box for an RLE mask with no foreground', () => {
    expect(boundingBox({ type: 'rle', size: [2, 2], counts: [4] })).toEqual([0, 0, 0, 0]);
  });
});

describe('ringCount', () => {
  it('counts every ring across every polygon', () => {
    expect(ringCount(unitSquare(2))).toBe(1);
  });

  it('is zero for an RLE mask', () => {
    expect(ringCount({ type: 'rle', size: [2, 2], counts: [1, 3] })).toBe(0);
  });
});
