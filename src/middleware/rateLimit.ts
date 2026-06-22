import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { AUTH_RATE_LIMIT_MAX, AUTH_RATE_LIMIT_WINDOW_MS } from '../config/constants';
import { ApiError } from '../lib/errors';

/**
 * Throttle `/api/auth/*`. Signup and login are the only endpoints where an
 * unauthenticated caller can make the server do expensive work (a bcrypt
 * comparison) and where guessing is worth something.
 *
 * The limiter is in-process, which is the honest limit of this approach: with
 * more than one instance behind a load balancer each gets its own counter.
 * A shared store is the upgrade, and it is a constructor argument away.
 */
export function authRateLimiter(enabled: boolean): RateLimitRequestHandler {
  return rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    limit: AUTH_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Disabled under test so a suite of auth cases does not trip the limiter.
    skip: () => !enabled,
    handler: (_req, _res, next) => {
      next(ApiError.tooManyRequests('Too many authentication attempts, try again later'));
    },
  });
}
