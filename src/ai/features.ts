import { boundingBox, ringCount, segmentationArea } from '../lib/geometry';
import type { Segmentation } from '../domain/segmentation';
import type { ShapeFeatures } from './types';

/** Derive scale-invariant shape features from a mask and its image size. */
export function extractFeatures(
  segmentation: Segmentation,
  imageWidth: number,
  imageHeight: number,
): ShapeFeatures {
  const area = segmentationArea(segmentation);
  const [, , boxWidth, boxHeight] = boundingBox(segmentation);
  const imageArea = imageWidth * imageHeight;
  const boxArea = boxWidth * boxHeight;

  return {
    areaRatio: imageArea > 0 ? clamp01(area / imageArea) : 0,
    aspectRatio: boxHeight > 0 ? boxWidth / boxHeight : 0,
    fillRatio: boxArea > 0 ? clamp01(area / boxArea) : 0,
    ringCount: ringCount(segmentation),
    kind: segmentation.type,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Distance between two feature vectors. `areaRatio` is compared on a log scale
 * because a 0.01 -> 0.02 change matters far more than 0.50 -> 0.51, and
 * `aspectRatio` likewise because 2:1 and 1:2 are equally far from square.
 */
export function featureDistance(a: ShapeFeatures, b: ShapeFeatures): number {
  const areaTerm = Math.abs(Math.log((a.areaRatio || 1e-6) / (b.areaRatio || 1e-6)));
  const aspectTerm = Math.abs(Math.log((a.aspectRatio || 1e-6) / (b.aspectRatio || 1e-6)));
  const fillTerm = Math.abs(a.fillRatio - b.fillRatio);
  const kindTerm = a.kind === b.kind ? 0 : 0.5;
  return areaTerm + aspectTerm + fillTerm + kindTerm;
}
