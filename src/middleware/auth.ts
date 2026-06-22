import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '../domain/models';
import { ApiError } from '../lib/errors';

interface AccessTokenClaims {
  sub: string;
  email: string;
  role: UserRole;
  name?: string;
}

export interface AuthOptions {
  jwtSecret?: string;
  authRequired: boolean;
}

/**
 * Verify a bearer token if one is present.
 *
 * A malformed or expired token is an error, not an absent user: the previous
 * behaviour swallowed the failure and continued anonymously, so a caller whose
 * token had expired silently lost their `createdBy` attribution and saw a 401
 * only when `AUTH_REQUIRED` happened to be on.
 */
export function attachUser(options: AuthOptions): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (!token) return next();

    if (!options.jwtSecret) {
      return next(ApiError.serviceUnavailable('Bearer token supplied but JWT_SECRET is unset'));
    }

    try {
      const claims = jwt.verify(token, options.jwtSecret) as AccessTokenClaims;
      req.user = {
        id: claims.sub,
        email: claims.email,
        role: claims.role,
        name: claims.name,
      };
      next();
    } catch (error) {
      // `errorHandler` turns TokenExpiredError / JsonWebTokenError into a 401.
      next(error);
    }
  };
}

/** Reject anonymous callers, but only when `AUTH_REQUIRED` is on. */
export function requireAuth(options: AuthOptions): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!options.authRequired) return next();
    if (req.user?.id) return next();
    next(ApiError.unauthorized('This endpoint requires a Bearer token'));
  };
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || Array.isArray(header)) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
  return token?.trim() || null;
}
