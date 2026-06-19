import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authRateLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { AuthService } from '../services/AuthService';
import { loginBodyZ, signupBodyZ } from '../validation/schemas';

export function authRoutes(service: AuthService, rateLimitEnabled: boolean): Router {
  const router = Router();
  const controller = authController(service);

  router.use(authRateLimiter(rateLimitEnabled));
  router.post('/signup', validate({ body: signupBodyZ }), controller.signup);
  router.post('/login', validate({ body: loginBodyZ }), controller.login);

  return router;
}
