import type Anthropic from '@anthropic-ai/sdk';
import { LABEL_SUGGESTION_COUNT } from '../config/constants';
import type { Logger } from '../lib/logger';
import type {
  LabelSuggester,
  LabelSuggestion,
  SuggestLabelRequest,
  SuggestLabelResult,
} from './types';

const SYSTEM_PROMPT = [
  'You rank labels for an image-segmentation annotation tool.',
  'You are given geometric features of a new mask and the label vocabulary already used in the project.',
  'Choose only from the supplied vocabulary. Never invent a label.',
  'Respond with JSON only, matching {"suggestions":[{"label":string,"confidence":number,"reason":string}]}.',
  'confidence is between 0 and 1. Return at most ' + LABEL_SUGGESTION_COUNT + ' suggestions.',
].join(' ');

/** Max tokens for the reply. The response is a short JSON object. */
const MAX_TOKENS = 1024;

export interface AnthropicSuggesterOptions {
  apiKey: string;
  model: string;
  logger: Logger;
  /** Used when the model is unreachable or returns something unusable. */
  fallback: LabelSuggester;
}

/**
 * Opt-in suggester backed by the Claude Messages API.
 *
 * Two deliberate properties:
 *   - the SDK is imported lazily, so nothing loads it unless this provider is
 *     actually selected;
 *   - every failure path delegates to `fallback`, so enabling this provider
 *     cannot turn a working endpoint into a 500.
 */
export class AnthropicLabelSuggester implements LabelSuggester {
  readonly name = 'anthropic';

  private client: Anthropic | null = null;

  constructor(private readonly options: AnthropicSuggesterOptions) {}

  private async getClient(): Promise<Anthropic> {
    if (!this.client) {
      const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
      this.client = new AnthropicSdk({ apiKey: this.options.apiKey });
    }
    return this.client;
  }

  async suggest(request: SuggestLabelRequest): Promise<SuggestLabelResult> {
    if (request.vocabulary.length === 0) {
      // Nothing to choose from — no point spending a request.
      return this.options.fallback.suggest(request);
    }

    try {
      const client = await this.getClient();
      const response = await client.messages.create({
        model: this.options.model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: this.buildPrompt(request) }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      const suggestions = parseSuggestions(text, request.vocabulary);
      if (suggestions.length === 0) {
        this.options.logger.warn('Claude returned no usable label suggestions; using heuristic');
        return this.options.fallback.suggest(request);
      }
      return { provider: this.name, suggestions };
    } catch (error) {
      this.options.logger.warn(
        { err: error },
        'Label suggestion via Claude failed; using heuristic',
      );
      return this.options.fallback.suggest(request);
    }
  }

  private buildPrompt(request: SuggestLabelRequest): string {
    const { features } = request;
    return [
      `Image size: ${request.imageWidth}x${request.imageHeight}.`,
      `Mask encoding: ${features.kind}.`,
      `Fraction of the image covered: ${features.areaRatio.toFixed(4)}.`,
      `Bounding-box aspect ratio (w/h): ${features.aspectRatio.toFixed(3)}.`,
      `Fraction of the bounding box filled: ${features.fillRatio.toFixed(3)}.`,
      `Polygon ring count: ${features.ringCount}.`,
      `Label vocabulary, most used first: ${request.vocabulary.join(', ')}.`,
    ].join('\n');
  }
}

/**
 * Accept the model's JSON, then discard anything not in the vocabulary. The
 * prompt already forbids invented labels; this enforces it regardless.
 */
export function parseSuggestions(text: string, vocabulary: string[]): LabelSuggestion[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }

  const raw = (parsed as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(raw)) return [];

  const allowed = new Set(vocabulary);
  const seen = new Set<string>();
  const suggestions: LabelSuggestion[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { label, confidence, reason } = entry as Record<string, unknown>;
    if (typeof label !== 'string' || !allowed.has(label) || seen.has(label)) continue;
    seen.add(label);
    suggestions.push({
      label,
      confidence:
        typeof confidence === 'number' && Number.isFinite(confidence)
          ? Math.min(1, Math.max(0, confidence))
          : 0,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim() : 'suggested by Claude',
    });
    if (suggestions.length === LABEL_SUGGESTION_COUNT) break;
  }

  return suggestions;
}
