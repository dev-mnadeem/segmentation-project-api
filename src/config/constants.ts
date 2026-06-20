/**
 * Named values that would otherwise be magic numbers scattered through the code.
 * Anything a reviewer might want to tune lives here or in `env.ts`.
 */

/** bcrypt cost factor used when hashing a signup password. */
export const PASSWORD_HASH_ROUNDS = 10;

/** Lifetime of an issued access token, in the format `jsonwebtoken` expects. */
export const ACCESS_TOKEN_TTL = '12h';

/** Minimum password length accepted at signup. */
export const MIN_PASSWORD_LENGTH = 8;

/** Default page size for any paginated list endpoint. */
export const DEFAULT_PAGE_SIZE = 20;

/** Hard ceiling on `?limit=`, so a caller cannot ask for the whole collection. */
export const MAX_PAGE_SIZE = 100;

/**
 * Hard ceiling on `?page=`. Offset pagination degrades badly at high skip
 * values, so we refuse rather than run a slow query.
 */
export const MAX_PAGE_NUMBER = 10_000;

/** Largest JSON body accepted. RLE `counts` arrays can be long. */
export const MAX_REQUEST_BODY = '10mb';

/** Maximum images accepted in one bulk-create call. */
export const MAX_IMAGES_PER_BULK_INSERT = 500;

/** Maximum annotations returned by the export endpoint in one response. */
export const MAX_EXPORT_ANNOTATIONS = 5_000;

/** Maximum distinct annotators reported by `GET /projects/:id/stats`. */
export const MAX_ANNOTATORS_IN_STATS = 100;

/** Tolerance when comparing a client-supplied area to the server-computed one. */
export const AREA_COMPARISON_EPSILON = 1e-6;

/** Number of label candidates a suggester returns. */
export const LABEL_SUGGESTION_COUNT = 3;

/** How many recent annotations the heuristic suggester learns shapes from. */
export const LABEL_SUGGESTION_SAMPLE_SIZE = 200;

/** Grace period for in-flight requests when SIGTERM arrives, in milliseconds. */
export const SHUTDOWN_GRACE_MS = 10_000;

/** Auth rate-limit window, in milliseconds. */
export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Requests allowed per IP per window on `/api/auth/*`. */
export const AUTH_RATE_LIMIT_MAX = 20;
