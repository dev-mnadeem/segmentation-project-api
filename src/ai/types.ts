import type { Annotation } from '../domain/models';
import type { Segmentation } from '../domain/segmentation';

/**
 * Shape features that describe a mask independently of where it sits in the
 * image. Both suggesters consume this rather than raw geometry, so a remote
 * provider never receives coordinates it does not need.
 */
export interface ShapeFeatures {
  /** Mask area divided by image area, in [0, 1]. */
  areaRatio: number;
  /** Bounding-box width divided by height. */
  aspectRatio: number;
  /** Mask area divided by bounding-box area — how solidly the box is filled. */
  fillRatio: number;
  /** Rings across all polygons. 0 for an RLE mask. */
  ringCount: number;
  /** `'polygon'` or `'rle'`. */
  kind: Segmentation['type'];
}

export interface LabelSuggestion {
  label: string;
  /** 0-1. How strongly the provider backs this label. */
  confidence: number;
  /** Human-readable justification. Shown to the caller verbatim. */
  reason: string;
}

export interface SuggestLabelRequest {
  features: ShapeFeatures;
  /** Distinct labels already used in this project, most-used first. */
  vocabulary: string[];
  /** Recent annotations from the same project, used as shape exemplars. */
  exemplars: Annotation[];
  /** Image dimensions, so a provider can reason about absolute scale. */
  imageWidth: number;
  imageHeight: number;
}

export interface SuggestLabelResult {
  /** Which implementation produced the answer — echoed in the HTTP response. */
  provider: string;
  suggestions: LabelSuggestion[];
}

/**
 * The seam. `HeuristicLabelSuggester` is the default and needs no network;
 * `AnthropicLabelSuggester` is opt-in. Adding a third (an in-house classifier,
 * a different vendor) means implementing this one method.
 */
export interface LabelSuggester {
  readonly name: string;
  suggest(request: SuggestLabelRequest): Promise<SuggestLabelResult>;
}
