import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 does not await a handler's promise, so a rejection inside an async
 * route would become an unhandled rejection instead of a response. This
 * forwards it to the error middleware.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
