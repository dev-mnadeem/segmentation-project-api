import type { Env } from '../config/env';
import type { Logger } from '../lib/logger';
import { AnthropicLabelSuggester } from './anthropicSuggester';
import { HeuristicLabelSuggester } from './heuristicSuggester';
import type { LabelSuggester } from './types';

export * from './types';
export { HeuristicLabelSuggester } from './heuristicSuggester';
export { AnthropicLabelSuggester, parseSuggestions } from './anthropicSuggester';
export { extractFeatures, featureDistance } from './features';

/**
 * Pick a suggester from configuration. The heuristic is the default, so the
 * repository runs end to end with no API key; `LABEL_SUGGESTER=anthropic`
 * swaps in the model and keeps the heuristic as its fallback.
 */
export function createLabelSuggester(env: Env, logger: Logger): LabelSuggester {
  const heuristic = new HeuristicLabelSuggester();
  if (env.LABEL_SUGGESTER !== 'anthropic' || !env.ANTHROPIC_API_KEY) {
    return heuristic;
  }
  return new AnthropicLabelSuggester({
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.ANTHROPIC_MODEL,
    logger,
    fallback: heuristic,
  });
}
