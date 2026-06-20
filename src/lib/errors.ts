/**
 * The single error type the HTTP layer understands. Services throw these;
 * `errorHandler` turns them into a response. Anything else that reaches the
 * handler is treated as a bug and reported as a 500 without leaking its text.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'bad_request', message, details);
  }

  static validation(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'validation_error', message, details);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, 'unauthorized', message);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, 'forbidden', message);
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, 'not_found', message);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, 'conflict', message, details);
  }

  static payloadTooLarge(message: string): ApiError {
    return new ApiError(413, 'payload_too_large', message);
  }

  static tooManyRequests(message = 'Too many requests'): ApiError {
    return new ApiError(429, 'rate_limited', message);
  }

  static serviceUnavailable(message: string, details?: unknown): ApiError {
    return new ApiError(503, 'service_unavailable', message, details);
  }
}

/** True for a MongoDB unique-index violation, whatever driver wrapped it. */
export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}
