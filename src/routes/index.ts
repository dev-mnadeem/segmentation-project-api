import { Router } from 'express';
import type { AppServices } from '../container';
import type { AuthOptions } from '../middleware/auth';
import { healthRoutes, type HealthProbe } from './health';
import { authRoutes } from './auth';
import { projectRoutes } from './projects';
import { imageRoutes } from './images';
import { annotationRoutes } from './annotations';

export interface ApiRouterOptions {
  services: AppServices;
  auth: AuthOptions;
  probe: HealthProbe;
  rateLimitEnabled: boolean;
}

export function apiRouter(options: ApiRouterOptions): Router {
  const router = Router();

  router.use('/health', healthRoutes(options.probe));
  router.use('/auth', authRoutes(options.services.auth, options.rateLimitEnabled));
  router.use('/projects', projectRoutes(options));
  router.use('/images', imageRoutes(options.services.images));
  router.use('/annotations', annotationRoutes(options));

  return router;
}
