import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError, isDuplicateKeyError } from '../lib/errors';
import type { Logger } from '../lib/logger';

/**
 * Every error response has the same body:
 *
 *   { "error": { "code": string, "message": string, "details"?: unknown,
 *                "requestId"?: string } }
 *
 * `code` is the stable, machine-readable half; `message` is for a human.
 */
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export function notFoundHandler(): RequestHandler {
  return (req: Request, res: Response<ErrorBody>) => {
    res.status(404).json({
      error: {
        code: 'not_found',
        message: `No route matches ${req.method} ${req.originalUrl}`,
        requestId: requestId(req),
      },
    });
  };
}

export function errorHandler(logger: Logger, exposeInternals: boolean): ErrorRequestHandler {
  return (error: unknown, req: Request, res: Response<ErrorBody>, next: NextFunction) => {
    // Headers already flushed: only the transport can decide what to do next.
    if (res.headersSent) return next(error);

    const apiError = normalise(error);

    if (apiError.status >= 500) {
      logger.error({ err: error, path: req.originalUrl }, 'Unhandled error');
    } else {
      logger.warn(
        { code: apiError.code, message: apiError.message, path: req.originalUrl },
        'Request rejected',
      );
    }

    const isInternal = apiError.status >= 500;
    res.status(apiError.status).json({
      error: {
        code: apiError.code,
        // Never echo an unexpected exception's text to a client in production;
        // it is the classic way stack details and query fragments escape.
        message: isInternal && !exposeInternals ? 'Internal Server Error' : apiError.message,
        details: isInternal && !exposeInternals ? undefined : apiError.details,
        requestId: requestId(req),
      },
    });
  };
}

/** Map every error we know how to recognise onto an `ApiError`. */
function normalise(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.validation(
      'Validation error',
      error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    );
  }

  if (isDuplicateKeyError(error)) {
    return ApiError.conflict('A record with these values already exists');
  }

  const named = error as { name?: string; message?: string; type?: string; status?: number };

  // Mongoose rejects a malformed id at query time. Without this it surfaces as
  // a 500 even though the caller sent a bad value.
  if (named?.name === 'CastError') {
    return ApiError.badRequest('Malformed identifier in request');
  }
  if (named?.name === 'ValidationError') {
    return ApiError.validation('Validation error');
  }
  if (named?.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Access token has expired');
  }
  if (named?.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('Access token is invalid');
  }
  // body-parser marks an oversized or unparseable body with these.
  if (named?.type === 'entity.too.large') {
    return ApiError.payloadTooLarge('Request body is too large');
  }
  if (named?.type === 'entity.parse.failed') {
    return ApiError.badRequest('Request body is not valid JSON');
  }

  return new ApiError(500, 'internal_error', named?.message || 'Internal Server Error');
}

function requestId(req: Request): string | undefined {
  const id = (req as Request & { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}
