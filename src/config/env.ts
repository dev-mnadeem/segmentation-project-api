import { z } from 'zod';

/**
 * A string that means "off". Note that `z.coerce.boolean()` is NOT usable here:
 * it delegates to `Boolean(value)`, and `Boolean('false') === true`, so every
 * non-empty string — including the literal `"false"` — would enable the flag.
 */
const booleanFromEnv = (defaultValue: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'])
    .transform((v) => v === 'true' || v === '1' || v === 'yes' || v === 'on')
    .or(z.boolean())
    .default(defaultValue);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65_535).default(7151),

    /** `mongo` talks to MongoDB. `memory` runs the API entirely in-process. */
    PERSISTENCE: z.enum(['mongo', 'memory']).default('mongo'),
    MONGODB_URI: z.string().min(1).optional(),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    JWT_SECRET: z.string().min(16).optional(),
    AUTH_REQUIRED: booleanFromEnv(false),

    /** `heuristic` needs no network. `anthropic` needs ANTHROPIC_API_KEY. */
    LABEL_SUGGESTER: z.enum(['heuristic', 'anthropic']).default('heuristic'),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_MODEL: z.string().min(1).default('claude-opus-5'),

    CORS_ORIGIN: z.string().default('*'),
  })
  .superRefine((value, ctx) => {
    if (value.PERSISTENCE === 'mongo' && !value.MONGODB_URI) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MONGODB_URI'],
        message: 'MONGODB_URI is required when PERSISTENCE=mongo',
      });
    }
    if (value.AUTH_REQUIRED && !value.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET is required when AUTH_REQUIRED is enabled',
      });
    }
    if (value.LABEL_SUGGESTER === 'anthropic' && !value.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ANTHROPIC_API_KEY'],
        message: 'ANTHROPIC_API_KEY is required when LABEL_SUGGESTER=anthropic',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Parse an environment bag. Exported so tests can exercise it without `process.env`. */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse({
    NODE_ENV: source.NODE_ENV,
    PORT: source.PORT,
    PERSISTENCE: source.PERSISTENCE,
    MONGODB_URI: source.MONGODB_URI,
    LOG_LEVEL: source.LOG_LEVEL,
    JWT_SECRET: source.JWT_SECRET,
    AUTH_REQUIRED: source.AUTH_REQUIRED,
    LABEL_SUGGESTER: source.LABEL_SUGGESTER,
    ANTHROPIC_API_KEY: source.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: source.ANTHROPIC_MODEL,
    CORS_ORIGIN: source.CORS_ORIGIN,
  });

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration -> ${detail}`);
  }
  return result.data;
}
