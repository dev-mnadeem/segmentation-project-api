import type { Request, RequestHandler, Response } from 'express';
import type { AuthService } from '../services/AuthService';
import { asyncHandler } from '../utils/asyncHandler';
import type { LoginBody, SignupBody } from '../validation/schemas';

/**
 * Controllers are deliberately three lines each: pull the already-validated
 * input off the request, call one service method, choose a status code.
 * Nothing here knows about Mongo, Zod or JWTs.
 */
export function authController(service: AuthService): {
  signup: RequestHandler;
  login: RequestHandler;
} {
  return {
    signup: asyncHandler(async (req: Request, res: Response) => {
      res.status(201).json(await service.signup(req.body as SignupBody));
    }),

    login: asyncHandler(async (req: Request, res: Response) => {
      res.json(await service.login(req.body as LoginBody));
    }),
  };
}
