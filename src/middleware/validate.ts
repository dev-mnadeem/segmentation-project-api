import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { ApiError } from '../lib/errors';

export interface RequestSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Parse and replace `req.body` / `req.query` / `req.params` with the schema
 * output, so a controller reads typed, defaulted values and never re-checks
 * presence. A failure becomes a 400 naming every offending field at once,
 * rather than the first one.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        // `req.query` has only a getter on Express 5-style setups; assigning to
        // the property directly is not safe, so redefine it.
        Object.defineProperty(req, 'query', {
          value: schemas.query.parse(req.query),
          configurable: true,
          enumerable: true,
          writable: true,
        });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      next(
        error instanceof ZodError ? ApiError.validation('Validation error', issues(error)) : error,
      );
    }
  };
}

function issues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}
