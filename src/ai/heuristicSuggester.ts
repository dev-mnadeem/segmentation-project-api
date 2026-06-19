import { LABEL_SUGGESTION_COUNT } from '../config/constants';
import { extractFeatures, featureDistance } from './features';
import type {
  LabelSuggester,
  LabelSuggestion,
  SuggestLabelRequest,
  SuggestLabelResult,
} from './types';

/**
 * The default suggester: a nearest-neighbour vote over the shapes already
 * annotated in the same project. No network, no API key, no randomness — the
 * same input always yields the same ranking, which is why the test suite can
 * assert on it.
 *
 * It does not recognise objects. It answers a narrower, honest question:
 * "which labels in this project have been applied to masks shaped like this
 * one?" That is what an annotator actually wants pre-filled.
 */
export class HeuristicLabelSuggester implements LabelSuggester {
  readonly name = 'heuristic';

  async suggest(request: SuggestLabelRequest): Promise<SuggestLabelResult> {
    const scores = new Map<string, number>();

    for (const exemplar of request.exemplars) {
      const exemplarFeatures = extractFeatures(
        exemplar.segmentation,
        request.imageWidth,
        request.imageHeight,
      );
      const distance = featureDistance(request.features, exemplarFeatures);
      // Similarity decays smoothly with distance and never reaches zero, so a
      // label seen many times at moderate distance can still outrank a label
      // seen once at close range.
      const similarity = 1 / (1 + distance);
      scores.set(exemplar.label, (scores.get(exemplar.label) ?? 0) + similarity);
    }

    if (scores.size === 0) {
      return { provider: this.name, suggestions: this.vocabularyFallback(request) };
    }

    const totalScore = [...scores.values()].reduce((acc, score) => acc + score, 0);
    const suggestions: LabelSuggestion[] = [...scores.entries()]
      .map(([label, score]) => ({
        label,
        confidence: round(score / totalScore),
        reason: `shape resembles existing "${label}" annotations in this project`,
      }))
      // Ties break alphabetically so the ranking is fully deterministic.
      .sort((a, b) => b.confidence - a.confidence || a.label.localeCompare(b.label))
      .slice(0, LABEL_SUGGESTION_COUNT);

    return { provider: this.name, suggestions };
  }

  /** With no exemplars, fall back to the project's label list in frequency order. */
  private vocabularyFallback(request: SuggestLabelRequest): LabelSuggestion[] {
    return request.vocabulary.slice(0, LABEL_SUGGESTION_COUNT).map((label, index) => ({
      label,
      confidence: round(1 / (index + 2)),
      reason: 'no comparable shapes yet — ranked by how often the label is used',
    }));
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
