import type {
  BoundingBox,
  Polygon,
  PolygonSegmentation,
  Ring,
  RleSegmentation,
  Segmentation,
} from '../domain/segmentation';

/**
 * Pure geometry. No I/O, no framework types — this is the part of the service
 * worth unit-testing exhaustively, and `tests/unit/geometry.test.ts` does.
 */

/**
 * Signed area of a ring via the shoelace formula, halved and made positive.
 * A ring with fewer than three points encloses nothing.
 */
export function ringArea(ring: Ring): number {
  if (ring.length < 3) return 0;
  let doubled = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    doubled += x1 * y2 - x2 * y1;
  }
  return Math.abs(doubled) / 2;
}

/** Outer ring minus its holes, clamped at zero, summed over every polygon. */
export function polygonArea(seg: PolygonSegmentation): number {
  let total = 0;
  for (const polygon of seg.polygons) {
    const [outer, ...holes] = polygon.rings;
    if (!outer) continue;
    const holesArea = holes.reduce((acc, ring) => acc + ringArea(ring), 0);
    total += Math.max(0, ringArea(outer) - holesArea);
  }
  return total;
}

/**
 * RLE runs alternate background/foreground starting with background, so the
 * foreground pixels are the odd-indexed runs.
 */
export function rleArea(seg: RleSegmentation): number {
  let total = 0;
  for (let i = 1; i < seg.counts.length; i += 2) {
    total += seg.counts[i];
  }
  return total;
}

export function segmentationArea(seg: Segmentation): number {
  return seg.type === 'polygon' ? polygonArea(seg) : rleArea(seg);
}

/** Total pixels an RLE claims to cover. Must equal `height * width` to be valid. */
export function rleCoverage(seg: RleSegmentation): number {
  return seg.counts.reduce((acc, run) => acc + run, 0);
}

function polygonBoundingBox(seg: PolygonSegmentation): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of seg.polygons) {
    for (const ring of polygon.rings) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX === Infinity) return [0, 0, 0, 0];
  return [minX, minY, maxX - minX, maxY - minY];
}

/**
 * Bounding box of an RLE mask. Runs are laid out in column-major order (COCO's
 * convention), so a flat index maps to `(x, y) = (floor(i / h), i % h)`.
 */
function rleBoundingBox(seg: RleSegmentation): BoundingBox {
  const [height] = seg.size;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let cursor = 0;

  for (let i = 0; i < seg.counts.length; i += 1) {
    const run = seg.counts[i];
    if (i % 2 === 1 && run > 0) {
      for (let offset = 0; offset < run; offset += 1) {
        const flat = cursor + offset;
        const x = Math.floor(flat / height);
        const y = flat % height;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    cursor += run;
  }

  if (minX === Infinity) return [0, 0, 0, 0];
  return [minX, minY, maxX - minX + 1, maxY - minY + 1];
}

export function boundingBox(seg: Segmentation): BoundingBox {
  return seg.type === 'polygon' ? polygonBoundingBox(seg) : rleBoundingBox(seg);
}

/** Number of rings across every polygon. Always 0 for an RLE mask. */
export function ringCount(seg: Segmentation): number {
  if (seg.type !== 'polygon') return 0;
  return seg.polygons.reduce((acc: number, polygon: Polygon) => acc + polygon.rings.length, 0);
}
