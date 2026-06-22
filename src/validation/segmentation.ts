import { z } from 'zod';
import type { Segmentation } from '../domain/segmentation';

const pointZ = z.tuple([z.number().finite(), z.number().finite()]);

/**
 * A ring needs at least three distinct corners to enclose area. Callers must
 * NOT repeat the first point at the end — `ringArea` closes the ring itself,
 * and a repeated point contributes a zero-area segment either way.
 */
const ringZ = z.array(pointZ).min(3).max(100_000);

const polygonZ = z.object({
  rings: z.array(ringZ).min(1).max(1_000),
});

const polygonSegmentationZ = z.object({
  type: z.literal('polygon'),
  polygons: z.array(polygonZ).min(1).max(1_000),
});

const rleSegmentationZ = z.object({
  type: z.literal('rle'),
  /** `[height, width]`, matching COCO. */
  size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  counts: z.array(z.number().int().nonnegative()).min(1).max(1_000_000),
});

export const segmentationZ = z.discriminatedUnion('type', [polygonSegmentationZ, rleSegmentationZ]);

type SegmentationInput = z.infer<typeof segmentationZ>;

/** Narrow a parsed payload to the domain type. */
export function toSegmentation(input: SegmentationInput): Segmentation {
  return input as Segmentation;
}
